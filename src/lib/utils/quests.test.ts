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

const ICH = 'frank-id';
const liste = (title: string, kind: 'aufgaben' | 'einkauf' = 'aufgaben', user_id: string = ICH) => ({
	title,
	kind,
	user_id
});

describe('URLs', () => {
	it('stehen an einer Stelle', () => {
		expect(QUESTS_URL).toBe('https://familien-quests.pages.dev');
		expect(QUESTS_AUFTRAEGE_URL).toBe('https://familien-quests.pages.dev/auftraege');
		expect(QUESTS_EINKAUF_URL).toBe('https://familien-quests.pages.dev/einkauf');
	});
});

describe('istFamilieListe', () => {
	it('erkennt „Familie" unabhaengig von Gross-/Kleinschreibung und Leerraum', () => {
		expect(istFamilieListe(ICH, liste('Familie'))).toBe(true);
		expect(istFamilieListe(ICH, liste('  familie '))).toBe(true);
		expect(istFamilieListe(ICH, liste('FAMILIE'))).toBe(true);
	});
	it('erkennt keine aehnlichen Namen', () => {
		expect(istFamilieListe(ICH, liste('Familienurlaub'))).toBe(false);
		expect(istFamilieListe(ICH, liste('Arbeit'))).toBe(false);
	});
	it('erkennt keine Einkaufsliste dieses Namens', () => {
		expect(istFamilieListe(ICH, liste('Familie', 'einkauf'))).toBe(false);
	});
});

describe('istEinkaufListe', () => {
	it('braucht Listentyp Einkauf UND den Namen „Einkaufen"', () => {
		expect(istEinkaufListe(ICH, liste('Einkaufen', 'einkauf'))).toBe(true);
		expect(istEinkaufListe(ICH, liste(' einkaufen ', 'einkauf'))).toBe(true);
	});
	it('eine Aufgabenliste „Einkaufen" zaehlt nicht', () => {
		expect(istEinkaufListe(ICH, liste('Einkaufen', 'aufgaben'))).toBe(false);
	});
	it('andere Einkaufslisten bleiben in Taskfuchs', () => {
		expect(istEinkaufListe(ICH, liste('Baumarkt', 'einkauf'))).toBe(false);
	});
});

describe('Beteiligung', () => {
	const ANNA = 'anna-id';
	it('Anna: Liste gehoert Frank, ist mit ihr geteilt (Editor) -> umleiten', () => {
		const familie = liste('Familie', 'aufgaben', ICH);
		const einkauf = liste('Einkaufen', 'einkauf', ICH);
		expect(questsZiel(familie, false, ANNA, true)).toBe(QUESTS_AUFTRAEGE_URL);
		expect(questsZiel(einkauf, true, ANNA, true)).toBe(QUESTS_EINKAUF_URL);
		expect(questsZiel(einkauf, false, ANNA, true)).toBeNull();
	});
	it('fremde Liste gleichen Namens, nicht geteilt -> nicht umleiten', () => {
		const fremd = liste('Familie', 'aufgaben', 'jemand-anders');
		expect(istFamilieListe(ICH, fremd)).toBe(false);
		expect(questsZiel(fremd, true, ICH, false)).toBeNull();
		const fremdEinkauf = liste('Einkaufen', 'einkauf', 'jemand-anders');
		expect(questsZiel(fremdEinkauf, true, ICH, false)).toBeNull();
	});
	it('geteilt, aber Name oder Typ passt nicht -> bleibt', () => {
		expect(questsZiel(liste('Arbeit', 'aufgaben', ICH), true, ANNA, true)).toBeNull();
		expect(questsZiel(liste('Familie', 'einkauf', ICH), true, ANNA, true)).toBeNull();
	});
	it('ohne bekannten Nutzer wird nie umgeleitet', () => {
		expect(questsZiel(liste('Familie'), true, null, true)).toBeNull();
	});
});

describe('questsZiel', () => {
	it('Familie geht immer nach Familien-Quests', () => {
		expect(questsZiel(liste('Familie'), false, ICH)).toBe(QUESTS_AUFTRAEGE_URL);
		expect(questsZiel(liste('Familie'), true, ICH)).toBe(QUESTS_AUFTRAEGE_URL);
	});
	it('Einkaufen nur bei eingeschaltetem Schalter', () => {
		expect(questsZiel(liste('Einkaufen', 'einkauf'), false, ICH)).toBeNull();
		expect(questsZiel(liste('Einkaufen', 'einkauf'), true, ICH)).toBe(QUESTS_EINKAUF_URL);
	});
	it('normale Listen bleiben', () => {
		expect(questsZiel(liste('Arbeit'), true, ICH)).toBeNull();
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
