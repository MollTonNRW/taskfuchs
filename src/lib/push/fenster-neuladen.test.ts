import { describe, it, expect, vi } from 'vitest';
import { istUpdate, fensterNeuLaden } from './fenster-neuladen';

const ORIGIN = 'https://a.de';

function baueFenster(url: string) {
	return { url, navigate: vi.fn(async (_ziel: string) => undefined) };
}

function baueClients(fenster: ReturnType<typeof baueFenster>[]) {
	const matchAll = vi.fn(async (_o: { type: 'window'; includeUncontrolled: boolean }) => fenster);
	return { clients: { matchAll }, matchAll };
}

describe('istUpdate', () => {
	it('erkennt ein Update an einem Cache älterer Fassung', () => {
		expect(istUpdate(['cache-1', 'cache-2'], 'cache-2')).toBe(true);
	});

	it('Erstinstallation ist kein Update', () => {
		expect(istUpdate(['cache-2'], 'cache-2')).toBe(false);
		expect(istUpdate([], 'cache-2')).toBe(false);
	});

	it('fremde Caches zählen nicht als ältere Fassung', () => {
		expect(istUpdate(['workbox-precache', 'cache-2'], 'cache-2')).toBe(false);
	});
});

describe('fensterNeuLaden', () => {
	it('lädt jedes kontrollierte Fenster der eigenen Origin an seiner Adresse neu', async () => {
		const a = baueFenster('https://a.de/app?liste=x');
		const b = baueFenster('https://a.de/app');
		const { clients, matchAll } = baueClients([a, b]);

		await fensterNeuLaden(clients, ORIGIN);

		expect(matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: false });
		expect(a.navigate).toHaveBeenCalledWith('https://a.de/app?liste=x');
		expect(b.navigate).toHaveBeenCalledWith('https://a.de/app');
	});

	it('übergeht Fenster fremder Origins', async () => {
		const fremd = baueFenster('https://b.de/app');
		const { clients } = baueClients([fremd]);

		await fensterNeuLaden(clients, ORIGIN);

		expect(fremd.navigate).not.toHaveBeenCalled();
	});

	it('ein Fehler bei einem Fenster hält die übrigen nicht auf', async () => {
		const kaputt = baueFenster('https://a.de/app');
		kaputt.navigate.mockRejectedValueOnce(new TypeError('nicht kontrolliert'));
		const ok = baueFenster('https://a.de/app?liste=y');
		const { clients } = baueClients([kaputt, ok]);

		await expect(fensterNeuLaden(clients, ORIGIN)).resolves.toBeUndefined();
		expect(ok.navigate).toHaveBeenCalledTimes(1);
	});

	it('wirft nicht, wenn matchAll scheitert', async () => {
		const clients = { matchAll: vi.fn(async () => { throw new Error('weg'); }) };
		await expect(fensterNeuLaden(clients, ORIGIN)).resolves.toBeUndefined();
	});
});
