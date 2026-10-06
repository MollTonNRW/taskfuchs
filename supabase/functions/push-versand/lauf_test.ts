import { assert, assertEquals, assertRejects } from '@std/assert';
import { type Abhaengigkeiten, lauf } from './lauf.ts';
import type { Abo, Buendel, Ereignis } from './typen.ts';

const LISTE_1 = '11111111-1111-4111-8111-111111111111';
const LISTE_2 = '22222222-2222-4222-8222-222222222222';
const ANNA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BERND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const abo = (n: number): Abo => ({
	endpoint: `https://push.example.test/geheimer-endpoint-${n}`,
	p256dh: `p256dh-geheim-${n}`,
	auth: `auth-geheim-${n}`,
});

const ereignis = (task_id: string, art: Ereignis['art'], text: string): Ereignis => ({
	task_id,
	art,
	text,
	at: '2026-10-06T10:00:00Z',
});

function buendel(teil: Partial<Buendel> = {}): Buendel {
	return {
		list_id: LISTE_1,
		list_title: 'Wocheneinkauf-Titel',
		list_kind: 'einkauf',
		actor_id: ANNA,
		actor_name: 'Annabelle',
		via_agent: false,
		events: [ereignis('t1', 'neu', 'Hafermilch-Geheimtext')],
		empfaenger: [{ user_id: BERND, abos: [abo(1)] }],
		...teil,
	};
}

interface Fake {
	deps: Abhaengigkeiten;
	gesendet: Array<{ endpoint: string; payload: string }>;
	ergebnisse: Array<{ ok: string[]; weg: string[] }>;
	logs: string[];
	maxGleichzeitig: () => number;
}

function fake(
	buendelListe: Buendel[],
	verhalten: (endpoint: string) => number | Error = () => 201,
	verzoegerungMs = 0,
): Fake {
	const f: Fake = {
		gesendet: [],
		ergebnisse: [],
		logs: [],
		maxGleichzeitig: () => max,
		deps: undefined as unknown as Abhaengigkeiten,
	};
	let laufend = 0;
	let max = 0;
	f.deps = {
		abholen: () => Promise.resolve(buendelListe),
		ergebnis: (ok, weg) => {
			f.ergebnisse.push({ ok, weg });
			return Promise.resolve();
		},
		sender: {
			async senden(a, payload) {
				laufend++;
				max = Math.max(max, laufend);
				try {
					if (verzoegerungMs) await new Promise((r) => setTimeout(r, verzoegerungMs));
					f.gesendet.push({ endpoint: a.endpoint, payload });
					const v = verhalten(a.endpoint);
					if (v instanceof Error) throw v;
					return v;
				} finally {
					laufend--;
				}
			},
		},
		log: (m) => f.logs.push(m),
	};
	return f;
}

Deno.test('zwei Bündel, drei Abos: 3 Sendungen mit vollständiger Payload, Ergebnis gemeldet', async () => {
	const f = fake([
		buendel({ empfaenger: [{ user_id: BERND, abos: [abo(1), abo(2)] }] }),
		buendel({
			list_id: LISTE_2,
			list_kind: 'aufgaben',
			list_title: 'Haushalt',
			events: [ereignis('t9', 'erledigt', 'Steuer')],
			empfaenger: [{ user_id: BERND, abos: [abo(3)] }],
		}),
	]);
	const bericht = await lauf(f.deps);
	assertEquals(bericht, { buendel: 2, gesendet: 3, fehler: 0, entfernt: 0 });
	assertEquals(f.gesendet.length, 3);

	const p1 = JSON.parse(f.gesendet[0].payload);
	assertEquals(Object.keys(p1).sort(), ['tag', 'text', 'titel', 'url']);
	assertEquals(p1.titel, 'Wocheneinkauf-Titel');
	assertEquals(p1.text, 'Annabelle hat „Hafermilch-Geheimtext“ hinzugefügt');
	assertEquals(p1.tag, `tf-${LISTE_1}-${ANNA}`);
	assertEquals(p1.url, `/app?liste=${LISTE_1}`);
	// beide Abos desselben Bündels bekommen dieselbe Payload
	assertEquals(f.gesendet[1].payload, f.gesendet[0].payload);
	// zweites Bündel: eigene Texte
	const p2 = JSON.parse(f.gesendet[2].payload);
	assertEquals(p2.titel, 'Haushalt');
	assertEquals(p2.text, 'Annabelle hat „Steuer“ erledigt');
	assertEquals(p2.url, `/app?liste=${LISTE_2}`);

	assertEquals(f.ergebnisse.length, 1);
	assertEquals(f.ergebnisse[0].ok.sort(), [abo(1).endpoint, abo(2).endpoint, abo(3).endpoint]);
	assertEquals(f.ergebnisse[0].weg, []);
});

