import { assert, assertEquals } from '@std/assert';
import { nachrichtBauen, tagesNachricht, terminNachricht } from './texte.ts';
import {
	type Art,
	ARTEN,
	type Buendel,
	type FristAufgabe,
	type Tagesmeldung,
	type Termin,
	type Verdichtet,
} from './typen.ts';

const LISTE = '11111111-1111-4111-8111-111111111111';
const PERSON = '22222222-2222-4222-8222-222222222222';

function buendel(teil: Partial<Buendel> = {}): Buendel {
	return {
		list_id: LISTE,
		list_title: 'Einkaufen',
		list_kind: 'aufgaben',
		actor_id: PERSON,
		actor_name: 'Anna',
		via_agent: false,
		events: [],
		empfaenger: [],
		...teil,
	};
}

// Baut eine Verdichtung direkt (ohne verdichten()), damit texte.ts isoliert getestet wird.
function verd(
	anzahl: Partial<Record<Art, number>>,
	beispiele: Partial<Record<Art, string[]>> = {},
	einzig?: Verdichtet['einzig'],
): Verdichtet {
	const a = Object.fromEntries(ARTEN.map((k) => [k, anzahl[k] ?? 0])) as Record<Art, number>;
	const b = Object.fromEntries(ARTEN.map((k) => [k, beispiele[k] ?? []])) as Record<Art, string[]>;
	const gesamt = ARTEN.reduce((s, k) => s + a[k], 0);
	return { anzahl: a, beispiele: b, gesamt, einzig };
}

const einzel = (art: Art, text: string) => verd({ [art]: 1 }, { [art]: [text] }, { art, text });
const text = (b: Buendel, v: Verdichtet) => nachrichtBauen(b, v)!.text;

Deno.test('Aufgabenliste, einzelne neue Aufgabe', () => {
	assertEquals(text(buendel(), einzel('neu', 'Arzt anrufen')), 'Anna hat „Arzt anrufen“ hinzugefügt');
});

Deno.test('Einkaufsliste, einzelne erledigte Aufgabe landet im Wagen', () => {
	assertEquals(
		text(buendel({ list_kind: 'einkauf' }), einzel('erledigt', 'Milch')),
		'Anna hat „Milch“ in den Wagen gelegt',
	);
});

Deno.test('wieder_offen: Einkauf wieder auf die Liste, Aufgaben wieder geöffnet', () => {
	assertEquals(
		text(buendel({ list_kind: 'einkauf' }), einzel('wieder_offen', 'Milch')),
		'Anna hat „Milch“ wieder auf die Liste gesetzt',
	);
	assertEquals(text(buendel(), einzel('wieder_offen', 'Milch')), 'Anna hat „Milch“ wieder geöffnet');
});

Deno.test('erledigt in der Aufgabenliste, geändert und gelöscht in beiden Listenarten', () => {
	assertEquals(text(buendel(), einzel('erledigt', 'Steuer')), 'Anna hat „Steuer“ erledigt');
	for (const kind of ['aufgaben', 'einkauf'] as const) {
		assertEquals(text(buendel({ list_kind: kind }), einzel('geaendert', 'Brot')), 'Anna hat „Brot“ geändert');
		assertEquals(text(buendel({ list_kind: kind }), einzel('geloescht', 'Brot')), 'Anna hat „Brot“ gelöscht');
	}
});

Deno.test('via_agent hängt (Agent) an den Namen', () => {
	assertEquals(
		text(buendel({ actor_name: 'Frank', via_agent: true }), einzel('neu', 'Milch')),
		'Frank (Agent) hat „Milch“ hinzugefügt',
	);
	assertEquals(
		text(buendel({ actor_name: 'Frank', via_agent: true }), verd({ neu: 2 }, { neu: ['A', 'B'] })),
		'Frank (Agent): 2 neu (A, B)',
	);
});

Deno.test('mehrere, Einkauf: neu mit Beispielen und in den Wagen', () => {
	const v = verd({ neu: 3, erledigt: 12 }, { neu: ['Milch', 'Brot', 'Eier'], erledigt: ['x', 'y', 'z'] });
	assertEquals(text(buendel({ list_kind: 'einkauf' }), v), 'Anna: 3 neu (Milch, Brot, Eier), 12 in den Wagen');
});

Deno.test('mehrere, Aufgaben: erledigt und gelöscht', () => {
	assertEquals(text(buendel(), verd({ erledigt: 2, geloescht: 1 })), 'Anna: 2 erledigt, 1 gelöscht');
});

