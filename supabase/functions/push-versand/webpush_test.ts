// webpush_test.ts — Nachweis, dass der Versand in Deno wirklich nach RFC 8291/8188/8292 verschlüsselt:
//  1. byte-genauer Treffer auf den Testvektor aus RFC 8291 Anhang A,
//  2. Entschlüsselung des echten Versands mit einer unabhängigen Implementierung (npm:http_ece,
//     Referenz-Bibliothek des Web-Push-Ökosystems, selbst am RFC-Vektor geeicht),
//  3. Prüfung aller Header und des VAPID-JWT gegen einen lokalen Mock-Push-Endpoint.
import { assert, assertEquals, assertNotEquals, assertRejects } from '@std/assert';
import { decodeBase64Url, encodeBase64Url } from '@std/encoding/base64url';
import { Buffer } from 'node:buffer';
import { createECDH } from 'node:crypto';
import ece from 'npm:http_ece@1.2.1';
import {
	absenderSchluesselErzeugen,
	klassifizieren,
	oeffentlicherHttpsEndpoint,
	type SenderConfig,
	senderErstellen,
	verschluesseln,
} from './webpush.ts';
import type { Abo } from './typen.ts';

const SUBJECT = 'https://taskfuchs.example.test';

// --- Hilfen -----------------------------------------------------------------------------------

/** Erzeugt ein VAPID-Paar im Format von `web-push generate-vapid-keys` (base64url, 65 + 32 Byte). */
async function neuesVapidPaar(): Promise<{ publicKey: string; privateKey: string }> {
	const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
	const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
	const pub = new Uint8Array(65);
	pub[0] = 0x04;
	pub.set(decodeBase64Url(jwk.x!), 1);
	pub.set(decodeBase64Url(jwk.y!), 33);
	return { publicKey: encodeBase64Url(pub), privateKey: jwk.d! };
}

/** Empfänger (Browser-Seite): ECDH-Schlüsselpaar + 16-Byte-Auth-Secret, wie ein PushSubscription-Objekt. */
function neuerEmpfaenger(endpoint: string) {
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	const authSecret = crypto.getRandomValues(new Uint8Array(16));
	const abo: Abo = {
		endpoint,
		p256dh: encodeBase64Url(ecdh.getPublicKey()),
		auth: encodeBase64Url(authSecret),
	};
	return { abo, ecdh };
}

interface Aufgenommen {
	method: string;
	headers: Headers;
	body: Uint8Array;
	url: string;
}

/** Lokaler Mock-Push-Dienst; antwortet mit `status` und nimmt jede Anfrage auf. */
function mockPushDienst(status = 201, haengen = false) {
	const aufgenommen: Aufgenommen[] = [];
	const ac = new AbortController();
	const server = Deno.serve(
		{ hostname: '127.0.0.1', port: 0, signal: ac.signal, onListen: () => {} },
		async (req) => {
			aufgenommen.push({
				method: req.method,
				headers: req.headers,
				body: new Uint8Array(await req.arrayBuffer()),
				url: req.url,
			});
			if (haengen) await new Promise((r) => ac.signal.addEventListener('abort', r));
			return new Response(null, { status });
		},
	);
	const origin = `http://127.0.0.1:${server.addr.port}`;
	return {
		origin,
		endpoint: `${origin}/push/abc123`,
		aufgenommen,
		async schliessen() {
			ac.abort();
			await server.finished;
		},
	};
}

function jwtTeile(authorization: string): { jwt: string; k: string } {
	const m = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(authorization);
	assert(m, `Authorization hat nicht das Format "vapid t=<jwt>, k=<key>"`);
	return { jwt: m[1], k: m[2] };
}

/** Sender für Tests: der Mock läuft auf http://127.0.0.1, die Produktions-Endpointprüfung wird ersetzt. */
async function testSender(extra: Partial<SenderConfig> = {}) {
	return senderErstellen({
		...(await neuesVapidPaar()),
		subject: SUBJECT,
		endpointPruefung: () => true,
		...extra,
	});
}

// --- klassifizieren ---------------------------------------------------------------------------