Deno.test('410 und 404 landen in weg und zählen als entfernt; ok bleibt ok', async () => {
	const f = fake(
		[buendel({ empfaenger: [{ user_id: BERND, abos: [abo(1), abo(2), abo(3)] }] })],
		(ep) => ep === abo(2).endpoint ? 410 : ep === abo(3).endpoint ? 404 : 201,
	);
	const bericht = await lauf(f.deps);
	assertEquals(bericht, { buendel: 1, gesendet: 1, fehler: 0, entfernt: 2 });
	assertEquals(f.ergebnisse, [{ ok: [abo(1).endpoint], weg: [abo(2).endpoint, abo(3).endpoint] }]);
});

Deno.test('Netzfehler (Wurf) zählt als Fehler; Endpoint weder in ok noch in weg; andere werden trotzdem gesendet', async () => {
	const f = fake(
		[buendel({ empfaenger: [{ user_id: BERND, abos: [abo(1), abo(2)] }] })],
		(ep) => ep === abo(1).endpoint ? new Error('Versand fehlgeschlagen') : 201,
	);
	const bericht = await lauf(f.deps);
	assertEquals(bericht, { buendel: 1, gesendet: 1, fehler: 1, entfernt: 0 });
	assertEquals(f.ergebnisse, [{ ok: [abo(2).endpoint], weg: [] }]);
});

Deno.test('Dienstfehler 429/500/413 zählen als Fehler und lassen das Abo unberührt', async () => {
	const f = fake(
		[buendel({ empfaenger: [{ user_id: BERND, abos: [abo(1), abo(2), abo(3)] }] })],
		(ep) => ep === abo(1).endpoint ? 429 : ep === abo(2).endpoint ? 500 : 413,
	);
	const bericht = await lauf(f.deps);
	assertEquals(bericht, { buendel: 1, gesendet: 0, fehler: 3, entfernt: 0 });
	assertEquals(f.ergebnisse.length, 0, 'nichts zu melden');
});

Deno.test('Bündel, das nach der Verdichtung leer ist (neu + gelöscht), wird nicht gesendet', async () => {
	const f = fake([
		buendel({ events: [ereignis('t1', 'neu', 'Vertipper'), ereignis('t1', 'geloescht', 'Vertipper')] }),
	]);
	const bericht = await lauf(f.deps);
	assertEquals(bericht, { buendel: 1, gesendet: 0, fehler: 0, entfernt: 0 });
	assertEquals(f.gesendet.length, 0);
	assertEquals(f.ergebnisse.length, 0);
});

Deno.test('leere Abholung: kein Versand, ergebnis nicht aufgerufen, Bericht 0, kein Log', async () => {
	const f = fake([]);
	assertEquals(await lauf(f.deps), { buendel: 0, gesendet: 0, fehler: 0, entfernt: 0 });
	assertEquals(f.gesendet.length, 0);
	assertEquals(f.ergebnisse.length, 0);
	assertEquals(f.logs.length, 0);
});

Deno.test('Bündel ohne Empfänger oder mit fehlenden Feldern wirft nicht und sendet nichts', async () => {
	const f = fake([
		buendel({ empfaenger: [] }),
		buendel({ empfaenger: null as unknown as Buendel['empfaenger'] }),
		buendel({ events: null as unknown as Buendel['events'] }),
		buendel({ empfaenger: [{ user_id: BERND, abos: null as unknown as Abo[] }] }),
	]);
	assertEquals(await lauf(f.deps), { buendel: 4, gesendet: 0, fehler: 0, entfernt: 0 });
	assertEquals(f.gesendet.length, 0);
});

