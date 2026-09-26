import { describe, it, expect } from 'vitest';
import {
	artikelZustand,
	normalisiere,
	findeKategorie,
	findeArtikel,
	istSonstiges,
	einkaufsAnsicht
} from './einkauf';

const kat = (id: string, text: string) => ({ id, text });
const FRANK = [
	kat('g', 'Gemüse'), kat('k', 'Kühlabteilung'), kat('o', 'Obst'), kat('d', 'Dosen'),
	kat('gn', 'Grundnahrung'), kat('gw', 'Gewürze'), kat('t', 'Tiefkühl'), kat('s', 'Snacks'),
	kat('dr', 'Drogerie'), kat('ge', 'Getränke'), kat('ki', 'Kind'), kat('so', 'Sonstiges')
];

describe('artikelZustand', () => {
	it('offen, wagen, abgelegt', () => {
		expect(artikelZustand({ done: false, abgelegt: false })).toBe('offen');
		expect(artikelZustand({ done: true, abgelegt: false })).toBe('wagen');
		expect(artikelZustand({ done: true, abgelegt: true })).toBe('abgelegt');
		expect(artikelZustand({ done: false, abgelegt: true })).toBe('offen');
		expect(artikelZustand({ done: true })).toBe('wagen');
	});
});

describe('normalisiere', () => {
	it('entfernt Mengen, Klammern, Umlaute und Satzzeichen', () => {
		expect(normalisiere('Milch (ganzes Paket)')).toBe('milch');
		expect(normalisiere('2x Milch')).toBe('milch');
		expect(normalisiere('2 × Milch')).toBe('milch');
		expect(normalisiere('Hackfleisch halb/halb (500 g)')).toBe('hackfleisch halb halb');
		expect(normalisiere('Kartoffeln 2,5 kg')).toBe('kartoffeln');
		expect(normalisiere('Gemüse')).toBe('gemuese');
		expect(normalisiere('  Süßkartoffel!  ')).toBe('suesskartoffel');
	});
});

describe('findeKategorie', () => {
	it('ordnet typische Artikel Franks Kategorien zu', () => {
		const fall = (text: string) => findeKategorie(text, FRANK)?.id ?? null;
		expect(fall('Tomaten')).toBe('g');
		expect(fall('Milch')).toBe('k');
		expect(fall('Hafermilch')).toBe('k');
		expect(fall('Kindermilch / Milchpulver')).toBe('ki');
		expect(fall('Fischstäbchen')).toBe('t');
		expect(fall('Stückige Tomaten')).toBe('d');
		expect(fall('Nudeln (verschiedene Sorten)')).toBe('gn');
		expect(fall('Klopapier')).toBe('dr');
		expect(fall('Aperol')).toBe('ge');
		expect(fall('Bananen')).toBe('o');
		expect(fall('Eier')).toBe('k');
		expect(fall('Katzenfutter nass')).toBe(null);
		expect(fall('Blumenstrauß')).toBe(null);
	});
	it('liefert null, wenn die Liste die passende Kategorie nicht hat', () => {
		expect(findeKategorie('Tomaten', [kat('x', 'Drogerie')])).toBe(null);
	});
	it('trifft Kategorienamen tolerant (Aliasse, Groß/klein)', () => {
		expect(findeKategorie('Joghurt', [kat('m', 'Molkerei')])?.id).toBe('m');
		expect(findeKategorie('Pommes', [kat('tk', 'TK')])?.id).toBe('tk');
	});
});

describe('istSonstiges', () => {
	it('erkennt Sonstiges-Varianten', () => {
		expect(istSonstiges('Sonstiges')).toBe(true);
		expect(istSonstiges(' sonstiges ')).toBe(true);
		expect(istSonstiges('Sonstige')).toBe(true);
		expect(istSonstiges('Snacks')).toBe(false);
	});
});

describe('findeArtikel', () => {
	it('findet denselben Artikel trotz Menge und Schreibweise', () => {
		const artikel = [{ text: 'Milch (ganzes Paket)' }, { text: 'Brot' }];
		expect(findeArtikel('2x milch', artikel)?.text).toBe('Milch (ganzes Paket)');
		expect(findeArtikel('Brötchen', artikel)).toBe(null);
	});
});

describe('einkaufsAnsicht', () => {
	const z = (o: Partial<{ id: string; parent_id: string | null; type: string; text: string; done: boolean; abgelegt: boolean; position: number; updated_at: string }>) => ({
		id: 'x', parent_id: null, type: 'task', text: '', done: false, abgelegt: false, position: 0,
		updated_at: '2026-09-01T10:00:00Z', ...o
	});
	it('baut Abschnitte je Kategorie mit offen, wagen, abgelegt', () => {
		const zeilen = [
			z({ id: 'k2', type: 'divider', text: 'Kühl', position: 1 }),
			z({ id: 'k1', type: 'divider', text: 'Gemüse', position: 0 }),
			z({ id: 'a1', parent_id: 'k1', text: 'Tomaten', position: 1 }),
			z({ id: 'a2', parent_id: 'k1', text: 'Gurke', position: 0 }),
			z({ id: 'a3', parent_id: 'k1', text: 'Salat', done: true }),
			z({ id: 'a4', parent_id: 'k2', text: 'Milch', done: true, abgelegt: true, updated_at: '2026-09-01T10:00:00Z' }),
			z({ id: 'a5', parent_id: 'k2', text: 'Butter', done: true, abgelegt: true, updated_at: '2026-09-02T10:00:00Z' }),
			z({ id: 'o1', text: 'Katzenfutter' })
		];
		const a = einkaufsAnsicht(zeilen);
		expect(a.abschnitte.map((s) => s.kategorie.id)).toEqual(['k1', 'k2']);
		expect(a.abschnitte[0].offen.map((t) => t.id)).toEqual(['a2', 'a1']);
		expect(a.abschnitte[0].wagen.map((t) => t.id)).toEqual(['a3']);
		expect(a.abschnitte[1].abgelegt.map((t) => t.id)).toEqual(['a5', 'a4']);
		expect(a.ohneKategorie.map((t) => t.id)).toEqual(['o1']);
		expect(a.offenAnzahl).toBe(3);
		expect(a.wagenAnzahl).toBe(1);
	});
	it('zeigt Kinder einer Zeile, die keine Kategorie ist, unter „Ohne Kategorie"', () => {
		// Eine Aufgabe mit Unteraufgaben, in die Einkaufsliste verschoben —
		// oder ein Artikel, der auf der dritten Ebene gelandet ist.
		const zeilen = [
			z({ id: 'k', type: 'divider', text: 'Sonstiges' }),
			z({ id: 'p', text: 'Grillparty', position: 0 }),
			z({ id: 'c1', parent_id: 'p', text: 'Kohle', position: 1 }),
			z({ id: 'c2', parent_id: 'p', text: 'Würstchen', done: true, position: 2 }),
			z({ id: 'a', parent_id: 'k', text: 'Kerzen' }),
			z({ id: 'e', parent_id: 'a', text: 'Teelichter', position: 3 }),
			z({ id: 'x', parent_id: 'p', text: 'Senf', done: true, abgelegt: true })
		];
		const a = einkaufsAnsicht(zeilen);
		expect(a.ohneKategorie.map((t) => t.id)).toEqual(['p', 'c1', 'c2', 'e']);
		expect(a.ohneKategorieAbgelegt.map((t) => t.id)).toEqual(['x']);
		expect(a.offenAnzahl).toBe(4);
		expect(a.wagenAnzahl).toBe(1);
	});
});
