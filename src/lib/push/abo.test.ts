import { afterEach, describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	abgleichen,
	abmelden,
	ausschalten,
	base64UrlZuUint8,
	browserUmgebung,
	einschalten,
	geraetName,
	mitFrist,
	pushStatus,
	type Berechtigung,
	type PushUmgebung
} from './abo';
import { VAPID_PUBLIC_KEY } from './vapid';

/** Der Schluessel, mit dem ein Abo dieser Version angelegt wird (Deploy-Schluessel). */
const DEPLOY_SCHLUESSEL = base64UrlZuUint8(VAPID_PUBLIC_KEY);

/** Ein anderes, gueltig geformtes Schluesselpaar (65 Byte, 0x04 vorn): Abo aus einem frueheren Test. */
const FREMDER_SCHLUESSEL = Uint8Array.from(DEPLOY_SCHLUESSEL, (b, i) => (i === 0 ? b : (b + 1) % 256));

/**
 * Ein Push-Abo als Attrappe: Schluessel kommen als ArrayBuffer, wie im Browser.
 * `options.applicationServerKey` ist der Schluessel, mit dem das Abo angelegt wurde
 * (Standard: der Deploy-Schluessel); `null` = der Browser nennt ihn nicht.
 */
function baueAbo(
	endpoint = 'https://push.example.test/abo-1',
	angelegtMit: Uint8Array | null | 'ohne-options' = DEPLOY_SCHLUESSEL
) {
	const schluessel: Record<string, number[]> = { p256dh: [1, 2, 3, 251, 255], auth: [250, 0, 7] };
	return {
		endpoint,
		options:
			angelegtMit === 'ohne-options'
				? undefined
				: { applicationServerKey: angelegtMit ? angelegtMit.slice().buffer : null },
		getKey: vi.fn((name: string) => Uint8Array.from(schluessel[name] ?? []).buffer),
		unsubscribe: vi.fn(async () => true)
	};
}

type Abo = ReturnType<typeof baueAbo>;

/** Umgebung mit einstellbarer Berechtigung und einem optional schon vorhandenen Abo. */
function baueUmgebung(
	opt: {
		hatPush?: boolean;
		berechtigung?: Berechtigung;
		anfrage?: Berechtigung;
		abo?: Abo | null;
		neuesAbo?: Abo;
	} = {}
) {
	let abo: Abo | null = opt.abo ?? null;
	const neuesAbo = opt.neuesAbo ?? baueAbo();
	const subscribe = vi.fn(async () => {
		abo = neuesAbo;
		return neuesAbo;
	});
	const berechtigungAnfragen = vi.fn(async () => opt.anfrage ?? 'granted');
	const umgebung: PushUmgebung = {
		hatPush: opt.hatPush ?? true,
		berechtigung: () => opt.berechtigung ?? 'default',
		berechtigungAnfragen,
		registrierung: async () =>
			({
				pushManager: { getSubscription: async () => abo, subscribe }
			}) as unknown as ServiceWorkerRegistration,
		userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
		standalone: false,
		ausApp: false
	};
	return { umgebung, subscribe, berechtigungAnfragen, neuesAbo };
}

/** Supabase-Attrappe: nur `rpc`, Antwort einstellbar. */
function baueSb(antwort: { error: { message: string } | null } | Error = { error: null }) {
	const rpc = vi.fn(async () => {
		if (antwort instanceof Error) throw antwort;
		return antwort;
	});
	return { sb: { rpc } as unknown as SupabaseClient, rpc };
}

describe('pushStatus', () => {
	it('meldet nicht-unterstuetzt, wenn der Browser kein Push kann', async () => {
		const { umgebung } = baueUmgebung({ hatPush: false });
		expect(await pushStatus(umgebung)).toBe('nicht-unterstuetzt');
	});

	it('meldet verweigert bei blockierter Berechtigung', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'denied' });
		expect(await pushStatus(umgebung)).toBe('verweigert');
	});

	it('meldet aus, solange noch nicht gefragt wurde', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'default' });
		expect(await pushStatus(umgebung)).toBe('aus');
	});

	it('meldet aus bei erteilter Berechtigung ohne Abo', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo: null });
		expect(await pushStatus(umgebung)).toBe('aus');
	});

	it('meldet an bei erteilter Berechtigung mit Abo', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo: baueAbo() });
		expect(await pushStatus(umgebung)).toBe('an');
	});
});

