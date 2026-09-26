import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { toasts } from './toast';

afterEach(() => {
	for (const t of get(toasts)) toasts.dismiss(t.id);
});

describe('toasts.aktion', () => {
	it('loest den vorherigen Aktions-Toast ab, statt zu stapeln', () => {
		toasts.aktion('Milch → Kühlabteilung', 'Ändern', vi.fn());
		toasts.aktion('Radieschen → Gemüse', 'Ändern', vi.fn());
		toasts.aktion('Kidneybohnen → Dosen', 'Ändern', vi.fn());
		expect(get(toasts).map((t) => t.message)).toEqual(['Kidneybohnen → Dosen']);
	});
	it('laesst Undo- und Hinweis-Toasts stehen', () => {
		toasts.undo('Kategorie gelöscht', vi.fn());
		toasts.show('Steht schon auf der Liste');
		toasts.aktion('Milch → Kühlabteilung', 'Ändern', vi.fn());
		toasts.aktion('Radieschen → Gemüse', 'Ändern', vi.fn());
		expect(get(toasts).map((t) => t.message)).toEqual([
			'Kategorie gelöscht',
			'Steht schon auf der Liste',
			'Radieschen → Gemüse'
		]);
	});
});