Deno.test('klassifizieren: 2xx ok, 404/410 weg, sonst fehler', () => {
	for (const s of [200, 201, 202, 204]) assertEquals(klassifizieren(s), 'ok', `Status ${s}`);
	for (const s of [404, 410]) assertEquals(klassifizieren(s), 'weg', `Status ${s}`);
	for (const s of [400, 401, 403, 413, 429, 500, 502, 503, 301, 0]) {
		assertEquals(klassifizieren(s), 'fehler', `Status ${s}`);
	}
});

// --- Krypto-Nachweis --------------------------------------------------------------------------

Deno.test('RFC-8291-Testvektor: die Referenz-Entschlüsselung ist in Deno vertrauenswürdig', () => {
	// RFC 8291, Anhang A. Gesichert: unser Prüfwerkzeug (http_ece) liefert hier den bekannten Klartext.
	const ecdh = createECDH('prime256v1');
	ecdh.setPrivateKey(Buffer.from('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94', 'base64url'));
	const body = Buffer.from(
		'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
		'base64url',
	);
	const klar = ece.decrypt(body, { version: 'aes128gcm', privateKey: ecdh, authSecret: 'BTBZMqHH6r4Tts7J_aSIgg' });
	assertEquals(klar.toString('utf8'), 'When I grow up, I want to be a watermelon');
});

