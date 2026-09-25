import { describe, it, expect } from 'vitest';
import { createEinkauf, type EinkaufDeps } from './einkauf';

type T = EinkaufDeps['tasks'][number];
type L = EinkaufDeps['lists'][number];

let nr = 0;
function zeile(o: Partial<T>): T {
	return {
		id: `t${++nr}`, list_id: 'L', user_id: 'u', parent_id: null, text: '', type: 'task',
		divider_label: null, done: false, abgelegt: false, priority: 'normal', timeframe: null,
		highlighted: false, pinned: false, pinned_by: null, emoji: null, note: null, due_date: null,
		assigned_to: null, calendar_event_id: null, position: 0,
		created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', version: 1, ...o
	} as T;
}

function fake(start: T[], kind: 'aufgaben' | 'einkauf' = 'einkauf') {
	let tasks = [...start];
	let lists: L[] = [{ id: 'L', user_id: 'u', title: 'Einkaufen', icon: '🛒', position: 0, visible: true, kind, created_at: '', updated_at: '', version: 1 } as L];
	const toasts: string[] = [];
	let letztesUndo: (() => unknown) | null = null;
	const deps: EinkaufDeps = {
		get tasks() { return tasks; },
		get lists() { return lists; },
		async aendereAufgaben(patches) {
			tasks = tasks.map((t) => {
				const p = patches.find((x) => x.id === t.id);
				return p ? { ...t, ...p.felder } : t;
			});
			return true;
		},
		async fuegeEin(z) {
			const neu = zeile({ ...z, parent_id: z.parent_id ?? null, type: z.type ?? 'task', position: z.position ?? 0 });
			tasks = [...tasks, neu];
			return neu;
		},
		async setzeListenart(id, k) { lists = lists.map((l) => (l.id === id ? { ...l, kind: k } : l)); return true; },
		// Wie der echte Store: sofort weg, Rueckgaengig fuegt die Zeilen wieder
		// ein und ruft erst danach den Folgeschritt des Aufrufers.
		async loescheMitUndo(g, m, nachUndo) {
			const ids = new Set(g.map((t) => t.id));
			tasks = tasks.filter((t) => !ids.has(t.id));
			toasts.push(m);
			letztesUndo = async () => { tasks = [...tasks, ...g]; await nachUndo?.(); };
		},
		async entferne(g) { const ids = new Set(g.map((t) => t.id)); tasks = tasks.filter((t) => !ids.has(t.id)); return true; },
		toast: {
			undo(m, f) { toasts.push(m); letztesUndo = f; },
			aktion(m) { toasts.push(m); },
			show(m) { toasts.push(m); }
		}
	};
	return { deps, get tasks() { return tasks; }, get lists() { return lists; }, toasts, undo: () => letztesUndo?.() };
}

describe('artikelHinzufuegen', () => {
	it('sortiert per Stichwort in die passende Kategorie', async () => {
		const k = zeile({ id: 'kuehl', type: 'divider', text: 'Kühlabteilung' });
		const f = fake([k]);
		const e = createEinkauf(f.deps);
		const r = await e.artikelHinzufuegen('L', 'Milch');
		expect(r).toMatchObject({ art: 'neu', kategorieName: 'Kühlabteilung' });
		expect(f.tasks.find((t) => t.text === 'Milch')?.parent_id).toBe('kuehl');
	});
	it('reaktiviert einen abgelegten Artikel statt zu duplizieren', async () => {
		const k = zeile({ id: 'kuehl', type: 'divider', text: 'Kühlabteilung' });
		const m = zeile({ id: 'milch', parent_id: 'kuehl', text: 'Milch (ganzes Paket)', done: true, abgelegt: true });
		const f = fake([k, m]);
		const r = await createEinkauf(f.deps).artikelHinzufuegen('L', '2x milch');
		expect(r.art).toBe('reaktiviert');
		expect(f.tasks.filter((t) => t.parent_id === 'kuehl')).toHaveLength(1);
		expect(f.tasks.find((t) => t.id === 'milch')).toMatchObject({ done: false, abgelegt: false });
	});
	it('meldet schon-da, wenn der Artikel offen auf der Liste steht', async () => {
		const k = zeile({ id: 'kuehl', type: 'divider', text: 'Kühlabteilung' });
		const m = zeile({ id: 'milch', parent_id: 'kuehl', text: 'Milch' });
		const f = fake([k, m]);
		const r = await createEinkauf(f.deps).artikelHinzufuegen('L', 'milch');
		expect(r.art).toBe('schon-da');
		expect(f.tasks).toHaveLength(2);
	});
	it('legt Sonstiges genau einmal an, auch bei zwei schnellen Aufrufen', async () => {
		const f = fake([]);
		const e = createEinkauf(f.deps);
		await Promise.all([e.artikelHinzufuegen('L', 'Blumenstrauß'), e.artikelHinzufuegen('L', 'Grillkohle')]);
		expect(f.tasks.filter((t) => t.type === 'divider')).toHaveLength(1);
		expect(f.tasks.filter((t) => t.type === 'task').every((t) => t.parent_id === f.tasks.find((d) => d.type === 'divider')!.id)).toBe(true);
	});
	it('haengt den zweiten Artikel erst an Sonstiges, wenn es auf dem Server steht', async () => {
		// Wie der echte Store: die Zeile steht sofort (optimistisch) im
		// Bestand, bestaetigt ist sie erst, wenn der Insert zurueckkommt.
		const f = fake([]);
		const einfuegen = f.deps.fuegeEin;
		const bestaetigt = new Set<string>();
		const zuFrueh: string[] = [];
		f.deps.fuegeEin = async (z) => {
			if (z.parent_id && !bestaetigt.has(z.parent_id)) zuFrueh.push(z.text);
			const neu = einfuegen(z);
			await new Promise((r) => setTimeout(r, 0));
			const t = await neu;
			if (t) bestaetigt.add(t.id);
			return t;
		};
		const e = createEinkauf(f.deps);
		await Promise.all([e.artikelHinzufuegen('L', 'Blumenstrauß'), e.artikelHinzufuegen('L', 'Grillkohle')]);
		expect(zuFrueh).toEqual([]);
		expect(f.tasks.filter((t) => t.type === 'divider')).toHaveLength(1);
		expect(f.tasks.filter((t) => t.type === 'task')).toHaveLength(2);
	});
});

