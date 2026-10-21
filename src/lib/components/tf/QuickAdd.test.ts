import { describe, it, expect } from 'vitest';
import { oeffnetZeile } from './QuickAdd.svelte';

const zeile = {} as EventTarget;
const feld = {} as EventTarget;

describe('QuickAdd: Tasten auf der Zeile', () => {
	it('oeffnet die Zeile mit Enter und Leertaste auf der Zeile selbst', () => {
		expect(oeffnetZeile({ key: 'Enter', target: zeile, currentTarget: zeile })).toBe(true);
		expect(oeffnetZeile({ key: ' ', target: zeile, currentTarget: zeile })).toBe(true);
	});

	it('laesst Leertaste und Enter aus dem Eingabefeld durch (Leerzeichen tippbar)', () => {
		expect(oeffnetZeile({ key: ' ', target: feld, currentTarget: zeile })).toBe(false);
		expect(oeffnetZeile({ key: 'Enter', target: feld, currentTarget: zeile })).toBe(false);
	});

	it('reagiert auf andere Tasten nicht', () => {
		expect(oeffnetZeile({ key: 'a', target: zeile, currentTarget: zeile })).toBe(false);
	});
});