Deno.test('verschluesseln: byte-genauer Treffer auf den RFC-8291-Testvektor (Anhang A)', async () => {
	// Alle Schlüssel und Salts dieses Tests sind die öffentlich dokumentierten Testwerte aus RFC 8291 Anhang A
	// (keine echten Geheimnisse).
	const b64 = (s: string) => decodeBase64Url(s);
	const erwartet = b64(
		'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
	);
	// Der öffentliche Absender-Schlüssel des Vektors steht als keyid (Byte 21..85) im Kopf des erwarteten Bodys.
	const asPublic = erwartet.slice(21, 86);
	assertEquals(asPublic.length, 65);
	const asPrivate = await crypto.subtle.importKey(
		'jwk',
		{
			kty: 'EC',
			crv: 'P-256',
			d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
			x: encodeBase64Url(asPublic.slice(1, 33)),
			y: encodeBase64Url(asPublic.slice(33, 65)),
		},
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		['deriveBits'],
	);
	const body = await verschluesseln(
		new TextEncoder().encode('When I grow up, I want to be a watermelon'),
		b64('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
		b64('BTBZMqHH6r4Tts7J_aSIgg'),
		{ privateKey: asPrivate, publicRaw: asPublic },
		b64('DGv6ra1nlYgDCS1FRnbzlw'),
	);
	assertEquals(encodeBase64Url(body), encodeBase64Url(erwartet));
});

Deno.test('verschluesseln: ungültige Abo-Schlüssel und zu große Payloads werden abgelehnt', async () => {
	const { abo } = neuerEmpfaenger('https://push.example.test/x');
	const p256dh = decodeBase64Url(abo.p256dh);
	const auth = decodeBase64Url(abo.auth);
	const klar = new TextEncoder().encode('x');
	await assertRejects(() => verschluesseln(klar, p256dh.slice(0, 64), auth), Error, 'Abo-Schlüssel');
	await assertRejects(
		() => verschluesseln(klar, Uint8Array.of(0x02, ...p256dh.slice(1)), auth),
		Error,
		'Abo-Schlüssel',
	);
	await assertRejects(() => verschluesseln(klar, p256dh, auth.slice(0, 15)), Error, 'Auth-Secret');
	await assertRejects(() => verschluesseln(new Uint8Array(4080), p256dh, auth), Error, 'zu groß');
	// Grenzfall: größte passende Payload (4096 - 17 Byte) geht durch und ist entschlüsselbar
	const gross = new Uint8Array(4079).fill(0x61);
	const empf = neuerEmpfaenger('https://push.example.test/x');
	const body = await verschluesseln(gross, decodeBase64Url(empf.abo.p256dh), decodeBase64Url(empf.abo.auth));
	const klarGross = ece.decrypt(Buffer.from(body), {
		version: 'aes128gcm',
		privateKey: empf.ecdh,
		authSecret: empf.abo.auth,
	});
	assertEquals(klarGross.length, 4079);
	assert((await absenderSchluesselErzeugen()).publicRaw.length === 65);
});

Deno.test('senden: Payload wird nachweislich aes128gcm-verschlüsselt und ist unabhängig entschlüsselbar', async () => {
	const mock = mockPushDienst(201);
	try {
		const vapid = await neuesVapidPaar();
		const sender = await testSender(vapid);
		const { abo, ecdh } = neuerEmpfaenger(mock.endpoint);
		const klartext = JSON.stringify({
			titel: 'Einkaufen',
			text: 'Anna hat „Hafermilch & Käse“ in den Wagen gelegt 🥛',
			tag: 'tf-l-a',
			url: '/app?liste=l',
		});

		const status = await sender.senden(abo, klartext);
		assertEquals(status, 201);
		assertEquals(mock.aufgenommen.length, 1);
		const req = mock.aufgenommen[0];

		// Transport
		assertEquals(req.method, 'POST');
		assertEquals(new URL(req.url).pathname, '/push/abc123');
		assertEquals(req.headers.get('content-encoding'), 'aes128gcm');
		assertEquals(req.headers.get('ttl'), '21600');
		assertEquals(req.headers.get('urgency'), 'normal');
		assertEquals(req.headers.get('content-type'), 'application/octet-stream');

		// Körper ist verschlüsselt: kein Klartext, kein JSON
		const koerper = Buffer.from(req.body);
		assert(!koerper.includes('Hafermilch'), 'Klartext im Körper gefunden');
		assert(!koerper.includes('Einkaufen'), 'Klartext im Körper gefunden');

		// RFC 8188 Header: salt(16) | rs(4, BE) | idlen(1) | keyid (= 65 Byte unkomprimierter AS-Schlüssel)
		assertEquals(koerper[20], 65);
		assertEquals(koerper[21], 0x04);
		assertEquals(koerper.readUInt32BE(16), 4096, 'Record size');

		// Unabhängige Entschlüsselung (RFC 8291 mit Empfängerschlüssel + Auth-Secret)
		const klar = ece.decrypt(koerper, { version: 'aes128gcm', privateKey: ecdh, authSecret: abo.auth });
		assertEquals(klar.toString('utf8'), klartext);
	} finally {
		await mock.schliessen();
	}
});

Deno.test('senden: falscher Empfänger kann nicht entschlüsseln', async () => {
	const mock = mockPushDienst(201);
	try {
		const sender = await testSender();
		const { abo } = neuerEmpfaenger(mock.endpoint);
		const fremd = neuerEmpfaenger(mock.endpoint);
		await sender.senden(abo, 'geheim');
		let geworfen = false;
		try {
			ece.decrypt(Buffer.from(mock.aufgenommen[0].body), {
				version: 'aes128gcm',
				privateKey: fremd.ecdh,
				authSecret: fremd.abo.auth,
			});
		} catch {
			geworfen = true;
		}
		assert(geworfen, 'Fremder Empfänger konnte entschlüsseln');
	} finally {
		await mock.schliessen();
	}
});

Deno.test('senden: VAPID-JWT (ES256) ist gültig signiert, aud/sub/exp stimmen', async () => {
	const mock = mockPushDienst(201);
	try {
		const vapid = await neuesVapidPaar();
		const sender = await testSender(vapid);
		const { abo } = neuerEmpfaenger(mock.endpoint);
		const vorher = Math.floor(Date.now() / 1000);
		await sender.senden(abo, 'x');

		const { jwt, k } = jwtTeile(mock.aufgenommen[0].headers.get('authorization')!);
		assertEquals(k, vapid.publicKey, 'k muss der öffentliche VAPID-Schlüssel sein');

		const [kopf, nutzlast, signatur] = jwt.split('.');
		const dec = new TextDecoder();
		assertEquals(JSON.parse(dec.decode(decodeBase64Url(kopf))), { typ: 'JWT', alg: 'ES256' });
		const claims = JSON.parse(dec.decode(decodeBase64Url(nutzlast)));
		assertEquals(claims.aud, mock.origin, 'aud = Origin des Endpoints');
		assertEquals(claims.sub, SUBJECT);
		assert(claims.exp > vorher, 'exp liegt in der Zukunft');
		assert(claims.exp <= vorher + 24 * 3600, 'exp höchstens 24 h');

		const pub = await crypto.subtle.importKey(
			'raw',
			decodeBase64Url(vapid.publicKey),
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify'],
		);
		const sig = decodeBase64Url(signatur);
		assertEquals(sig.length, 64, 'ES256-Signatur ist r||s mit 64 Byte');
		const gueltig = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			pub,
			sig,
			new TextEncoder().encode(`${kopf}.${nutzlast}`),
		);
		assert(gueltig, 'JWT-Signatur ungültig');

		// Gegenprobe: mit einem anderen öffentlichen Schlüssel darf die Signatur nicht passen
		const anderer = await crypto.subtle.importKey(
			'raw',
			decodeBase64Url((await neuesVapidPaar()).publicKey),
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify'],
		);
		assert(
			!(await crypto.subtle.verify(
				{ name: 'ECDSA', hash: 'SHA-256' },
				anderer,
				sig,
				new TextEncoder().encode(`${kopf}.${nutzlast}`),
			)),
		);
	} finally {
		await mock.schliessen();
	}
});

