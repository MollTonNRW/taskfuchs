import { describe, it, expect, vi } from 'vitest';
import { zielOeffnen, type FensterVerwaltung } from './fenster';

const ORIGIN = 'https://a.de';
const ZIEL = 'https://a.de/app?liste=x';

/**
 * Attrappe eines Fensters. Kontrollierte Fenster lassen sich navigieren; bei
 * unkontrollierten wirft `navigate` wie im Browser (TypeError).
 */
function baueFenster(url: string, kontrolliert: boolean) {
	return {
		url,
		kontrolliert,
		focus: vi.fn(async () => undefined),
		navigate: vi.fn(async (_ziel: string) => {
			if (!kontrolliert) throw new TypeError('Service Worker kontrolliert dieses Fenster nicht');
		})
	};
}
type TestFenster = ReturnType<typeof baueFenster>;

/** `clients`-Attrappe: `matchAll` beachtet `includeUncontrolled` wie der Browser. */
function baueClients(fenster: TestFenster[]) {
	const matchAll = vi.fn(async (optionen: { type: 'window'; includeUncontrolled: boolean }) =>
		fenster.filter((f) => optionen.includeUncontrolled || f.kontrolliert)
	);
	const openWindow = vi.fn(async (_ziel: string) => undefined);
	return { clients: { matchAll, openWindow } satisfies FensterVerwaltung, matchAll, openWindow };
}

describe('zielOeffnen', () => {
	it('setzt ein kontrolliertes Fenster der App auf das Ziel und holt es nach vorn', async () => {
		const f = baueFenster('https://a.de/app', true);
		const { clients, openWindow } = baueClients([f]);

		await zielOeffnen(clients, ZIEL, ORIGIN);

		expect(f.focus).toHaveBeenCalledTimes(1);
		expect(f.navigate).toHaveBeenCalledWith(ZIEL);
		expect(openWindow).not.toHaveBeenCalled();
	});

	it('navigiert auch dann, wenn der Fokus verweigert wird', async () => {
		const f = baueFenster('https://a.de/app', true);
		f.focus.mockRejectedValue(new Error('kein Fokus-Recht'));
		const { clients, openWindow } = baueClients([f]);

		await zielOeffnen(clients, ZIEL, ORIGIN);

		expect(f.navigate).toHaveBeenCalledWith(ZIEL);
		expect(openWindow).not.toHaveBeenCalled();
	});

	it('oeffnet ein neues Fenster, wenn keines offen ist', async () => {
		const { clients, openWindow } = baueClients([]);
		await zielOeffnen(clients, ZIEL, ORIGIN);
		expect(openWindow).toHaveBeenCalledWith(ZIEL);
	});

	it('uebergeht Fenster fremder Origin', async () => {
		const fremd = baueFenster('https://boese.de/app', true);
		const { clients, openWindow } = baueClients([fremd]);

		await zielOeffnen(clients, ZIEL, ORIGIN);

		expect(fremd.focus).not.toHaveBeenCalled();
		expect(fremd.navigate).not.toHaveBeenCalled();
		expect(openWindow).toHaveBeenCalledWith(ZIEL);
	});

	it('holt unkontrollierte Fenster nicht nach vorn, wenn ohnehin ein neues aufgeht', async () => {
		// Zwei Fenster, die der Service Worker nicht kontrolliert: navigate wirft bei beiden.
		const a = baueFenster('https://a.de/app', false);
		const b = baueFenster('https://a.de/app/g2-koppeln', false);
		const { clients, openWindow } = baueClients([a, b]);

		await zielOeffnen(clients, ZIEL, ORIGIN);

		expect(a.focus).not.toHaveBeenCalled();
		expect(b.focus).not.toHaveBeenCalled();
		expect(openWindow).toHaveBeenCalledTimes(1);
		expect(openWindow).toHaveBeenCalledWith(ZIEL);
	});

	it('nimmt das kontrollierte Fenster und laesst unkontrollierte in Ruhe', async () => {
		const unkontrolliert = baueFenster('https://a.de/app', false);
		const kontrolliert = baueFenster('https://a.de/app', true);
		const { clients, openWindow } = baueClients([unkontrolliert, kontrolliert]);

		await zielOeffnen(clients, ZIEL, ORIGIN);

		expect(unkontrolliert.focus).not.toHaveBeenCalled();
		expect(kontrolliert.focus).toHaveBeenCalledTimes(1);
		expect(kontrolliert.navigate).toHaveBeenCalledWith(ZIEL);
		expect(openWindow).not.toHaveBeenCalled();
	});

	it('versucht das naechste Fenster, wenn navigate bei einem kontrollierten wirft', async () => {
		const kaputt = baueFenster('https://a.de/app', true);
		kaputt.navigate.mockRejectedValueOnce(new Error('weg'));
		const gut = baueFenster('https://a.de/app', true);
		const { clients, openWindow } = baueClients([kaputt, gut]);

		await zielOeffnen(clients, ZIEL, ORIGIN);

		expect(gut.navigate).toHaveBeenCalledWith(ZIEL);
		expect(openWindow).not.toHaveBeenCalled();
	});

	it('oeffnet ein neues Fenster, wenn matchAll scheitert', async () => {
		const { clients, matchAll, openWindow } = baueClients([]);
		matchAll.mockRejectedValueOnce(new Error('kaputt'));
		await zielOeffnen(clients, ZIEL, ORIGIN);
		expect(openWindow).toHaveBeenCalledWith(ZIEL);
	});
});
