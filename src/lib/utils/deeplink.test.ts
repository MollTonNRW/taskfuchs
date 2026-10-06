import { describe, it, expect } from 'vitest';
import { listeAusUrl } from './deeplink';

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d';

describe('listeAusUrl', () => {
	it('liest die Listen-ID aus der Abfrage', () => {
		expect(listeAusUrl(`?liste=${ID}`)).toBe(ID);
	});

	it('liest sie auch ohne fuehrendes Fragezeichen', () => {
		expect(listeAusUrl(`liste=${ID}`)).toBe(ID);
	});

	it('ignoriert weitere Parameter davor und danach', () => {
		expect(listeAusUrl(`?liste=${ID}&x=1`)).toBe(ID);
		expect(listeAusUrl(`?x=1&liste=${ID}`)).toBe(ID);
	});

	it('normalisiert eine grossgeschriebene UUID auf Kleinbuchstaben', () => {
		expect(listeAusUrl(`?liste=${ID.toUpperCase()}`)).toBe(ID);
	});

	it('liefert null bei leerer Abfrage, fehlendem Parameter und Muell', () => {
		expect(listeAusUrl('')).toBeNull();
		expect(listeAusUrl('?')).toBeNull();
		expect(listeAusUrl('?x=1')).toBeNull();
		expect(listeAusUrl('?liste=')).toBeNull();
		expect(listeAusUrl('?liste=abc')).toBeNull();
	});

	it.each([
		['zu kurz', '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0'],
		['zu lang', `${ID}0`],
		['ohne Bindestriche', ID.replaceAll('-', '')],
		['kein Hex', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'],
		['mit Leerraum davor', ` ${ID}`],
		['mit Anhang', `${ID}'--`],
		['Pfadanteil', `../${ID}`],
		['Demo-ID der Vorschau', 'l-einkaufen']
	])('weist %s zurueck', (_name, wert) => {
		expect(listeAusUrl(`?liste=${encodeURIComponent(wert)}`)).toBeNull();
	});

	it('nimmt bei mehrfachem Parameter den ersten', () => {
		const zweite = '11111111-2222-4333-8444-555555555555';
		expect(listeAusUrl(`?liste=${ID}&liste=${zweite}`)).toBe(ID);
	});
});