Deno.test('senden: jede Nachricht bekommt frisches Salt und frischen Absender-Schlüssel', async () => {
	const mock = mockPushDienst(201);
	try {
		const sender = await testSender();
		const { abo, ecdh } = neuerEmpfaenger(mock.endpoint);
		await sender.senden(abo, 'gleicher Text');
		await sender.senden(abo, 'gleicher Text');
		const [a, b] = mock.aufgenommen.map((r) => Buffer.from(r.body));
		assertNotEquals(a.subarray(0, 16).toString('hex'), b.subarray(0, 16).toString('hex'), 'Salt wiederverwendet');
		assertNotEquals(
			a.subarray(21, 86).toString('hex'),
			b.subarray(21, 86).toString('hex'),
			'AS-Schlüssel wiederverwendet',
		);
		assertNotEquals(a.toString('hex'), b.toString('hex'));
		for (const body of [a, b]) {
			const klar = ece.decrypt(body, { version: 'aes128gcm', privateKey: ecdh, authSecret: abo.auth });
			assertEquals(klar.toString('utf8'), 'gleicher Text');
		}
	} finally {
		await mock.schliessen();
	}
});

// --- Status-Weitergabe, Netzfehler, Timeout -----------------------------------------------------

for (
	const [status, erwartet] of [[410, 'weg'], [404, 'weg'], [413, 'fehler'], [429, 'fehler'], [500, 'fehler']] as const
) {
	Deno.test(`senden: Antwort ${status} wird als Status geliefert und als ${erwartet} klassifiziert`, async () => {
		const mock = mockPushDienst(status);
		try {
			const sender = await testSender();
			const { abo } = neuerEmpfaenger(mock.endpoint);
			const s = await sender.senden(abo, 'x');
			assertEquals(s, status);
			assertEquals(klassifizieren(s), erwartet);
		} finally {
			await mock.schliessen();
		}
	});
}

Deno.test('senden: Netzfehler wirft (Endpoint nicht erreichbar)', async () => {
	// Port reservieren und sofort wieder freigeben -> Verbindung wird abgelehnt
	const l = Deno.listen({ hostname: '127.0.0.1', port: 0 });
	const port = (l.addr as Deno.NetAddr).port;
	l.close();
	const sender = await testSender();
	const { abo } = neuerEmpfaenger(`http://127.0.0.1:${port}/x`);
	await assertRejects(() => sender.senden(abo, 'x'));
});

Deno.test('senden: Zeitüberschreitung wirft', async () => {
	const mock = mockPushDienst(201, true);
	try {
		const sender = await testSender({ timeoutMs: 150 });
		const { abo } = neuerEmpfaenger(mock.endpoint);
		await assertRejects(() => sender.senden(abo, 'x'), Error, 'Zeitüberschreitung');
	} finally {
		await mock.schliessen();
	}
});