Deno.test('mehrere: feste Reihenfolge und Labels der Einkaufsliste', () => {
	const v = verd({ geloescht: 1, geaendert: 2, wieder_offen: 4, erledigt: 3, neu: 5 });
	assertEquals(
		text(buendel({ list_kind: 'einkauf' }), v),
		'Anna: 5 neu, 3 in den Wagen, 4 wieder auf der Liste, 2 geändert, 1 gelöscht',
	);
	assertEquals(
		text(buendel(), v),
		'Anna: 5 neu, 3 erledigt, 4 wieder offen, 2 geändert, 1 gelöscht',
	);
});

Deno.test('Aufgabentext im Einzelfall höchstens 60 Zeichen, endet auf …', () => {
	const lang = 'a'.repeat(100);
	const t = text(buendel(), einzel('neu', lang));
	const aufgabe = t.slice(t.indexOf('„') + 1, t.indexOf('“'));
	assertEquals([...aufgabe].length, 60);
	assert(aufgabe.endsWith('…'));
});

Deno.test('Aufgabentext genau 60 Zeichen bleibt unverändert', () => {
	const t = text(buendel(), einzel('neu', 'b'.repeat(60)));
	assert(t.includes(`„${'b'.repeat(60)}“`));
});

Deno.test('Beispieltexte in der Klammer werden auf 60 Zeichen gekürzt', () => {
	const t = text(buendel(), verd({ neu: 2 }, { neu: ['c'.repeat(100), 'd'] }));
	assertEquals(t, `Anna: 2 neu (${'c'.repeat(59)}…, d)`);
});

Deno.test('Gesamttext nie über 180 Zeichen, endet dann auf …', () => {
	const lang = 'e'.repeat(60);
	const v = verd(
		{ neu: 9, erledigt: 9, wieder_offen: 9, geaendert: 9, geloescht: 9 },
		{ neu: [lang, lang, lang] },
	);
	const t = text(buendel({ actor_name: 'N'.repeat(40) }), v);
	assert([...t].length <= 180, `Länge ${[...t].length}`);
	assert(t.endsWith('…'));
});

Deno.test('Kürzung trennt keine Emoji-Paare (Text bleibt wohlgeformt)', () => {
	const emojis = '🥛'.repeat(100);
	const n = nachrichtBauen(buendel({ list_title: emojis }), einzel('neu', emojis))!;
	assert(n.text.isWellFormed());
	assert(n.titel.isWellFormed());
	assert(!n.text.includes('�'));
	assertEquals([...n.text.slice(n.text.indexOf('„') + 1, n.text.indexOf('“'))].length, 60);
});

Deno.test('Kürzung zerschneidet keine Grapheme: ZWJ-Emoji, Flaggen und Kombinationszeichen bleiben ganz oder fallen ganz weg', () => {
	const aufgabeVon = (eingabe: string) => {
		const t = text(buendel(), einzel('neu', eingabe));
		return t.slice(t.indexOf('„') + 1, t.indexOf('“'));
	};
	// Familien-Emoji (7 Codepoints, 1 Grapheme): würde der Schnitt hineinfallen, entfällt es ganz, kein hängendes ZWJ
	const familie = '👨‍👩‍👧‍👦';
	assertEquals(aufgabeVon('x'.repeat(55) + familie), 'x'.repeat(55) + '…');
	assert(!aufgabeVon('x'.repeat(55) + familie).includes('\u200d'));
	// Flaggen (je 2 Regional-Indicator): nie auf einem einzelnen Indicator enden
	assertEquals(aufgabeVon('🇩🇪'.repeat(40)), '🇩🇪'.repeat(29) + '…');
	// Kombinationszeichen: "é" als e + U+0301 bleibt zusammen
	assertEquals(aufgabeVon('a'.repeat(58) + 'e\u0301' + 'zzz'), 'a'.repeat(58) + '…');
	// Grenze bleibt in Codepoints hart: ein einzelnes riesiges Grapheme sprengt sie nicht
	const zalgo = aufgabeVon('x' + '\u0301'.repeat(200));
	assert([...zalgo].length <= 60, `Länge ${[...zalgo].length}`);
	assert(zalgo.isWellFormed());
	// Titel nutzt dieselbe Kürzung
	const titel = nachrichtBauen(buendel({ list_title: 'x'.repeat(55) + familie }), einzel('neu', 'Milch'))!.titel;
	assertEquals(titel, 'x'.repeat(55) + '…');
});

Deno.test('Whitespace im Aufgabentext wird zusammengezogen', () => {
	assertEquals(text(buendel(), einzel('neu', '  Milch\n  kaufen ')), 'Anna hat „Milch kaufen“ hinzugefügt');
});