describe('Einkauf fertig', () => {
	it('legt nur Artikel im Wagen ab, Rueckgaengig stellt genau die zurueck', async () => {
		const k = zeile({ id: 'k', type: 'divider', text: 'Gemüse' });
		const a = zeile({ id: 'a', parent_id: 'k', text: 'Tomaten', done: true });
		const b = zeile({ id: 'b', parent_id: 'k', text: 'Gurke', done: true, abgelegt: true });
		const c = zeile({ id: 'c', parent_id: 'k', text: 'Salat' });
		const f = fake([k, a, b, c]);
		const n = await createEinkauf(f.deps).einkaufFertig('L');
		expect(n).toBe(1);
		expect(f.tasks.find((t) => t.id === 'a')?.abgelegt).toBe(true);
		f.undo();
		await Promise.resolve();
		expect(f.tasks.find((t) => t.id === 'a')?.abgelegt).toBe(false);
		expect(f.tasks.find((t) => t.id === 'b')?.abgelegt).toBe(true);
	});
});

describe('ohneKategorieEinsortieren', () => {
	it('sortiert Artikel von aussen ein, legt aber nie Kategorien an', async () => {
		const k = zeile({ id: 'g', type: 'divider', text: 'Gemüse' });
		const x = zeile({ id: 'x', text: 'Tomaten' });
		const y = zeile({ id: 'y', text: 'Grillkohle' });
		const f = fake([k, x, y]);
		await createEinkauf(f.deps).ohneKategorieEinsortieren('L');
		expect(f.tasks.find((t) => t.id === 'x')?.parent_id).toBe('g');
		expect(f.tasks.find((t) => t.id === 'y')?.parent_id).toBe(null);
		expect(f.tasks.filter((t) => t.type === 'divider')).toHaveLength(1);
	});
});

describe('listeUmstellen', () => {
	it('hin und zurueck ohne Verlust', async () => {
		const p = zeile({ id: 'p', text: 'Gemüse' });
		const s1 = zeile({ id: 's1', parent_id: 'p', text: 'Tomaten', done: true });
		const s2 = zeile({ id: 's2', parent_id: 'p', text: 'Gurke' });
		const lose = zeile({ id: 'lose', text: 'Milch' });
		const f = fake([p, s1, s2, lose], 'aufgaben');
		const e = createEinkauf(f.deps);
		expect(await e.listeUmstellen('L', 'einkauf')).toBe(true);
		expect(f.lists[0].kind).toBe('einkauf');
		expect(f.tasks.find((t) => t.id === 'p')?.type).toBe('divider');
		expect(f.tasks.find((t) => t.id === 's1')).toMatchObject({ done: true, abgelegt: true });
		expect(await e.listeUmstellen('L', 'aufgaben')).toBe(true);
		expect(f.lists[0].kind).toBe('aufgaben');
		expect(f.tasks).toHaveLength(4);
		expect(f.tasks.find((t) => t.id === 'p')?.type).toBe('task');
		expect(f.tasks.find((t) => t.id === 's1')).toMatchObject({ done: true, abgelegt: false });
		expect(f.tasks.find((t) => t.id === 's2')?.done).toBe(false);
	});
});