Deno.test('senden: Abbruch über das Signal (Gesamtbudget des Laufs) beendet hängende Sendungen sofort', async () => {
	const mock = mockPushDienst(201, true);
	try {
		const sender = await testSender({ timeoutMs: 10_000 }); // eigene Frist wäre viel länger als der Abbruch
		const { abo } = neuerEmpfaenger(mock.endpoint);
		const ac = new AbortController();
		setTimeout(() => ac.abort(), 50);
		const start = performance.now();
		await assertRejects(() => sender.senden(abo, 'x', ac.signal), Error, 'Zeitüberschreitung');
		assert(performance.now() - start < 1000, 'Abbruch muss sofort greifen, nicht erst nach der Frist');
		// bereits abgebrochenes Signal: es geht gar nichts mehr hinaus
		const schon = new AbortController();
		schon.abort();
		const vorher = mock.aufgenommen.length;
		await assertRejects(() => sender.senden(abo, 'x', schon.signal), Error, 'Zeitüberschreitung');
		assertEquals(mock.aufgenommen.length, vorher);
	} finally {
		await mock.schliessen();
	}
});

// --- Endpoint-Prüfung (SSRF-Schutz) ---------------------------------------------------------------

Deno.test('Endpoint-Prüfung: nur bekannte Push-Dienste auf Port 443 (Allowlist)', () => {
	for (
		const ok of [
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://fcm.googleapis.com/wp/abc',
			'https://FCM.GOOGLEAPIS.COM/fcm/send/abc', // Hostnamen sind nicht schreibungsabhängig
			'https://fcm.googleapis.com:443/fcm/send/abc', // expliziter Standardport
			'https://updates.push.services.mozilla.com/wpush/v2/xyz',
			'https://wns2-par02p.notify.windows.com/w/?token=abc',
			'https://web.push.apple.com/Qx',
		]
	) assertEquals(oeffentlicherHttpsEndpoint(new URL(ok)), true, ok);
});

Deno.test('Endpoint-Prüfung: http, localhost, interne Namen, IP-Adressen, fremde Ports und Umgehungen werden abgelehnt', () => {
	for (
		const schlecht of [
			// Protokoll, Zugangsdaten
			'http://fcm.googleapis.com/fcm/send/abc',
			'https://user:pw@fcm.googleapis.com/x',
			'https://fcm.googleapis.com@evil.example/x',
			// localhost in allen Schreibweisen (Trailing Dot, Prozent-Kodierung)
			'https://localhost/x',
			'https://localhost./x',
			'https://%6c%6f%63%61%6c%68%6f%73%74./x',
			'https://foo.localhost/x',
			// IP-Literale
			'https://127.0.0.1/x',
			'https://10.0.0.5/x',
			'https://169.254.169.254/latest',
			'https://2130706433/x',
			'https://[::1]/x',
			'https://[fd00::1]/x',
			// interne und DNS-umgebogene Namen
			'https://intern/x',
			'https://x.internal/x',
			'https://metadata.google.internal/',
			'https://instance-data.ec2.internal/',
			'https://kubernetes.default.svc/',
			'https://host.docker.internal/',
			'https://127.0.0.1.nip.io/x',
			'https://localtest.me/',
			// richtiger Dienst, aber falscher Port oder angehängte/vorangestellte Domain
			'https://fcm.googleapis.com:6379/',
			'https://fcm.googleapis.com:8443/fcm/send/abc',
			'https://fcm.googleapis.com./fcm/send/abc',
			'https://fcm.googleapis.com.evil.example/x',
			'https://evilfcm.googleapis.com/x',
			'https://evil.example/fcm.googleapis.com',
			// Windows: nur Unterdomains von notify.windows.com
			'https://notify.windows.com/x',
			'https://evilnotify.windows.com/x',
			'https://notify.windows.com.evil.example/x',
			'https://.notify.windows.com/x',
		]
	) assertEquals(oeffentlicherHttpsEndpoint(new URL(schlecht)), false, schlecht);
});

