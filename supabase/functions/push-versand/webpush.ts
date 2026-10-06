// webpush.ts — Web-Push-Versand: RFC 8030 (Protokoll), RFC 8291 (Nachrichtenverschlüsselung),
// RFC 8188 (aes128gcm-Inhaltskodierung), RFC 8292 (VAPID).
//
// Bibliothekswahl und Grund: Keine Web-Push-Bibliothek, sondern WebCrypto direkt (Krypto-Kern
// etwa 50 Zeilen, keine Abhängigkeit außer @std/encoding). Geprüft wurden jsr:@negrel/webpush 0.5.0 und npm:web-push 3.6.7:
//  - @negrel/webpush bestand dieselben Krypto- und Header-Prüfungen (Erstlauf der Tests), liest aber den
//    Response-Body erfolgreicher Sendungen nie aus (Deno meldet ein Ressourcen-Leck) und erlaubt weder
//    Abbruch noch Zeitgrenze je Versand.
//  - npm:web-push spricht immer über node:https (lokaler Mock-Dienst nur mit TLS-Zertifikat testbar),
//    zieht fünf direkte Abhängigkeiten nach und läuft nur über die Node-Kompatibilitätsschicht.
// Nachweis der eigenen Verschlüsselung (webpush_test.ts): byte-genauer Treffer auf den RFC-8291-Testvektor,
// Entschlüsselung des echten Versands mit der unabhängigen Referenz-Implementierung npm:http_ece,
// Prüfung aller Header und des VAPID-JWT (ES256-Signatur, aud, sub, exp, k) gegen einen Mock-Push-Dienst.
import { decodeBase64Url, encodeBase64Url } from '@std/encoding/base64url';
import type { Abo } from './typen.ts';

export type Ergebnis = 'ok' | 'weg' | 'fehler';

/** 2xx ok; 404/410 = Abo existiert nicht mehr; alles andere ist ein (vorübergehender) Fehler. */
export function klassifizieren(status: number): Ergebnis {
	if (status >= 200 && status < 300) return 'ok';
	if (status === 404 || status === 410) return 'weg';
	return 'fehler';
}

export interface Sender {
	/**
	 * Liefert den HTTP-Status des Push-Dienstes; wirft bei Netzfehler, Zeitüberschreitung, Abbruch über `signal`
	 * (Gesamtbudget des Laufs) oder unzulässigem Endpoint. Fehlermeldungen enthalten nie den Endpoint.
	 */
	senden(abo: Abo, payload: string, signal?: AbortSignal): Promise<number>;
}

export interface SenderConfig {
	publicKey: string;
	privateKey: string;
	subject: string;
	timeoutMs?: number;
	/** Standard: nur bekannte Push-Dienste per https auf Port 443 (Allowlist). Nur für Tests ersetzen. */
	endpointPruefung?: (url: URL) => boolean;
}

const TTL_SEKUNDEN = 21600;
const STANDARD_FRIST_MS = 10_000;
const VAPID_GUELTIGKEIT_S = 12 * 3600; // RFC 8292: höchstens 24 h
const RECORD_SIZE = 4096;
const KOPF_BYTES = 21 + 65; // salt(16) + rs(4) + idlen(1) + keyid (Absender-Schlüssel, 65)
const TAG_UND_DELIMITER = 16 + 1;
/** RFC 8291 §4: Push-Dienste garantieren nur 4096 Byte Body; größter Klartext damit 4096 - 86 - 17 = 3993. */
const MAX_KLARTEXT = 4096 - KOPF_BYTES - TAG_UND_DELIMITER;
const ZEITUEBERSCHREITUNG = 'Zeitüberschreitung';
const enc = new TextEncoder();

// WebCrypto verlangt Uint8Array<ArrayBuffer> (kein SharedArrayBuffer).
type Bytes = Uint8Array<ArrayBuffer>;

// --- Verschlüsselung (RFC 8291 + RFC 8188, ein einzelner Record) ------------------------------

function verbinden(...teile: Bytes[]): Bytes {
	const aus = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
	let pos = 0;
	for (const t of teile) {
		aus.set(t, pos);
		pos += t.length;
	}
	return aus;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export interface AbsenderSchluessel {
	privateKey: CryptoKey;
	/** Unkomprimierter öffentlicher Punkt, 65 Byte. */
	publicRaw: Bytes;
}

/** Frischer ECDH-Schlüssel des Absenders (RFC 8291: je Nachricht neu). */
export async function absenderSchluesselErzeugen(): Promise<AbsenderSchluessel> {
	const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
	return { privateKey: kp.privateKey, publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) };
}

