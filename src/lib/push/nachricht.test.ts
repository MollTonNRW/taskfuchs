import { describe, it, expect } from 'vitest';
import { leseNachricht, zielUrl } from './nachricht';

const FALLBACK = { titel: 'Taskfuchs', text: 'Neue Änderungen', url: '/app' };

describe('leseNachricht', () => {
	it('uebernimmt die Felder einer gueltigen Nachricht', () => {
		const roh = JSON.stringify({
			titel: 'Einkaufen',
			text: 'Anna hat „Milch“ hinzugefügt',
			tag: 'tf-liste-anna',
			url: '/app?liste=abc'
		});
		expect(leseNachricht(roh)).toEqual({
			titel: 'Einkaufen',
			text: 'Anna hat „Milch“ hinzugefügt',
			tag: 'tf-liste-anna',
			url: '/app?liste=abc'
		});
	});

	it('braucht kein tag und keine url', () => {
		expect(leseNachricht('{"titel":"A","text":"B"}')).toEqual({ titel: 'A', text: 'B', url: '/app' });
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['leer', ''],
		['kein JSON', 'kaputt'],
		['Array', '[]'],
		['Zahl', '5'],
		['JSON-String', '"hallo"'],
		['JSON null', 'null'],
		['Titel keine Zeichenkette', '{"titel":5}'],
		['leere Objekt', '{}'],
		['nur Leerraum in den Feldern', '{"titel":"  ","text":"\\n"}']
	])('liefert bei %s den Rueckfall und wirft nie', (_name, roh) => {
		expect(leseNachricht(roh as string | null | undefined)).toEqual(FALLBACK);
	});

	it('faellt feldweise zurueck, wenn nur ein Feld fehlt', () => {
		expect(leseNachricht('{"titel":"Einkaufen"}')).toEqual({
			titel: 'Einkaufen',
			text: 'Neue Änderungen',
			url: '/app'
		});
		expect(leseNachricht('{"text":"Etwas"}')).toEqual({ titel: 'Taskfuchs', text: 'Etwas', url: '/app' });
	});

	it('ignoriert Felder falschen Typs, ohne zu werfen', () => {
		const n = leseNachricht('{"titel":"A","text":"B","tag":7,"url":{"x":1}}');
		expect(n).toEqual({ titel: 'A', text: 'B', url: '/app' });
		expect(n.tag).toBeUndefined();
	});

	it('kuerzt Texte ueber 300 Zeichen', () => {
		const n = leseNachricht(JSON.stringify({ titel: 'T'.repeat(500), text: 'x'.repeat(1000) }));
		expect(n.titel.length).toBeLessThanOrEqual(300);
		expect(n.text.length).toBeLessThanOrEqual(300);
		expect(n.text.endsWith('…')).toBe(true);
	});

	it('laesst Texte bis 300 Zeichen unveraendert', () => {
		const text = 'x'.repeat(300);
		expect(leseNachricht(JSON.stringify({ titel: 'T', text })).text).toBe(text);
	});
});

/**
 * Vertrag mit der Edge Function: Die Beispiele sind Nutzlasten, wie `nachrichtBauen` in
 * supabase/functions/push-versand/texte.ts sie als JSON verschickt (Felder titel, text, tag, url; Obergrenzen
 * 60 Zeichen Titel, 180 Zeichen Text, Tag `tf-<list_id>-<actor_id>`, URL `/app?liste=<list_id>`). Das erste
 * Beispiel ist dieselbe Meldung, die supabase/functions/push-versand/lauf_test.ts ("Vertrag mit
 * push_buendel_abholen") aus einem Bündel der Datenbank erzeugt und dort festschreibt. Der Service Worker muss
 * sie ohne Rückfall lesen: ein umbenanntes Feld auf einer der beiden Seiten ergäbe sonst „Taskfuchs“ /
 * „Neue Änderungen“ statt der Meldung.
 */