Deno.test('senden: unzulässiger Endpoint wird nicht angefragt und wirft ohne den Endpoint zu nennen', async () => {
	const mock = mockPushDienst(201);
	try {
		const sender = await senderErstellen({ ...(await neuesVapidPaar()), subject: SUBJECT }); // Standardprüfung
		const { abo } = neuerEmpfaenger(mock.endpoint); // http://127.0.0.1:…
		const fehler = await assertRejects(() => sender.senden(abo, 'x'), Error, 'Endpoint nicht erlaubt');
		assert(!fehler.message.includes('127.0.0.1'));
		await assertRejects(() => sender.senden({ ...abo, endpoint: 'kein url' }, 'x'), Error, 'Endpoint nicht erlaubt');
		assertEquals(mock.aufgenommen.length, 0, 'es darf keine Anfrage hinausgehen');
		// Umgehung des früheren Negativfilters: Trailing Dot und Prozent-Kodierung führten trotzdem auf den Loopback
		for (const host of ['localhost.', '%6c%6f%63%61%6c%68%6f%73%74.']) {
			const e = `https://${host}:${new URL(mock.endpoint).port}/push/abc123`;
			await assertRejects(() => sender.senden({ ...abo, endpoint: e }, 'x'), Error, 'Endpoint nicht erlaubt');
		}
	} finally {
		await mock.schliessen();
	}
});

Deno.test('senden: Redirects werden nicht verfolgt, die 3xx-Antwort ist ein Fehler', async () => {
	const ziel = mockPushDienst(201);
	const ac = new AbortController();
	const umleiter = Deno.serve(
		{ hostname: '127.0.0.1', port: 0, signal: ac.signal, onListen: () => {} },
		() => new Response(null, { status: 307, headers: { location: `${ziel.origin}/anders` } }),
	);
	try {
		const sender = await testSender();
		const { abo } = neuerEmpfaenger(`http://127.0.0.1:${umleiter.addr.port}/x`);
		const status = await sender.senden(abo, 'x');
		assertEquals(status, 307);
		assertEquals(klassifizieren(status), 'fehler');
		assertEquals(ziel.aufgenommen.length, 0, 'Redirect wurde verfolgt');
	} finally {
		ac.abort();
		await umleiter.finished;
		await ziel.schliessen();
	}
});

Deno.test('senden: kaputte Abo-Schlüssel werfen neutral (kein Absturz, kein Endpoint in der Meldung)', async () => {
	const mock = mockPushDienst(201);
	try {
		const sender = await testSender();
		const { abo } = neuerEmpfaenger(mock.endpoint);
		const fehler = await assertRejects(() => sender.senden({ ...abo, p256dh: '!!!' }, 'x'), Error);
		assert(!fehler.message.includes('127.0.0.1'));
		await assertRejects(() => sender.senden({ ...abo, auth: 'AAAA' }, 'x'), Error);
		assertEquals(mock.aufgenommen.length, 0);
	} finally {
		await mock.schliessen();
	}
});

// --- Schlüsselprüfung ---------------------------------------------------------------------------

Deno.test('senderErstellen: ungültige oder unpassende VAPID-Schlüssel scheitern früh, ohne Schlüssel zu nennen', async () => {
	const ok = await neuesVapidPaar();
	const anderes = await neuesVapidPaar();
	const faelle: Array<[string, { publicKey: string; privateKey: string }]> = [
		['leer', { publicKey: '', privateKey: '' }],
		['kein base64url', { publicKey: '!!!', privateKey: '???' }],
		['Public zu kurz', { publicKey: ok.publicKey.slice(0, 40), privateKey: ok.privateKey }],
		['Private zu kurz', { publicKey: ok.publicKey, privateKey: ok.privateKey.slice(0, 20) }],
		['Paar passt nicht zusammen', { publicKey: ok.publicKey, privateKey: anderes.privateKey }],
	];
	for (const [name, schluessel] of faelle) {
		const fehler = await assertRejects(
			() => senderErstellen({ ...schluessel, subject: SUBJECT }),
			Error,
			'VAPID',
			name,
		);
		for (const geheim of [ok.privateKey, anderes.privateKey]) {
			assert(!fehler.message.includes(geheim), `${name}: Fehlermeldung enthält Schlüsselmaterial`);
		}
	}
});