/**
 * Verschlüsselt `klartext` für ein Abo (p256dh = 65 Byte Empfänger-Schlüssel, auth = 16 Byte Secret) zu einem
 * aes128gcm-Body. Absender-Schlüssel und Salt sind nur für den Testvektor injizierbar.
 */
export async function verschluesseln(
	klartext: Bytes,
	p256dh: Bytes,
	auth: Bytes,
	absender?: AbsenderSchluessel,
	salt?: Bytes,
): Promise<Bytes> {
	if (p256dh.length !== 65 || p256dh[0] !== 0x04) throw new Error('Abo-Schlüssel ungültig');
	if (auth.length !== 16) throw new Error('Abo-Auth-Secret ungültig');
	if (klartext.length > MAX_KLARTEXT) throw new Error('Payload zu groß');

	const as = absender ?? (await absenderSchluesselErzeugen());
	const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(16));

	const uaKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));

	// RFC 8291 §3.4: IKM = HKDF(salt = auth_secret, ikm = ecdh_secret, info = "WebPush: info" 0x00 ua as, 32)
	const keyInfo = verbinden(enc.encode('WebPush: info\0'), p256dh, as.publicRaw);
	const ikm = await hkdf(auth, ecdh, keyInfo, 32);

	// RFC 8188 §2.2/2.3: CEK (16 Byte) und Nonce (12 Byte) aus Salt + IKM; Record 0 → Nonce unverändert
	const cek = await hkdf(saltBytes, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(saltBytes, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

	// Letzter Record: Klartext || 0x02, kein weiteres Padding
	const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const chiffre = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, verbinden(klartext, Uint8Array.of(0x02))),
	);

	// Kopf: salt(16) | rs(4, BE) | idlen(1) | keyid (= Absender-Schlüssel)
	const kopf = new Uint8Array(21);
	kopf.set(saltBytes, 0);
	new DataView(kopf.buffer).setUint32(16, RECORD_SIZE);
	kopf[20] = as.publicRaw.length;
	return verbinden(kopf, as.publicRaw, chiffre);
}

// --- VAPID (RFC 8292) -------------------------------------------------------------------------

function rohbytes(b64: string, laenge: number): Bytes {
	let bytes: Bytes;
	try {
		bytes = decodeBase64Url(b64);
	} catch {
		throw new Error('VAPID-Schlüssel ist kein gültiges base64url');
	}
	if (bytes.length !== laenge) throw new Error('VAPID-Schlüssel hat die falsche Länge');
	return bytes;
}

/** Baut aus dem Format von `web-push generate-vapid-keys` (base64url, 65 + 32 Byte) ein geprüftes Paar. */
async function vapidSchluessel(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
	const pub = rohbytes(publicKey, 65);
	const d = rohbytes(privateKey, 32);
	if (pub[0] !== 0x04) throw new Error('VAPID-Schlüssel ist kein unkomprimierter Punkt');
	const x = encodeBase64Url(pub.slice(1, 33));
	const y = encodeBase64Url(pub.slice(33, 65));
	try {
		const algo = { name: 'ECDSA', namedCurve: 'P-256' };
		const keys: CryptoKeyPair = {
			publicKey: await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y }, algo, true, ['verify']),
			privateKey: await crypto.subtle.importKey(
				'jwk',
				{ kty: 'EC', crv: 'P-256', x, y, d: encodeBase64Url(d) },
				algo,
				false,
				['sign'],
			),
		};
		// Privater und öffentlicher Schlüssel müssen zusammengehören, sonst lehnt jeder Push-Dienst ab.
		const probe = enc.encode('taskfuchs-vapid');
		const sig = { name: 'ECDSA', hash: 'SHA-256' };
		const signatur = await crypto.subtle.sign(sig, keys.privateKey, probe);
		if (!(await crypto.subtle.verify(sig, keys.publicKey, signatur, probe))) throw new Error();
		return keys;
	} catch {
		throw new Error('VAPID-Schlüssel ungültig oder passen nicht zusammen');
	}
}