describe('pushStatus bei einem Abo mit anderem Schluessel', () => {
	it('meldet aus: ein Abo mit fremdem Schluessel kann keine Meldung der Edge Function empfangen', async () => {
		const { umgebung } = baueUmgebung({
			berechtigung: 'granted',
			abo: baueAbo('https://push.example.test/alt', FREMDER_SCHLUESSEL)
		});
		expect(await pushStatus(umgebung)).toBe('aus');
	});

	it('meldet an, wenn der Browser den Schluessel des Abos nicht nennt (nicht pruefbar)', async () => {
		for (const angelegtMit of [null, 'ohne-options'] as const) {
			const { umgebung } = baueUmgebung({
				berechtigung: 'granted',
				abo: baueAbo('https://push.example.test/x', angelegtMit)
			});
			expect(await pushStatus(umgebung)).toBe('an');
		}
	});
});

describe('pushStatus bei haengendem Service Worker', () => {
	it('meldet aus statt zu werfen, wenn der Service Worker nicht bereit wird', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted' });
		umgebung.registrierung = async () => {
			throw new Error('Service Worker nicht bereit');
		};
		expect(await pushStatus(umgebung)).toBe('aus');
	});
});

describe('mitFrist', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('liefert das Ergebnis, wenn es rechtzeitig kommt', async () => {
		await expect(mitFrist(Promise.resolve(42), 1000)).resolves.toBe(42);
	});

	it('wirft nach Ablauf der Frist, statt ewig zu warten', async () => {
		vi.useFakeTimers();
		const nie = new Promise<number>(() => undefined);
		const ergebnis = expect(mitFrist(nie, 3000)).rejects.toThrow('nicht bereit');
		await vi.advanceTimersByTimeAsync(3000);
		await ergebnis;
	});

	it('reicht den Fehler des Versprechens weiter', async () => {
		await expect(mitFrist(Promise.reject(new Error('kaputt')), 1000)).rejects.toThrow('kaputt');
	});
});

