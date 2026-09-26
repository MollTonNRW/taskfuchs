import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLangesTippen, LANGES_TIPPEN, NATIV_SPERRE, WACKELN } from './langesTippen';
import { dragState } from './touchDrag';

type Punkt = { clientX: number; clientY: number };

function finger(x: number, y: number): TouchEvent {
	return { touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] } as unknown as TouchEvent;
}
function loslassen(x: number, y: number): TouchEvent {
	return { touches: [], changedTouches: [{ clientX: x, clientY: y }] } as unknown as TouchEvent;
}
function rechtsklick(x: number, y: number) {
	const preventDefault = vi.fn();
	return { e: { clientX: x, clientY: y, preventDefault } as unknown as MouseEvent, preventDefault };
}

function aufbau() {
	const menues: { p: Punkt; ziel: string }[] = [];
	const lt = createLangesTippen<string>((p, ziel) =>
		menues.push({ p: { clientX: p.clientX, clientY: p.clientY }, ziel })
	);
	return { lt, menues };
}

describe('createLangesTippen', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(10_000);
	});
	afterEach(() => {
		vi.useRealTimers();
		dragState.update((s) => ({ ...s, active: false }));
	});

	it('Halten ohne Bewegung oeffnet das Menue beim Loslassen und schluckt genau den folgenden Klick', () => {
		const { lt, menues } = aufbau();
		lt.start(finger(20, 30));
		vi.advanceTimersByTime(LANGES_TIPPEN);
		lt.ende(loslassen(21, 31), 'milch');
		expect(menues).toEqual([{ p: { clientX: 21, clientY: 31 }, ziel: 'milch' }]);
		expect(lt.klickGeschluckt()).toBe(true);
		expect(lt.klickGeschluckt()).toBe(false);
	});

	it('kurzes Tippen oeffnet nichts und laesst den Klick durch', () => {
		const { lt, menues } = aufbau();
		lt.start(finger(20, 30));
		vi.advanceTimersByTime(LANGES_TIPPEN - 1);
		lt.ende(loslassen(20, 30), 'milch');
		expect(menues).toEqual([]);
		expect(lt.klickGeschluckt()).toBe(false);
	});

	it('Wackeln bis zur Toleranz ist noch Halten, darueber ein Wischen', () => {
		const a = aufbau();
		a.lt.start(finger(20, 30));
		a.lt.bewegt(finger(20 + WACKELN, 30 - WACKELN));
		vi.advanceTimersByTime(LANGES_TIPPEN);
		a.lt.ende(loslassen(20 + WACKELN, 30 - WACKELN), 'milch');
		expect(a.menues).toHaveLength(1);

		const b = aufbau();
		b.lt.start(finger(20, 30));
		b.lt.bewegt(finger(20, 30 + WACKELN + 1));
		vi.advanceTimersByTime(LANGES_TIPPEN);
		b.lt.ende(loslassen(20, 30 + WACKELN + 1), 'milch');
		expect(b.menues).toEqual([]);
		expect(b.lt.klickGeschluckt()).toBe(false);
	});

	it('waehrend eines Umsortierens gehoert das Halten dem Ziehen', () => {
		const { lt, menues } = aufbau();
		lt.start(finger(20, 30));
		dragState.update((s) => ({ ...s, active: true }));
		vi.advanceTimersByTime(LANGES_TIPPEN);
		lt.ende(loslassen(20, 30), 'milch');
		expect(menues).toEqual([]);
	});

	it('eine neue Beruehrung verwirft einen noch nicht geschluckten Klick', () => {
		const { lt } = aufbau();
		lt.start(finger(20, 30));
		vi.advanceTimersByTime(LANGES_TIPPEN);
		lt.ende(loslassen(20, 30), 'milch');
		lt.start(finger(20, 30));
		expect(lt.klickGeschluckt()).toBe(false);
	});

	it('das native contextmenu kurz nach einer Beruehrung bleibt stumm', () => {
		const { lt, menues } = aufbau();
		lt.start(finger(20, 30));
		vi.advanceTimersByTime(NATIV_SPERRE - 1);
		const r = rechtsklick(20, 30);
		lt.kontextmenue(r.e, 'milch');
		expect(r.preventDefault).toHaveBeenCalled();
		expect(menues).toEqual([]);
	});

	it('ein Rechtsklick ohne Beruehrung davor oeffnet das Menue am Zeiger', () => {
		const { lt, menues } = aufbau();
		const r = rechtsklick(5, 6);
		lt.kontextmenue(r.e, 'brot');
		expect(r.preventDefault).toHaveBeenCalled();
		expect(menues).toEqual([{ p: { clientX: 5, clientY: 6 }, ziel: 'brot' }]);
		expect(lt.klickGeschluckt()).toBe(false);
	});
});