describe('kategorieLoeschen', () => {
	it('verschiebt Artikel nach Sonstiges und loescht dann die Kategorie', async () => {
		const k = zeile({ id: 'k', type: 'divider', text: 'Snacks' });
		const a = zeile({ id: 'a', parent_id: 'k', text: 'Chips' });
		const f = fake([k, a]);
		expect(await createEinkauf(f.deps).kategorieLoeschen('k')).toBe(true);
		const sonst = f.tasks.find((t) => t.type === 'divider');
		expect(sonst?.text).toBe('Sonstiges');
		expect(f.tasks.find((t) => t.id === 'a')?.parent_id).toBe(sonst?.id);
		expect(f.tasks.some((t) => t.id === 'k')).toBe(false);
	});
	it('Rueckgaengig holt Kategorie und Artikel zurueck und raeumt ein nur dafuer angelegtes Sonstiges weg', async () => {
		const k = zeile({ id: 'k', type: 'divider', text: 'Snacks' });
		const a = zeile({ id: 'a', parent_id: 'k', text: 'Chips', position: 4 });
		const b = zeile({ id: 'b', parent_id: 'k', text: 'Salzstangen', position: 7 });
		const f = fake([k, a, b]);
		await createEinkauf(f.deps).kategorieLoeschen('k');
		expect(f.toasts).toEqual(['Kategorie gelöscht']);
		await f.undo();
		expect(f.tasks.filter((t) => t.type === 'divider').map((t) => t.id)).toEqual(['k']);
		expect(f.tasks.find((t) => t.id === 'a')).toMatchObject({ parent_id: 'k', position: 4 });
		expect(f.tasks.find((t) => t.id === 'b')).toMatchObject({ parent_id: 'k', position: 7 });
	});
	it('Rueckgaengig laesst ein schon vorhandenes Sonstiges stehen, auch wenn es wieder leer ist', async () => {
		const k = zeile({ id: 'k', type: 'divider', text: 'Snacks' });
		const s = zeile({ id: 's', type: 'divider', text: 'Sonstiges', position: 1 });
		const a = zeile({ id: 'a', parent_id: 'k', text: 'Chips', position: 2 });
		const f = fake([k, s, a]);
		await createEinkauf(f.deps).kategorieLoeschen('k');
		expect(f.tasks.find((t) => t.id === 'a')?.parent_id).toBe('s');
		await f.undo();
		expect(f.tasks.find((t) => t.id === 'a')).toMatchObject({ parent_id: 'k', position: 2 });
		expect(f.tasks.some((t) => t.id === 's')).toBe(true);
	});
	it('Rueckgaengig nach dem Loeschen von Sonstiges haengt die Artikel wieder darunter', async () => {
		const s = zeile({ id: 's', type: 'divider', text: 'Sonstiges' });
		const x = zeile({ id: 'x', parent_id: 's', text: 'Grillkohle', position: 3 });
		const f = fake([s, x]);
		await createEinkauf(f.deps).kategorieLoeschen('s');
		expect(f.tasks.find((t) => t.id === 'x')?.parent_id).toBe(null);
		await f.undo();
		expect(f.tasks.find((t) => t.id === 'x')).toMatchObject({ parent_id: 's', position: 3 });
	});
	it('Rueckgaengig laesst Aenderungen aus der Zwischenzeit stehen', async () => {
		const k = zeile({ id: 'k', type: 'divider', text: 'Snacks' });
		const g = zeile({ id: 'g', type: 'divider', text: 'Gemüse', position: 1 });
		const a = zeile({ id: 'a', parent_id: 'k', text: 'Chips' });
		const b = zeile({ id: 'b', parent_id: 'k', text: 'Salzstangen', position: 1 });
		const f = fake([k, g, a, b]);
		const e = createEinkauf(f.deps);
		await e.kategorieLoeschen('k');
		const sonst = f.tasks.find((t) => t.text === 'Sonstiges')!;
		await e.kategorieWechseln('b', 'g');
		await e.artikelHinzufuegen('L', 'Grillkohle');
		await f.undo();
		expect(f.tasks.find((t) => t.id === 'a')?.parent_id).toBe('k');
		expect(f.tasks.find((t) => t.id === 'b')?.parent_id).toBe('g');
		expect(f.tasks.find((t) => t.text === 'Grillkohle')?.parent_id).toBe(sonst.id);
		expect(f.tasks.some((t) => t.id === sonst.id)).toBe(true);
	});
});
