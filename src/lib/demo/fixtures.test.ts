import { describe, it, expect } from 'vitest';
import { DEMO_AUFGABEN, DEMO_LISTEN } from './fixtures';
import { einkaufsAnsicht, findeKategorie, istSonstiges } from '$lib/utils/einkauf';

/**
 * Die Demo-Einkaufsliste traegt die Sichtpruefung in `/vorschau?liste=l-einkaufen`:
 * jeder Zustand, den die Oberflaeche kennt, muss darin vorkommen.
 */
describe('Demo-Einkaufsliste', () => {
	const zeilen = DEMO_AUFGABEN.filter((t) => t.list_id === 'l-einkaufen');
	const ansicht = einkaufsAnsicht(zeilen);
	const namen = (ts: { text: string }[]) => ts.map((t) => t.text);
	const abschnitt = (name: string) => ansicht.abschnitte.find((s) => s.kategorie.text === name);

	it('ist eine Einkaufsliste; die bisherige Kategorie-Aufgabe ist Trenner', () => {
		expect(DEMO_LISTEN.find((l) => l.id === 'l-einkaufen')?.kind).toBe('einkauf');
		expect(zeilen.find((t) => t.id === 't-grundnahrung')?.type).toBe('divider');
		expect(namen(ansicht.abschnitte.map((s) => s.kategorie))).toEqual(
			expect.arrayContaining(['Gemüse', 'Kühlabteilung', 'Getränke', 'Sonstiges', 'Snacks'])
		);
	});

	it('hat Artikel in allen drei Zustaenden', () => {
		const offen = ansicht.abschnitte.flatMap((s) => namen(s.offen));
		const wagen = ansicht.abschnitte.flatMap((s) => namen(s.wagen));
		expect(offen).toEqual(expect.arrayContaining(['Tomaten', 'Gurke', 'Milch', 'Joghurt']));
		expect(wagen).toEqual(expect.arrayContaining(['Brot', 'Eier']));
		const chips = ansicht.abschnitte.flatMap((s) => s.abgelegt);
		expect(namen(chips)).toEqual(
			expect.arrayContaining(['Butter', 'Käse', 'Sprudel', 'Apfelsaft', 'Hafermilch', 'Bananen'])
		);
		// „Zuletzt gekauft" ordnet nach `updated_at` — gleiche Zeitstempel
		// zeigten die Reihenfolge nicht.
		expect(new Set(chips.map((t) => t.updated_at)).size).toBe(chips.length);
	});

	it('hat eine Kategorie mit mehr als acht Chips und eine leere', () => {
		expect(ansicht.abschnitte.some((s) => s.abgelegt.length > 8)).toBe(true);
		const snacks = abschnitt('Snacks');
		expect(snacks && [...snacks.offen, ...snacks.wagen, ...snacks.abgelegt]).toEqual([]);
	});

	it('hat „Grillkohle" ohne Kategorie; beim Oeffnen landet sie in „Sonstiges"', () => {
		expect(namen(ansicht.ohneKategorie)).toEqual(['Grillkohle']);
		const kategorien = ansicht.abschnitte.map((s) => s.kategorie);
		expect(findeKategorie('Grillkohle', kategorien)).toBeNull();
		expect(kategorien.some((k) => istSonstiges(k.text))).toBe(true);
	});
});
