import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { geteilteListen, setzeStumm, statusText } from './seite';

const ICH = 'ich';
const ANNA = 'anna';
const BEN = 'ben';

const liste = (id: string, user_id: string, position: number) => ({ id, user_id, position, title: id, icon: '📋' });
const freigabe = (list_id: string, user_id: string) => ({ list_id, user_id });

describe('geteilteListen', () => {
	it('nimmt eine eigene Liste auf, die mit jemand anderem geteilt ist', () => {
		const listen = [liste('einkauf', ICH, 0)];
		const shares = [freigabe('einkauf', ANNA)];
		expect(geteilteListen(listen, shares, ICH).map((l) => l.id)).toEqual(['einkauf']);
	});

	it('laesst eine eigene, private Liste weg', () => {
		const listen = [liste('privat', ICH, 0)];
		expect(geteilteListen(listen, [], ICH)).toEqual([]);
	});

	it('zaehlt die eigene Besitzerzeile in list_shares nicht als Teilen', () => {
		const listen = [liste('privat', ICH, 0)];
		expect(geteilteListen(listen, [freigabe('privat', ICH)], ICH)).toEqual([]);
	});

	it('nimmt eine fremde Liste auf, an der ich eine Freigabe habe', () => {
		const listen = [liste('annas', ANNA, 0)];
		const shares = [freigabe('annas', ICH)];
		expect(geteilteListen(listen, shares, ICH).map((l) => l.id)).toEqual(['annas']);
	});

	it('laesst eine fremde Liste ohne meine Freigabe weg', () => {
		const listen = [liste('annas', ANNA, 0)];
		expect(geteilteListen(listen, [freigabe('annas', BEN)], ICH)).toEqual([]);
	});

	it('sortiert nach Position wie die Navigation', () => {
		const listen = [liste('c', ICH, 2), liste('a', ICH, 0), liste('b', ANNA, 1)];
		const shares = [freigabe('a', ANNA), freigabe('b', ICH), freigabe('c', ANNA)];
		expect(geteilteListen(listen, shares, ICH).map((l) => l.id)).toEqual(['a', 'b', 'c']);
	});

	it('nennt jede Liste nur einmal, auch bei mehreren Freigaben', () => {
		const listen = [liste('einkauf', ICH, 0)];
		const shares = [freigabe('einkauf', ANNA), freigabe('einkauf', BEN)];
		expect(geteilteListen(listen, shares, ICH)).toHaveLength(1);
		// und auch dann, wenn die Liste selbst doppelt im Eingang steht
		expect(geteilteListen([listen[0], listen[0]], shares, ICH)).toHaveLength(1);
	});

	it('liefert ohne Nutzerkennung nichts', () => {
		expect(geteilteListen([liste('einkauf', ICH, 0)], [freigabe('einkauf', ANNA)], null)).toEqual([]);
	});

	it('aendert die Eingabe nicht', () => {
		const listen = [liste('b', ICH, 1), liste('a', ICH, 0)];
		const shares = [freigabe('a', ANNA), freigabe('b', ANNA)];
		geteilteListen(listen, shares, ICH);
		expect(listen.map((l) => l.id)).toEqual(['b', 'a']);
	});
});

describe('statusText', () => {
	it('beschreibt jeden Zustand dieses Geraets', () => {
		expect(statusText('nicht-unterstuetzt')).toBe('Dieses Gerät kann keine Benachrichtigungen empfangen.');
		expect(statusText('verweigert')).toBe(
			'Benachrichtigungen sind für Taskfuchs blockiert. Erlaube sie in den Android-Einstellungen unter Apps › Taskfuchs › Benachrichtigungen.'
		);
		expect(statusText('aus')).toBe('Auf diesem Gerät aus.');
		expect(statusText('an')).toBe('Auf diesem Gerät an.');
	});
});

/** Supabase-Attrappe fuer `list_notification_mutes`: merkt sich die Aufrufe. */
function baueSb(fehler: { message: string; code?: string } | null = null) {
	const aufrufe: { insert?: unknown; loeschen?: Record<string, string> } = {};
	const tabellen: string[] = [];
	const sb = {
		from: vi.fn((tabelle: string) => {
			tabellen.push(tabelle);
			return {
				insert: vi.fn(async (zeile: unknown) => {
					aufrufe.insert = zeile;
					return { error: fehler };
				}),
				delete: vi.fn(() => {
					const filter: Record<string, string> = {};
					aufrufe.loeschen = filter;
					const kette = {
						eq: (spalte: string, wert: string) => {
							filter[spalte] = wert;
							return kette;
						},
						then: (ok: (v: { error: typeof fehler }) => unknown) => ok({ error: fehler })
					};
					return kette;
				})
			};
		})
	};
	return { sb: sb as unknown as SupabaseClient, aufrufe, tabellen };
}

describe('setzeStumm', () => {
	it('legt beim Stummschalten eine Zeile fuer diese Person und Liste an', async () => {
		const { sb, aufrufe, tabellen } = baueSb();
		await setzeStumm(sb, ICH, 'einkauf', true);
		expect(tabellen).toEqual(['list_notification_mutes']);
		expect(aufrufe.insert).toEqual({ user_id: ICH, list_id: 'einkauf' });
	});

	it('loescht beim Einschalten genau die eigene Zeile dieser Liste', async () => {
		const { sb, aufrufe } = baueSb();
		await setzeStumm(sb, ICH, 'einkauf', false);
		expect(aufrufe.loeschen).toEqual({ user_id: ICH, list_id: 'einkauf' });
	});

	it('wirft bei einem Fehler, damit die Seite zuruecknehmen kann', async () => {
		await expect(setzeStumm(baueSb({ message: 'kaputt' }).sb, ICH, 'einkauf', true)).rejects.toThrow('kaputt');
		await expect(setzeStumm(baueSb({ message: 'kaputt' }).sb, ICH, 'einkauf', false)).rejects.toThrow('kaputt');
	});

	it('behandelt "schon stumm" (doppelte Zeile) als Erfolg', async () => {
		const { sb } = baueSb({ message: 'duplicate key', code: '23505' });
		await expect(setzeStumm(sb, ICH, 'einkauf', true)).resolves.toBeUndefined();
	});
});