describe('Nutzlast der Edge Function (texte.ts) wird ohne Rueckfall gelesen', () => {
	const LISTE = '10000000-0000-0000-0000-000000000001';
	const ACTOR = '00000000-0000-0000-0000-0000000000b2';
	const ORIGIN = 'https://a.de';

	const BEISPIELE: [string, string][] = [
		[
			'Einkaufsliste, mehrere Ereignisse',
			`{"titel":"Wocheneinkauf","text":"Bernd: 1 neu (Hafermilch), 1 in den Wagen","tag":"tf-${LISTE}-${ACTOR}","url":"/app?liste=${LISTE}"}`
		],
		[
			'Agent, Anfuehrungszeichen und Umlaute',
			`{"titel":"Familie","text":"Anna (Agent) hat „Müll rausbringen“ gelöscht","tag":"tf-${LISTE}-${ACTOR}","url":"/app?liste=${LISTE}"}`
		],
		[
			'Obergrenzen der Function (Titel 60, Text 180 Zeichen)',
			JSON.stringify({
				titel: 'T'.repeat(59) + '…',
				text: 'x'.repeat(179) + '…',
				tag: `tf-${LISTE}-${ACTOR}`,
				url: `/app?liste=${LISTE}`
			})
		]
	];

	it.each(BEISPIELE)('%s', (_name, roh) => {
		const gesendet = JSON.parse(roh) as { titel: string; text: string; tag: string; url: string };
		expect(Object.keys(gesendet).sort()).toEqual(['tag', 'text', 'titel', 'url']);

		const anzeige = leseNachricht(roh);
		expect(anzeige).toEqual(gesendet);
		// Der Tipp auf die Meldung fuehrt zur Liste, nicht zum Rueckfallziel /app
		expect(zielUrl(anzeige.url, ORIGIN)).toBe(`/app?liste=${LISTE}`);
	});
});

describe('zielUrl', () => {
	const ORIGIN = 'https://a.de';

	it('laesst einen Pfad mit Abfrage der eigenen Origin durch', () => {
		expect(zielUrl('/app?liste=x', ORIGIN)).toBe('/app?liste=x');
	});

	it('kuerzt eine absolute URL der eigenen Origin auf Pfad und Abfrage', () => {
		expect(zielUrl('https://a.de/app?liste=x', ORIGIN)).toBe('/app?liste=x');
	});

	it.each([
		['fremde Origin', 'https://boese.de/x'],
		['protokollrelativ', '//boese.de'],
		['protokollrelativ mit Pfad', '//boese.de/app'],
		['javascript:', 'javascript:alert(1)'],
		['data:', 'data:text/html,<script>alert(1)</script>'],
		['Rueckwaertsstrich', '/\\boese.de'],
		['Tabulator im Doppelstrich', '/\t/boese.de'],
		// Der URL-Parser faltet `.`/`..` weg und laesst `//boese.de` als Pfad stehen;
		// der Service Worker loest das Ergebnis erneut auf und landet auf der fremden Origin.
		['Punkt-Segment vor Doppelstrich', '/.//boese.de/x'],
		['Punkt-Punkt vor Doppelstrich', '/..//boese.de'],
		['Segment, Punkt-Punkt, Doppelstrich', '/a/..//boese.de'],
		['Punkt-Segment mit Rueckwaertsstrich', '/./\\boese.de'],
		['kodierter Punkt vor Doppelstrich', '/%2e//boese.de'],
		['kodierter Punkt gross', '/%2E//boese.de'],
		['tief verschachtelt', '/app/../..//boese.de'],
		['absolute URL der eigenen Origin mit Doppelstrich-Pfad', 'https://a.de/.//boese.de'],
		['andere Subdomain', 'https://a.de.boese.de/app'],
		['anderes Schema', 'http://a.de/app'],
		['leer', ''],
		['nur Leerraum', '   '],
		['Zahl', 5],
		['null', null],
		['undefined', undefined],
		['Objekt', { url: '/app' }]
	])('weicht bei %s auf /app aus', (_name, url) => {
		expect(zielUrl(url, ORIGIN)).toBe('/app');
	});
});

describe('zielUrl bleibt beim erneuten Aufloesen auf der Origin', () => {
	const ORIGIN = 'https://a.de';

	// Der Service Worker macht `new URL(zielUrl(...), origin)` — das Ergebnis muss
	// also fuer jede Eingabe wieder auf der eigenen Origin landen, nicht nur
	// die Eingabe selbst.
	it.each([
		'/app?liste=x',
		'/.//boese.de/x',
		'/..//boese.de',
		'/%2e//boese.de',
		'/./\\boese.de',
		'//boese.de',
		'https://a.de/.//boese.de',
		'https://boese.de/app',
		'/a//b',
		'/app#//boese.de',
		'/app?next=//boese.de'
	])('%s', (url) => {
		const ergebnis = zielUrl(url, ORIGIN);
		expect(new URL(ergebnis, ORIGIN).origin).toBe(ORIGIN);
	});

	it('laesst einen harmlosen Pfad mit Doppelstrich in der Mitte unveraendert', () => {
		expect(zielUrl('/a//b?x=1#h', ORIGIN)).toBe('/a//b?x=1#h');
	});
});