describe('einschalten', () => {
	it('fragt die Berechtigung an und bricht bei Ablehnung ab, ohne Abo und ohne RPC', async () => {
		const { umgebung, subscribe, berechtigungAnfragen } = baueUmgebung({ anfrage: 'denied' });
		const { sb, rpc } = baueSb();
		expect(await einschalten(sb, umgebung)).toBe('verweigert');
		expect(berechtigungAnfragen).toHaveBeenCalledTimes(1);
		expect(subscribe).not.toHaveBeenCalled();
		expect(rpc).not.toHaveBeenCalled();
	});

	it('bleibt aus, wenn der Dialog nur weggetippt wurde', async () => {
		const { umgebung, subscribe } = baueUmgebung({ anfrage: 'default' });
		const { sb, rpc } = baueSb();
		expect(await einschalten(sb, umgebung)).toBe('aus');
		expect(subscribe).not.toHaveBeenCalled();
		expect(rpc).not.toHaveBeenCalled();
	});

	it('abonniert mit dem oeffentlichen Schluessel und speichert das Abo per RPC', async () => {
		const { umgebung, subscribe, neuesAbo } = baueUmgebung({ anfrage: 'granted' });
		const { sb, rpc } = baueSb();

		expect(await einschalten(sb, umgebung)).toBe('an');

		expect(subscribe).toHaveBeenCalledTimes(1);
		const [optionen] = subscribe.mock.calls[0] as unknown as [
			{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }
		];
		expect(optionen.userVisibleOnly).toBe(true);
		expect(optionen.applicationServerKey).toBeInstanceOf(Uint8Array);
		expect(optionen.applicationServerKey.length).toBe(65);
		expect(optionen.applicationServerKey[0]).toBe(0x04);

		expect(rpc).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('push_abo_speichern', {
			p_endpoint: neuesAbo.endpoint,
			p_p256dh: 'AQID-_8',
			p_auth: '-gAH',
			p_geraet: 'Android · Chrome'
		});
	});

	it('nimmt ein schon vorhandenes Abo wieder auf, statt ein zweites anzulegen', async () => {
		const vorhanden = baueAbo('https://push.example.test/alt');
		const { umgebung, subscribe } = baueUmgebung({ anfrage: 'granted', abo: vorhanden });
		const { sb, rpc } = baueSb();

		expect(await einschalten(sb, umgebung)).toBe('an');
		expect(subscribe).not.toHaveBeenCalled();
		expect(rpc).toHaveBeenCalledWith(
			'push_abo_speichern',
			expect.objectContaining({ p_endpoint: 'https://push.example.test/alt' })
		);
	});

	it('ersetzt ein Abo, das mit einem anderen Schluessel angelegt wurde, statt es zu speichern', async () => {
		const alt = baueAbo('https://push.example.test/alt', FREMDER_SCHLUESSEL);
		const { umgebung, subscribe, neuesAbo } = baueUmgebung({ anfrage: 'granted', abo: alt });
		const { sb, rpc } = baueSb();

		expect(await einschalten(sb, umgebung)).toBe('an');

		// altes Abo beim Browser weg, neues mit dem Deploy-Schluessel angelegt
		expect(alt.unsubscribe).toHaveBeenCalledTimes(1);
		expect(subscribe).toHaveBeenCalledTimes(1);
		const [optionen] = subscribe.mock.calls[0] as unknown as [{ applicationServerKey: Uint8Array }];
		expect(Array.from(optionen.applicationServerKey)).toEqual(Array.from(DEPLOY_SCHLUESSEL));

		// auf dem Server: neues Abo gespeichert, das tote alte Abo entfernt, nie das alte gespeichert
		expect(rpc).toHaveBeenCalledWith('push_abo_loeschen', { p_endpoint: 'https://push.example.test/alt' });
		expect(rpc).toHaveBeenCalledWith(
			'push_abo_speichern',
			expect.objectContaining({ p_endpoint: neuesAbo.endpoint })
		);
		expect(rpc).not.toHaveBeenCalledWith(
			'push_abo_speichern',
			expect.objectContaining({ p_endpoint: 'https://push.example.test/alt' })
		);
	});

	it('legt auch dann ein neues Abo an, wenn das Abmelden des alten scheitert', async () => {
		const alt = baueAbo('https://push.example.test/alt', FREMDER_SCHLUESSEL);
		alt.unsubscribe.mockRejectedValue(new Error('weg'));
		const { umgebung, subscribe } = baueUmgebung({ anfrage: 'granted', abo: alt });
		const { sb } = baueSb();

		expect(await einschalten(sb, umgebung)).toBe('an');
		expect(subscribe).toHaveBeenCalledTimes(1);
	});

	it('nimmt ein vorhandenes Abo auf, dessen Schluessel der Browser nicht nennt', async () => {
		const vorhanden = baueAbo('https://push.example.test/ohne', 'ohne-options');
		const { umgebung, subscribe } = baueUmgebung({ anfrage: 'granted', abo: vorhanden });
		const { sb, rpc } = baueSb();

		expect(await einschalten(sb, umgebung)).toBe('an');
		expect(subscribe).not.toHaveBeenCalled();
		expect(vorhanden.unsubscribe).not.toHaveBeenCalled();
		expect(rpc).toHaveBeenCalledWith(
			'push_abo_speichern',
			expect.objectContaining({ p_endpoint: 'https://push.example.test/ohne' })
		);
	});

	it('gibt das Abo wieder frei und wirft, wenn das Speichern scheitert', async () => {
		const { umgebung, neuesAbo } = baueUmgebung({ anfrage: 'granted' });
		const { sb } = baueSb({ error: { message: 'kaputt' } });

		await expect(einschalten(sb, umgebung)).rejects.toThrow('kaputt');
		expect(neuesAbo.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('meldet nicht-unterstuetzt ohne Push-Faehigkeit und fragt gar nicht erst', async () => {
		const { umgebung, berechtigungAnfragen } = baueUmgebung({ hatPush: false });
		const { sb, rpc } = baueSb();
		expect(await einschalten(sb, umgebung)).toBe('nicht-unterstuetzt');
		expect(berechtigungAnfragen).not.toHaveBeenCalled();
		expect(rpc).not.toHaveBeenCalled();
	});
});

describe('ausschalten', () => {
	it('loescht das Abo per RPC und meldet es danach beim Browser ab', async () => {
		const abo = baueAbo('https://push.example.test/weg');
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb, rpc } = baueSb();

		// vollstaendig: Server-Zeile geloescht UND beim Browser abgemeldet
		expect(await ausschalten(sb, umgebung)).toBe(true);

		expect(rpc).toHaveBeenCalledWith('push_abo_loeschen', { p_endpoint: 'https://push.example.test/weg' });
		expect(abo.unsubscribe).toHaveBeenCalledTimes(1);
		// erst RPC, dann unsubscribe
		expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(abo.unsubscribe.mock.invocationCallOrder[0]);
	});

	it('meldet trotzdem beim Browser ab, wenn die RPC einen Fehler liefert', async () => {
		const abo = baueAbo();
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb } = baueSb({ error: { message: 'offline' } });

		// Server nicht bestaetigt: nicht vollstaendig, aber ohne Wurf
		await expect(ausschalten(sb, umgebung)).resolves.toBe(false);
		expect(abo.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('meldet trotzdem beim Browser ab, wenn die RPC wirft', async () => {
		const abo = baueAbo();
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb } = baueSb(new Error('Netz weg'));

		await expect(ausschalten(sb, umgebung)).resolves.toBe(false);
		expect(abo.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('versucht das Abmelden beim Browser ein zweites Mal, wenn es false liefert', async () => {
		const abo = baueAbo();
		abo.unsubscribe.mockResolvedValueOnce(false);
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb } = baueSb();

		await expect(ausschalten(sb, umgebung)).resolves.toBe(true);
		expect(abo.unsubscribe).toHaveBeenCalledTimes(2);
	});

	it('versucht das Abmelden beim Browser ein zweites Mal, wenn es wirft', async () => {
		const abo = baueAbo();
		abo.unsubscribe.mockRejectedValueOnce(new Error('weg'));
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb } = baueSb();

		await expect(ausschalten(sb, umgebung)).resolves.toBe(true);
		expect(abo.unsubscribe).toHaveBeenCalledTimes(2);
	});

	it('meldet false und wirft nicht, wenn das Abo beim Browser auch nach dem zweiten Versuch bleibt', async () => {
		const abo = baueAbo();
		abo.unsubscribe.mockResolvedValue(false);
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb } = baueSb();

		await expect(ausschalten(sb, umgebung)).resolves.toBe(false);
		expect(abo.unsubscribe).toHaveBeenCalledTimes(2);
	});

	it('meldet false, wenn Server und Browser beide scheitern (Abo des alten Kontos bliebe stehen)', async () => {
		const abo = baueAbo();
		abo.unsubscribe.mockRejectedValue(new Error('weg'));
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb } = baueSb({ error: { message: 'offline' } });

		await expect(ausschalten(sb, umgebung)).resolves.toBe(false);
	});

	it('tut nichts ohne Abo und gilt als erledigt', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo: null });
		const { sb, rpc } = baueSb();
		await expect(ausschalten(sb, umgebung)).resolves.toBe(true);
		expect(rpc).not.toHaveBeenCalled();
	});

	it('tut nichts, wenn der Browser kein Push kann, und gilt als erledigt', async () => {
		const { umgebung } = baueUmgebung({ hatPush: false });
		const { sb, rpc } = baueSb();
		await expect(ausschalten(sb, umgebung)).resolves.toBe(true);
		expect(rpc).not.toHaveBeenCalled();
	});
});

