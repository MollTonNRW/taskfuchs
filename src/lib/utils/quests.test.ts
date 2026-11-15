import { describe, it, expect } from 'vitest';
import {
	QUESTS_URL,
	QUESTS_AUFTRAEGE_URL,
	QUESTS_EINKAUF_URL,
	istFamilieListe,
	istEinkaufListe,
	questsZiel,
	liesEinkaufSchalter,
	EINKAUF_SCHALTER_KEY
} from './quests';

const liste = (title: string, kind: 'aufgaben' | 'einkauf' = 'aufgaben') => ({ title, kind });

describe('URLs', () => {
	it('stehen an einer Stelle', () => {
		expect(QUESTS_URL).toBe('https://familien-quests.pages.dev');
		expect(QUESTS_AUFTRAEGE_URL).toBe('https://familien-quests.pages.dev/auftraege');
		expect(QUESTS_EINKAUF_URL).toBe('https://familien-quests.pages.dev/einkauf');
	});
});

describe('istFamilieListe', () => {
	it('erkennt „Familie" unabhaengig von Gross-/Kleinschreibung und Leerraum', () => {
		expect(istFamilieListe(liste('Familie'))).toBe(true);
		expect(istFamilieListe(liste('  familie '))).toBe(true);
		expect(istFamilieListe(liste('FAMILIE'))).toBe(true);
	});
	it('erkennt keine aehnlichen Namen', () => {
		expect(istFamilieListe(liste('Familienurlaub'))).toBe(false);
		expect(istFamilieListe(liste('Arbeit'))).toBe(false);
	});
	it('erkennt keine Einkaufsliste dieses Namens', () => {
		expect(istFamilieListe(liste('Familie', 'einkauf'))).toBe(false);
	});
});

describe('istEinkaufListe', () => {
	it('braucht Listentyp Einkauf UND den Namen „Einkaufen"', () => {
		expect(istEinkaufListe(liste('Einkaufen', 'einkauf'))).toBe(true);
		expect(istEinkaufListe(liste(' einkaufen ', 'einkauf'))).toBe(true);
	});
	it('eine Aufgabenliste „Einkaufen" zaehlt nicht', () => {
		expect(istEinkaufListe(liste('Einkaufen', 'aufgaben'))).toBe(false);
	});
	it('andere Einkaufslisten bleiben in Taskfuchs', () => {
		expect(istEinkaufListe(liste('Baumarkt', 'einkauf'))).toBe(false);
	});
});

describe('questsZiel', () => {
	it('Familie geht immer nach Familien-Quests', () => {
		expect(questsZiel(liste('Familie'), false)).toBe(QUESTS_AUFTRAEGE_URL);
		expect(questsZiel(liste('Familie'), true)).toBe(QUESTS_AUFTRAEGE_URL);
	});
	it('Einkaufen nur bei eingeschaltetem Schalter', () => {
		expect(questsZiel(liste('Einkaufen', 'einkauf'), false)).toBeNull();
		expect(questsZiel(liste('Einkaufen', 'einkauf'), true)).toBe(QUESTS_EINKAUF_URL);
	});
	it('normale Listen bleiben', () => {
		expect(questsZiel(liste('Arbeit'), true)).toBeNull();
	});
});

describe('liesEinkaufSchalter (Wert -> an/aus, Default aus)', () => {
	it('ohne Wert ist der Schalter aus', () => {
		expect(liesEinkaufSchalter(null)).toBe(false);
		expect(liesEinkaufSchalter('')).toBe(false);
	});
	it('nur „an" schaltet ein', () => {
		expect(liesEinkaufSchalter('an')).toBe(true);
		expect(liesEinkaufSchalter('aus')).toBe(false);
		expect(liesEinkaufSchalter('true')).toBe(false);
	});
	it('Schluessel ist stabil', () => {
		expect(EINKAUF_SCHALTER_KEY).toBe('tf-einkauf-quests');
	});
});
