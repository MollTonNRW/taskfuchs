import { describe, it, expect } from 'vitest';
import { suchen } from './suche';

const liste = (id: string, kind: 'aufgaben' | 'einkauf') =>
	({ id, user_id: 'u', title: id, icon: '🛒', position: 0, visible: true, kind, created_at: '', updated_at: '', version: 1 }) as never;
const t = (o: Record<string, unknown>) =>
	({ id: 'x', list_id: 'E', user_id: 'u', parent_id: null, text: '', type: 'task', divider_label: null, done: false, abgelegt: false,
		priority: 'normal', timeframe: null, highlighted: false, pinned: false, pinned_by: null, emoji: null, note: null, due_date: null,
		assigned_to: null, calendar_event_id: null, position: 0, created_at: '', updated_at: '', version: 1, ...o }) as never;

describe('suchen in Einkaufslisten', () => {
	it('findet Artikel unter Kategorien, nicht die Kategorie selbst', () => {
		const r = suchen(
			[t({ id: 'k', type: 'divider', text: 'Kühlabteilung' }), t({ id: 'm', parent_id: 'k', text: 'Milch' })],
			[liste('E', 'einkauf')],
			'milch'
		);
		const alle = [...r.offen, ...r.erledigt];
		expect(alle.map((x) => x.task.id)).toEqual(['m']);
		expect(alle[0].istArtikel).toBe(true);
		expect(suchen([t({ id: 'k', type: 'divider', text: 'Kühlabteilung' })], [liste('E', 'einkauf')], 'kühl').offen).toHaveLength(0);
	});

	it('Pfad ist Kategorie · Liste, ohne Kategorie nur die Liste; Wagen und abgelegt sind erledigt', () => {
		const r = suchen(
			[
				t({ id: 'k', type: 'divider', text: 'Kühlabteilung' }),
				t({ id: 'm', parent_id: 'k', text: 'Milch', position: 0 }),
				t({ id: 'w', parent_id: 'k', text: 'Hafermilch', done: true, position: 1 }),
				t({ id: 'a', parent_id: 'k', text: 'Kindermilch', done: true, abgelegt: true, position: 2 }),
				t({ id: 'o', text: 'Milchreis', position: 3 })
			],
			[liste('E', 'einkauf')],
			'milch'
		);
		expect(r.offen.map((x) => [x.task.id, x.pfad.vor])).toEqual([
			['m', 'Kühlabteilung · E'],
			['o', 'E']
		]);
		expect(r.erledigt.map((x) => x.task.id)).toEqual(['w', 'a']);
		expect(r.offen[0].titel).toEqual({ vor: '', treffer: 'Milch', nach: '' });
	});

	it('laesst Aufgabenlisten unveraendert: Unteraufgaben treffen ueber die Elternaufgabe', () => {
		const r = suchen(
			[
				t({ id: 'p', list_id: 'A', text: 'Wochenende' }),
				t({ id: 'c', list_id: 'A', parent_id: 'p', text: 'Milch holen' })
			],
			[liste('A', 'aufgaben')],
			'milch'
		);
		expect(r.offen.map((x) => [x.task.id, x.quelle, x.istArtikel])).toEqual([['p', 'unteraufgabe', undefined]]);
	});
});