describe('abmelden', () => {
	/** Supabase-Attrappe mit `rpc` und `auth.signOut`; `reihenfolge` hält die Aufrufe fest. */
	function baueKonto(rpcAntwort: 'ok' | 'fehler' | 'wirft' | 'haengt' = 'ok') {
		const reihenfolge: string[] = [];
		const sb = {
			rpc: vi.fn(async (name: string) => {
				reihenfolge.push(name);
				if (rpcAntwort === 'wirft') throw new Error('Netz weg');
				if (rpcAntwort === 'haengt') return new Promise(() => undefined);
				return { error: rpcAntwort === 'fehler' ? { message: 'offline' } : null };
			}),
			auth: {
				signOut: vi.fn(async () => {
					reihenfolge.push('signOut');
					return { error: null };
				})
			}
		};
		return { sb: sb as unknown as SupabaseClient, rpc: sb.rpc, signOut: sb.auth.signOut, reihenfolge };
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	it('loescht das Abo dieses Geraets, BEVOR die Sitzung endet', async () => {
		const abo = baueAbo('https://push.example.test/dieses-handy');
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb, rpc, reihenfolge } = baueKonto();

		await abmelden(sb, umgebung);

		expect(rpc).toHaveBeenCalledWith('push_abo_loeschen', { p_endpoint: 'https://push.example.test/dieses-handy' });
		expect(abo.unsubscribe).toHaveBeenCalledTimes(1);
		expect(reihenfolge).toEqual(['push_abo_loeschen', 'signOut']);
	});

	it('meldet auch dann ab, wenn die RPC einen Fehler liefert', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo: baueAbo() });
		const { sb, signOut } = baueKonto('fehler');
		await abmelden(sb, umgebung);
		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it('meldet auch dann ab, wenn die RPC wirft', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo: baueAbo() });
		const { sb, signOut } = baueKonto('wirft');
		await abmelden(sb, umgebung);
		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it('meldet auch dann ab, wenn Server und Browser beide scheitern', async () => {
		const abo = baueAbo();
		abo.unsubscribe.mockResolvedValue(false);
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb, signOut } = baueKonto('fehler');
		await abmelden(sb, umgebung);
		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it('meldet auch dann ab, wenn der Service Worker nicht bereit ist', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted' });
		umgebung.registrierung = async () => {
			throw new Error('Service Worker nicht bereit');
		};
		const { sb, signOut, rpc } = baueKonto();
		await abmelden(sb, umgebung);
		expect(rpc).not.toHaveBeenCalled();
		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it('wartet nicht ewig auf eine haengende RPC', async () => {
		vi.useFakeTimers();
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo: baueAbo() });
		const { sb, signOut } = baueKonto('haengt');

		const fertig = abmelden(sb, umgebung, 5000);
		await vi.advanceTimersByTimeAsync(4999);
		expect(signOut).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await fertig;
		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it('meldet ohne Abo und auf Geraeten ohne Push einfach ab', async () => {
		for (const opt of [{ berechtigung: 'granted' as const, abo: null }, { hatPush: false }]) {
			const { umgebung } = baueUmgebung(opt);
			const { sb, rpc, signOut } = baueKonto();
			await abmelden(sb, umgebung);
			expect(rpc).not.toHaveBeenCalled();
			expect(signOut).toHaveBeenCalledTimes(1);
		}
	});
});