Deno.test('leerer Aufgabentext ergibt keine leeren Anführungszeichen', () => {
	assertEquals(text(buendel(), einzel('neu', '')), 'Anna hat eine Aufgabe hinzugefügt');
});

Deno.test('Titel = Listentitel, leerer oder blanker Titel -> Taskfuchs', () => {
	assertEquals(nachrichtBauen(buendel({ list_title: 'Haushalt' }), einzel('neu', 'x'))!.titel, 'Haushalt');
	assertEquals(nachrichtBauen(buendel({ list_title: '' }), einzel('neu', 'x'))!.titel, 'Taskfuchs');
	assertEquals(nachrichtBauen(buendel({ list_title: '   ' }), einzel('neu', 'x'))!.titel, 'Taskfuchs');
});

Deno.test('fehlender Name -> Jemand', () => {
	assertEquals(text(buendel({ actor_name: '' }), einzel('neu', 'x')), 'Jemand hat „x“ hinzugefügt');
});

Deno.test('tag und url', () => {
	const n = nachrichtBauen(buendel(), einzel('neu', 'x'))!;
	assertEquals(n.tag, `tf-${LISTE}-${PERSON}`);
	assertEquals(n.url, `/app?liste=${LISTE}`);
});

Deno.test('list_id wird in der URL kodiert', () => {
	const n = nachrichtBauen(buendel({ list_id: 'a b&c=d' }), einzel('neu', 'x'))!;
	assertEquals(n.url, '/app?liste=a%20b%26c%3Dd');
});

Deno.test('gesamt 0 -> null', () => {
	assertEquals(nachrichtBauen(buendel(), verd({})), null);
});

Deno.test('Payload bleibt auch im Extremfall unter 2 KB (Bytes)', () => {
	const lang = '🥛'.repeat(500);
	const v = verd(
		{ neu: 99, erledigt: 99, wieder_offen: 99, geaendert: 99, geloescht: 99 },
		{ neu: [lang, lang, lang] },
	);
	const n = nachrichtBauen(buendel({ list_title: lang, actor_name: lang, via_agent: true }), v)!;
	const bytes = new TextEncoder().encode(JSON.stringify(n)).length;
	assert(bytes < 2048, `Payload ${bytes} Bytes`);
	const einzelNachricht = nachrichtBauen(buendel({ list_title: lang, actor_name: lang }), einzel('neu', lang))!;
	assert(new TextEncoder().encode(JSON.stringify(einzelNachricht)).length < 2048);
});

Deno.test('Payload-JSON enthält genau titel, text, tag, url', () => {
	const n = nachrichtBauen(buendel(), einzel('neu', 'x'))!;
	assertEquals(Object.keys(n).sort(), ['tag', 'text', 'titel', 'url']);
});

// ---------------------------------------------------------------------------
// Erinnerungen an Fristen (Migration 028)
// ---------------------------------------------------------------------------

const L_PRIVAT = '33333333-3333-4333-8333-333333333333';
const L_FAMILIE = '44444444-4444-4444-8444-444444444444';
const fa = (text: string, due_date: string, list_id = L_PRIVAT): FristAufgabe => ({
	task_id: `t-${text}`,
	text,
	due_date,
	list_id,
	list_title: list_id === L_PRIVAT ? 'Privat' : 'Familie',
});
const tm = (aufgaben: FristAufgabe[], anzahl = aufgaben.length): Tagesmeldung => ({
	user_id: 'u1',
	heute: '2026-11-16',
	anzahl,
	aufgaben,
	abos: [],
});

Deno.test('Tagesmeldung: eine heute fällige Aufgabe, Tipp öffnet ihre Liste', () => {
	const n = tagesNachricht(tm([fa('Steuer', '2026-11-16')]))!;
	assertEquals(n.titel, 'Heute fällig');
	assertEquals(n.text, '„Steuer“');
	assertEquals(n.tag, 'tf-frist-2026-11-16');
	assertEquals(n.url, `/app?liste=${L_PRIVAT}`);
});

Deno.test('Tagesmeldung: heute mit Uhrzeit, dazu überfällig und morgen als Zahl; mehrere Listen öffnen „Dringend“', () => {
	const n = tagesNachricht(tm([
		fa('Arzt', '2026-11-10'),
		fa('Steuer', '2026-11-16'),
		fa('Kinderarzt', '2026-11-16T09:00', L_FAMILIE),
		fa('Reifen', '2026-11-17'),
	]))!;
	assertEquals(n.titel, 'Heute fällig');
	assertEquals(n.text, '„Steuer“, „Kinderarzt“ (09:00) · 1 überfällig · 1 morgen');
	assertEquals(n.url, '/app?ansicht=dringend');
});