async function vapidJwt(privateKey: CryptoKey, aud: string, sub: string): Promise<string> {
	const teile = [{ typ: 'JWT', alg: 'ES256' }, { aud, exp: Math.floor(Date.now() / 1000) + VAPID_GUELTIGKEIT_S, sub }];
	const signiert = teile.map((t) => encodeBase64Url(enc.encode(JSON.stringify(t)))).join('.');
	const signatur = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(signiert));
	return `${signiert}.${encodeBase64Url(signatur)}`;
}

// --- Endpoint-Prüfung ------------------------------------------------------------------------

/**
 * Hosts der Push-Dienste (RFC 8030), die Browser als Endpoint vergeben: Chrome/Android/Samsung/Opera/Edge-Android
 * über FCM, Firefox, Edge/Windows (WNS), Safari. Ein Endpoint kann von jedem eingeloggten Konto frei gesetzt
 * werden und die Function schickt dorthin Daten mit gültigem VAPID-Kopf: deshalb Allowlist statt Negativfilter
 * (Trailing Dot, interne Namen, DNS auf Loopback, fremde Ports waren mit dem Negativfilter umgehbar).
 *
 * Liste muss mit dem Check-Constraint push_subscriptions_endpoint_check in
 * supabase/migrations/027_push_benachrichtigungen.sql übereinstimmen (derselbe reguläre Ausdruck): was die
 * Datenbank annimmt, muss die Function senden dürfen, und umgekehrt darf die Function nicht mehr erlauben.
 * Beispielliste in beiden Testwelten: webpush_test.ts und supabase/tests/push_benachrichtigungen.test.sql.
 */
const ENDPOINT_MUSTER =
	/^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)(:443)?\/[!-~]+$/;

/**
 * Nur https auf Port 443 bei einem bekannten Push-Dienst; sonst nie (SSRF-Schutz). Geprüft wird die von `URL`
 * normalisierte Form (`href`: Host kleingeschrieben, Standardport 443 weggelassen, Prozent-Kodierung im Host aufgelöst),
 * nicht die Eingabe — so wirken Tricks wie Trailing Dot, Großschreibung oder `%6c%6f…` nicht.
 */
export function oeffentlicherHttpsEndpoint(url: URL): boolean {
	return ENDPOINT_MUSTER.test(url.href);
}

// --- Versand ----------------------------------------------------------------------------------

export async function senderErstellen(cfg: SenderConfig): Promise<Sender> {
	const vapid = await vapidSchluessel(cfg.publicKey, cfg.privateKey);
	const frist = cfg.timeoutMs ?? STANDARD_FRIST_MS;
	const endpointErlaubt = cfg.endpointPruefung ?? oeffentlicherHttpsEndpoint;

	return {
		async senden(abo, payload, signal) {
			try {
				let url: URL;
				try {
					url = new URL(abo.endpoint);
				} catch {
					throw new Error('Endpoint nicht erlaubt');
				}
				if (!endpointErlaubt(url)) throw new Error('Endpoint nicht erlaubt');

				const body = await verschluesseln(
					enc.encode(payload),
					decodeBase64Url(abo.p256dh),
					decodeBase64Url(abo.auth),
				);
				const res = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Encoding': 'aes128gcm',
						'Content-Type': 'application/octet-stream',
						TTL: String(TTL_SEKUNDEN),
						// Menschlich ausgelöste Meldungen, die immer eine sichtbare Notification erzeugen: mit „normal“
						// verzögert Android im Doze-Modus die Zustellung (RFC 8030 §5.3).
						Urgency: 'high',
						Authorization: `vapid t=${await vapidJwt(vapid.privateKey, url.origin, cfg.subject)}, k=${cfg.publicKey}`,
					},
					body,
					redirect: 'manual', // Push-Dienste leiten nicht um; nie einem Redirect auf andere Hosts folgen
					signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(frist)]) : AbortSignal.timeout(frist),
				});
				await res.body?.cancel();
				return res.status;
			} catch (e) {
				// Originalfehler (z. B. von fetch) nennen den Endpoint → nur neutrale Meldungen nach außen.
				if (e instanceof Error && e.message === 'Endpoint nicht erlaubt') throw new Error(e.message);
				if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
					throw new Error(ZEITUEBERSCHREITUNG);
				}
				throw new Error('Versand fehlgeschlagen');
			}
		},
	};
}