describe('abgleichen', () => {
	it('frischt das Abo auf, wenn Berechtigung und Abo vorhanden sind', async () => {
		const abo = baueAbo();
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo });
		const { sb, rpc } = baueSb();

		await abgleichen(sb, umgebung);

		expect(rpc).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('push_abo_speichern', expect.objectContaining({ p_endpoint: abo.endpoint }));
	});

	it('tut nichts ohne erteilte Berechtigung', async () => {
		for (const berechtigung of ['default', 'denied'] as const) {
			const { umgebung } = baueUmgebung({ berechtigung, abo: baueAbo() });
			const { sb, rpc } = baueSb();
			await abgleichen(sb, umgebung);
			expect(rpc).not.toHaveBeenCalled();
		}
	});

	it('speichert kein Abo, das mit einem anderen Schluessel angelegt wurde', async () => {
		const { umgebung, subscribe } = baueUmgebung({
			berechtigung: 'granted',
			abo: baueAbo('https://push.example.test/alt', FREMDER_SCHLUESSEL)
		});
		const { sb, rpc } = baueSb();

		await abgleichen(sb, umgebung);

		expect(rpc).not.toHaveBeenCalled();
		expect(subscribe).not.toHaveBeenCalled();
	});

	it('tut nichts ohne Abo und fragt nie nach einer Berechtigung', async () => {
		const { umgebung, berechtigungAnfragen, subscribe } = baueUmgebung({ berechtigung: 'granted', abo: null });
		const { sb, rpc } = baueSb();
		await abgleichen(sb, umgebung);
		expect(rpc).not.toHaveBeenCalled();
		expect(subscribe).not.toHaveBeenCalled();
		expect(berechtigungAnfragen).not.toHaveBeenCalled();
	});

	it('schluckt Fehler der RPC', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo: baueAbo() });
		const { sb } = baueSb({ error: { message: 'offline' } });
		await expect(abgleichen(sb, umgebung)).resolves.toBeUndefined();
	});

	it('schluckt Ausnahmen aus dem Browser', async () => {
		const { umgebung } = baueUmgebung({ berechtigung: 'granted', abo: baueAbo() });
		umgebung.registrierung = async () => {
			throw new Error('kein Service Worker');
		};
		const { sb } = baueSb();
		await expect(abgleichen(sb, umgebung)).resolves.toBeUndefined();
	});
});

