import { describe, it, expect, vi } from 'vitest';
import { aufNeueVersionAchten, neuLadenMitSperre } from './aktualisierung';

/** Minimales Dokument-/Fensterdouble: nur, was der Waechter anfasst. */
function baueUmgebung(sichtbar = true) {
	const dokument = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
	dokument.visibilityState = sichtbar ? 'visible' : 'hidden';
	const fenster = new EventTarget();
	return { dokument, fenster };
}

const warte = () => new Promise((r) => setTimeout(r, 0));

describe('aufNeueVersionAchten', () => {
	it('laedt sofort neu, wenn beim Start schon ein neuerer Build live ist', async () => {
		const { dokument, fenster } = baueUmgebung();
		const neuLaden = vi.fn();
		aufNeueVersionAchten({ pruefe: async () => true, neuLaden, dokument, fenster });
		await warte();
		expect(neuLaden).toHaveBeenCalledTimes(1);
	});

	it('laedt nicht neu, solange der Build aktuell ist', async () => {
		const { dokument, fenster } = baueUmgebung();
		const neuLaden = vi.fn();
		aufNeueVersionAchten({ pruefe: async () => false, neuLaden, dokument, fenster });
		await warte();
		expect(neuLaden).not.toHaveBeenCalled();
	});

	it('prueft erneut, wenn die App aus dem Hintergrund zurueckkommt', async () => {
		const { dokument, fenster } = baueUmgebung();
		const neuLaden = vi.fn();
		let neu = false;
		aufNeueVersionAchten({ pruefe: async () => neu, neuLaden, dokument, fenster });
		await warte();
		expect(neuLaden).not.toHaveBeenCalled();

		// Tage spaeter: neuer Deploy, Frank holt die App wieder nach vorn.
		neu = true;
		dokument.visibilityState = 'hidden';
		dokument.dispatchEvent(new Event('visibilitychange'));
		await warte();
		expect(neuLaden).not.toHaveBeenCalled();

		dokument.visibilityState = 'visible';
		dokument.dispatchEvent(new Event('visibilitychange'));
		await warte();
		expect(neuLaden).toHaveBeenCalledTimes(1);
	});

	it('prueft auch nach Wiederherstellung aus dem Back-Forward-Cache', async () => {
		const { dokument, fenster } = baueUmgebung();
		const neuLaden = vi.fn();
		let neu = false;
		aufNeueVersionAchten({ pruefe: async () => neu, neuLaden, dokument, fenster });
		await warte();

		neu = true;
		const ereignis = Object.assign(new Event('pageshow'), { persisted: true });
		fenster.dispatchEvent(ereignis);
		await warte();
		expect(neuLaden).toHaveBeenCalledTimes(1);
	});

	it('schluckt Fehler der Pruefung (offline) und laedt nicht neu', async () => {
		const { dokument, fenster } = baueUmgebung();
		const neuLaden = vi.fn();
		aufNeueVersionAchten({
			pruefe: async () => {
				throw new TypeError('Failed to fetch');
			},
			neuLaden,
			dokument,
			fenster
		});
		await warte();
		expect(neuLaden).not.toHaveBeenCalled();
	});

	it('meldet sich beim Aufraeumen von allen Ereignissen ab', async () => {
		const { dokument, fenster } = baueUmgebung();
		const neuLaden = vi.fn();
		let neu = false;
		const abmelden = aufNeueVersionAchten({ pruefe: async () => neu, neuLaden, dokument, fenster });
		await warte();
		abmelden();

		neu = true;
		dokument.dispatchEvent(new Event('visibilitychange'));
		fenster.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
		await warte();
		expect(neuLaden).not.toHaveBeenCalled();
	});
});

describe('neuLadenMitSperre', () => {
	function speicherDouble() {
		const werte = new Map<string, string>();
		return {
			getItem: (k: string) => werte.get(k) ?? null,
			setItem: (k: string, v: string) => void werte.set(k, v)
		};
	}

	it('laedt einmal und sperrt weitere Neuladeversuche fuer 30 s (kein Endlos-Reload)', () => {
		const speicher = speicherDouble();
		const reload = vi.fn();
		neuLadenMitSperre({ speicher, reload, jetzt: 1_000 });
		neuLadenMitSperre({ speicher, reload, jetzt: 20_000 });
		expect(reload).toHaveBeenCalledTimes(1);
		neuLadenMitSperre({ speicher, reload, jetzt: 31_001 });
		expect(reload).toHaveBeenCalledTimes(2);
	});

	it('laedt trotzdem neu, wenn der Speicher gesperrt ist', () => {
		const reload = vi.fn();
		const speicher = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {}
		};
		neuLadenMitSperre({ speicher, reload, jetzt: 0 });
		expect(reload).toHaveBeenCalledTimes(1);
	});
});