Deno.test('derselbe Endpoint in zwei Bündeln: zwei Meldungen, aber nur einmal im Ergebnis', async () => {
	const f = fake([
		buendel(),
		buendel({ list_id: LISTE_2, events: [ereignis('t2', 'neu', 'Brot')] }),
	]);
	const bericht = await lauf(f.deps);
	assertEquals(bericht.gesendet, 2);
	assertEquals(f.ergebnisse, [{ ok: [abo(1).endpoint], weg: [] }]);
});

Deno.test('weg gewinnt, wenn derselbe Endpoint einmal ok und einmal gone meldet', async () => {
	let n = 0;
	const f = fake(
		[buendel(), buendel({ list_id: LISTE_2, events: [ereignis('t2', 'neu', 'Brot')] })],
		() => (n++ === 0 ? 201 : 410),
	);
	await lauf(f.deps);
	assertEquals(f.ergebnisse, [{ ok: [], weg: [abo(1).endpoint] }]);
});

Deno.test('Logs enthalten nur Zähler (auch bei Fehlern je Status): weder Texte noch Endpoints, Schlüssel, Titel oder Namen', async () => {
	const verhalten = (ep: string): number | Error => {
		if (ep === abo(2).endpoint) return 410;
		if (ep === abo(3).endpoint) return new Error(`kaputt bei ${ep}`);
		if (ep === abo(4).endpoint || ep === abo(5).endpoint) return 429;
		if (ep === abo(6).endpoint) return 500;
		return 201;
	};
	const f = fake(
		[buendel({ empfaenger: [{ user_id: BERND, abos: [1, 2, 3, 4, 5, 6].map(abo) }] })],
		verhalten,
	);
	await lauf(f.deps);
	assertEquals(f.logs, [
		'push-versand: 1 Bündel, 1 gesendet, 4 Fehler, 1 entfernt',
		'push-versand: Fehler nach Status: 429 ×2, 500 ×1, netz ×1',
	]);
	const verboten = [
		'Hafermilch-Geheimtext',
		'Wocheneinkauf-Titel',
		'Annabelle',
		'geheimer-endpoint',
		'push.example.test',
		'geheim-1',
		'auth-geheim',
		ANNA,
		BERND,
		LISTE_1,
	];
	for (const zeile of f.logs) {
		for (const v of verboten) assert(!zeile.includes(v), `Log enthält "${v}": ${zeile}`);
	}
});

Deno.test('höchstens `parallel` gleichzeitige Sendungen (Standard 6) und es wird auch parallel gesendet', async () => {
	const abos = Array.from({ length: 20 }, (_, i) => abo(i));
	const f = fake([buendel({ empfaenger: [{ user_id: BERND, abos }] })], () => 201, 5);
	const bericht = await lauf(f.deps);
	assertEquals(bericht.gesendet, 20);
	assertEquals(f.maxGleichzeitig(), 6);
});

Deno.test('parallel ist einstellbar, 1 = streng nacheinander', async () => {
	const abos = Array.from({ length: 5 }, (_, i) => abo(i));
	const f = fake([buendel({ empfaenger: [{ user_id: BERND, abos }] })], () => 201, 3);
	await lauf(f.deps, 1);
	assertEquals(f.maxGleichzeitig(), 1);
	const g = fake([buendel({ empfaenger: [{ user_id: BERND, abos }] })], () => 201, 3);
	await lauf(g.deps, 3);
	assertEquals(g.maxGleichzeitig(), 3);
});

Deno.test('Fehler beim Abholen oder Melden werden nicht verschluckt', async () => {
	const f = fake([buendel()]);
	await assertRejects(
		() => lauf({ ...f.deps, abholen: () => Promise.reject(new Error('abholen: 42501')) }),
		Error,
		'abholen',
	);
	await assertRejects(
		() => lauf({ ...f.deps, ergebnis: () => Promise.reject(new Error('ergebnis: 42501')) }),
		Error,
		'ergebnis',
	);
});