Deno.test('Tagesmeldung: nur überfällig bzw. nur morgen', () => {
	assertEquals(tagesNachricht(tm([fa('Arzt', '2026-11-10')]))!.titel, 'Überfällig');
	const morgen = tagesNachricht(tm([fa('Reifen', '2026-11-17'), fa('Brief', '2026-11-17')]))!;
	assertEquals(morgen.titel, 'Morgen fällig');
	assertEquals(morgen.text, '„Reifen“, „Brief“');
});

Deno.test('Tagesmeldung: mehr als drei und mehr als geliefert ergibt „und N weitere“', () => {
	const viele = ['A', 'B', 'C', 'D', 'E'].map((t) => fa(t, '2026-11-16'));
	assertEquals(tagesNachricht(tm(viele))!.text, '„A“, „B“, „C“ und 2 weitere');
	assertEquals(tagesNachricht(tm(viele, 25))!.text, '„A“, „B“, „C“ und 22 weitere');
});

Deno.test('Tagesmeldung: nichts Brauchbares ergibt keine Meldung', () => {
	assertEquals(tagesNachricht(tm([])), null);
	assertEquals(tagesNachricht(tm([fa('Kaputt', 'morgen')])), null);
	assertEquals(tagesNachricht({ ...tm([fa('Steuer', '2026-11-16')]), heute: '' }), null);
});

Deno.test('Tagesmeldung: lange Texte werden gekürzt', () => {
	const n = tagesNachricht(tm([fa('x'.repeat(200), '2026-11-16')]))!;
	assert(n.text.length <= 180);
	assert(n.text.includes('…'));
});

const termin = (teil: Partial<Termin> = {}): Termin => ({
	user_id: 'u1',
	task_id: 'task-1',
	text: 'Kinderarzt-Termin',
	due_date: '2026-11-19T09:00',
	vorlauf: 30,
	minuten_bis: 30,
	list_id: L_FAMILIE,
	list_title: 'Familie',
	abos: [],
	...teil,
});

Deno.test('Termin: Titel ist die Aufgabe, Text nennt Vorlauf, Uhrzeit und Liste', () => {
	const n = terminNachricht(termin())!;
	assertEquals(n.titel, 'Kinderarzt-Termin');
	assertEquals(n.text, 'In 30 Minuten, um 09:00 · Familie');
	assertEquals(n.tag, 'tf-termin-task-1');
	assertEquals(n.url, `/app?liste=${L_FAMILIE}`);
});

Deno.test('Termin: Stunden, Vorlauf 0 und kaputte Uhrzeit', () => {
	assertEquals(terminNachricht(termin({ vorlauf: 60, minuten_bis: 60 }))!.text, 'In einer Stunde, um 09:00 · Familie');
	assertEquals(terminNachricht(termin({ vorlauf: 120, minuten_bis: 120 }))!.text, 'In 2 Stunden, um 09:00 · Familie');
	assertEquals(terminNachricht(termin({ vorlauf: 0, minuten_bis: 0 }))!.text, 'Jetzt, 09:00 · Familie');
	assertEquals(terminNachricht(termin({ due_date: '2026-11-19' })), null);
	assertEquals(terminNachricht(termin({ due_date: '2026-11-19T25:99' })), null);
});

Deno.test('Termin: verspätet nennt der Text nur die Uhrzeit, nie einen falschen Vorlauf', () => {
	// eine Minute zu spät gilt noch als pünktlich
	assertEquals(terminNachricht(termin({ minuten_bis: 29 }))!.text, 'In 30 Minuten, um 09:00 · Familie');
	assertEquals(terminNachricht(termin({ minuten_bis: 12 }))!.text, 'Um 09:00 fällig · Familie');
	assertEquals(terminNachricht(termin({ minuten_bis: 0 }))!.text, 'Jetzt, 09:00 · Familie');
	assertEquals(terminNachricht(termin({ minuten_bis: -4 }))!.text, 'Jetzt, 09:00 · Familie');
	assertEquals(terminNachricht(termin({ minuten_bis: -50 }))!.text, 'Seit 09:00 fällig · Familie');
	// fehlt die Angabe (ältere Datenbank), gilt die Meldung als pünktlich
	assertEquals(
		terminNachricht(termin({ minuten_bis: undefined as unknown as number }))!.text,
		'In 30 Minuten, um 09:00 · Familie',
	);
});
