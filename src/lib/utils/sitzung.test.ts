import { describe, it, expect } from 'vitest';
import { sitzungGeaendert } from './sitzung';

describe('sitzungGeaendert', () => {
	it('meldet keine Aenderung, wenn dieselbe Sitzung noch einmal gemeldet wird', () => {
		// INITIAL_SESSION beim Start und SIGNED_IN bei der Rueckkehr in die App
		expect(sitzungGeaendert({ expires_at: 1000 }, { expires_at: 1000 })).toBe(false);
	});

	it('meldet keine Aenderung, wenn es weder vorher noch nachher eine Sitzung gibt', () => {
		expect(sitzungGeaendert(null, null)).toBe(false);
		expect(sitzungGeaendert(undefined, null)).toBe(false);
	});

	it('meldet eine Aenderung beim Anmelden', () => {
		expect(sitzungGeaendert(null, { expires_at: 1000 })).toBe(true);
	});

	it('meldet eine Aenderung beim Abmelden', () => {
		expect(sitzungGeaendert({ expires_at: 1000 }, null)).toBe(true);
	});

	it('meldet eine Aenderung bei erneuertem Token', () => {
		expect(sitzungGeaendert({ expires_at: 1000 }, { expires_at: 4600 })).toBe(true);
	});
});