describe('geraetName', () => {
	const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
	const DESKTOP_CHROME =
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
	const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

	it('erkennt die Taskfuchs-App (TWA) am Referrer', () => {
		expect(geraetName({ userAgent: ANDROID, standalone: true, ausApp: true })).toBe('Android · Taskfuchs-App');
	});

	it('erkennt eine installierte Web-App auf Android', () => {
		expect(geraetName({ userAgent: ANDROID, standalone: true, ausApp: false })).toBe('Android · App');
	});

	it('erkennt Chrome auf Android', () => {
		expect(geraetName({ userAgent: ANDROID, standalone: false, ausApp: false })).toBe('Android · Chrome');
	});

	it('erkennt Chrome auf dem Desktop', () => {
		expect(geraetName({ userAgent: DESKTOP_CHROME, standalone: false, ausApp: false })).toBe('Desktop · Chrome');
	});

	it('erkennt Firefox', () => {
		expect(geraetName({ userAgent: FIREFOX, standalone: false, ausApp: false })).toBe('Desktop · Firefox');
	});

	it('faellt bei Unbekanntem auf Browser zurueck', () => {
		expect(geraetName({ userAgent: '', standalone: false, ausApp: false })).toBe('Browser');
		expect(geraetName({ userAgent: 'irgendwas', standalone: false, ausApp: false })).toBe('Browser');
	});

	it('bleibt hoechstens 100 Zeichen lang (Check-Constraint der Datenbank)', () => {
		const lang = `Android ${'x'.repeat(500)} Chrome/1`;
		expect(geraetName({ userAgent: lang, standalone: false, ausApp: false }).length).toBeLessThanOrEqual(100);
	});
});

describe('base64UrlZuUint8', () => {
	it('wandelt den oeffentlichen VAPID-Schluessel in einen 65-Byte-Punkt', () => {
		const bytes = base64UrlZuUint8(VAPID_PUBLIC_KEY);
		expect(bytes.length).toBe(65);
		expect(bytes[0]).toBe(0x04);
	});

	it('der oeffentliche VAPID-Schluessel ist der aktuelle (zum Function-Secret VAPID_PRIVATE_KEY gehoerig)', () => {
		// Fester Wert: ein Schluesselwechsel muss hier bewusst nachgezogen werden, sonst liefe die App
		// mit einem Schluessel, zu dem die Function den privaten Teil nicht (mehr) hat.
		expect(VAPID_PUBLIC_KEY).toBe(
			'BFwHJk17DnyTqGX1oXuzorsp4X-j1DaGYHwUeQq1oTweX4jRY21TnSMSXr6jEkw8HHpQk9FjQgno3RC1hzNVeP0'
		);
	});

	it('der oeffentliche VAPID-Schluessel ist ein gueltiger Punkt auf der Kurve P-256', async () => {
		await expect(
			crypto.subtle.importKey('raw', base64UrlZuUint8(VAPID_PUBLIC_KEY), { name: 'ECDH', namedCurve: 'P-256' }, true, [])
		).resolves.toBeDefined();
	});

	it('versteht URL-sichere Zeichen und fehlendes Padding', () => {
		expect(Array.from(base64UrlZuUint8('AQID-_8'))).toEqual([1, 2, 3, 251, 255]);
	});
});

describe('browserUmgebung', () => {
	it('meldet ausserhalb eines Browsers kein Push und wirft nicht', async () => {
		const u = browserUmgebung();
		expect(u.hatPush).toBe(false);
		expect(u.berechtigung()).toBe('denied');
		expect(await pushStatus(u)).toBe('nicht-unterstuetzt');
	});
});
