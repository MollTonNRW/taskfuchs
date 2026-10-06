import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beiRueckkehr, geteilteListen, setzeStumm, statusText, vonPfadAus, zurueckWeg } from './seite';

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

describe('beiRueckkehr', () => {
	/** Dokument-Attrappe mit einstellbarer Sichtbarkeit; `wechsel` feuert `visibilitychange`. */
	function baueDokument(anfang: 'visible' | 'hidden' = 'visible') {
		const ziel = new EventTarget();
		const dokument = {
			visibilityState: anfang as 'visible' | 'hidden',
			addEventListener: ziel.addEventListener.bind(ziel),
			removeEventListener: ziel.removeEventListener.bind(ziel)
		};
		const wechsel = (zustand: 'visible' | 'hidden') => {
			dokument.visibilityState = zustand;
			ziel.dispatchEvent(new Event('visibilitychange'));
		};
		return { dokument, wechsel };
	}

	it('ruft die Aktualisierung auf, wenn die Seite wieder sichtbar wird (Rueckkehr aus den Android-Einstellungen)', () => {
		const { dokument, wechsel } = baueDokument();
		const aktualisieren = vi.fn();
		beiRueckkehr(dokument, aktualisieren);

		wechsel('hidden');
		expect(aktualisieren).not.toHaveBeenCalled();
		wechsel('visible');
		expect(aktualisieren).toHaveBeenCalledTimes(1);
	});

	it('ruft nicht sofort beim Anmelden auf, nur bei einem Wechsel', () => {
		const { dokument } = baueDokument();
		const aktualisieren = vi.fn();
		beiRueckkehr(dokument, aktualisieren);
		expect(aktualisieren).not.toHaveBeenCalled();
	});

	it('hoert nach dem Abmelden nicht mehr zu', () => {
		const { dokument, wechsel } = baueDokument();
		const aktualisieren = vi.fn();
		const abmelden = beiRueckkehr(dokument, aktualisieren);

		abmelden();
		wechsel('hidden');
		wechsel('visible');
		expect(aktualisieren).not.toHaveBeenCalled();
	});
});

describe('zurueckWeg', () => {
	it('geht im Verlauf zurueck, wenn man aus der App kam (sonst entstuende die Schleife /app, Seite, /app)', () => {
		expect(zurueckWeg('/app', '/app')).toBe('verlauf');
	});

	it('navigiert zur App, wenn die Seite direkt geoeffnet wurde (kein Vorgaenger)', () => {
		expect(zurueckWeg(null, '/app')).toBe('app');
		expect(zurueckWeg(undefined, '/app')).toBe('app');
	});

	it('navigiert zur App, wenn man von einer anderen Seite kam', () => {
		expect(zurueckWeg('/app/g2-koppeln', '/app')).toBe('app');
		expect(zurueckWeg('/auth/login', '/app')).toBe('app');
	});

	it('vergleicht den ganzen Pfad, nicht den Anfang', () => {
		expect(zurueckWeg('/application', '/app')).toBe('app');
		expect(zurueckWeg('/app/', '/app')).toBe('app');
	});

	it('nimmt den Pfad der App als Parameter (die Vorschau liegt unter /vorschau)', () => {
		expect(zurueckWeg('/vorschau', '/vorschau')).toBe('verlauf');
		expect(zurueckWeg('/app', '/vorschau')).toBe('app');
	});
});

describe('vonPfadAus', () => {
	it('liest den Pfad der Seite davor', () => {
		expect(vonPfadAus({ from: { url: new URL('https://a.de/app?liste=x#y') } })).toBe('/app');
	});

	it('liefert null bei direktem Aufruf (kein from)', () => {
		expect(vonPfadAus({ from: null })).toBeNull();
	});

	// SvelteKit ruft afterNavigate beim Direktaufruf einer Seite mit `ssr = false` mit
	// einem `from` auf, dessen `url` noch leer ist. Ein Wurf liefe durch die ganze
	// Callback-Liste und risse auch fremde afterNavigate-Callbacks mit.
	it('wirft nicht, wenn from existiert, aber url leer ist', () => {
		expect(vonPfadAus({ from: { url: null } })).toBeNull();
		expect(vonPfadAus({ from: { url: undefined } })).toBeNull();
	});
});
