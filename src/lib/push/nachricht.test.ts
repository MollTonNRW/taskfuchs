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
