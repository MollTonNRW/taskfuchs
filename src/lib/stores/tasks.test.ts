import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

type Task = Database['public']['Tables']['tasks']['Row'];

/**
 * `aendereAufgaben` gegen einen nachgebauten Server: Patches mit gleichem
 * Feldsatz gehen als EIN Request, zurueckgenommen wird nur, was der Server
 * nicht uebernommen hat.
 */
const requests: { ids: string[]; felder: object }[] = [];
let antwort: (ids: string[], felder: object) => { data: { id: string }[] | null; error: unknown };

vi.mock('$lib/services/supabase-crud', () => ({
	bulkUpdateMitIds: vi.fn(async (_sb: unknown, ids: string[], felder: object) => {
		requests.push({ ids, felder });
		return antwort(ids, felder);
	})
}));

const { createTaskStore } = await import('./tasks.svelte');

const zeile = (o: Partial<Task>): Task =>
	({
		id: 'x', list_id: 'L', user_id: 'u', parent_id: null, text: '', type: 'task', divider_label: null,
		done: false, abgelegt: false, priority: 'normal', timeframe: null, highlighted: false, pinned: false,
		pinned_by: null, emoji: null, note: null, due_date: null, assigned_to: null, calendar_event_id: null,
		position: 0, created_at: '', updated_at: '', version: 1, ...o
	}) as Task;

function aufbau() {
	const store = createTaskStore();
	const zeilen = ['a', 'b', 'c'].map((id, i) => zeile({ id, position: i, done: true }));
	store.init({} as SupabaseClient<Database>, 'u', [], zeilen);
	return store;
}

beforeEach(() => {
	requests.length = 0;
	antwort = (ids) => ({ data: ids.map((id) => ({ id })), error: null });
});

describe('aendereAufgaben', () => {
	it('buendelt gleiche Feldsaetze zu EINEM Request', async () => {
		const store = aufbau();
		const ok = await store.aendereAufgaben(
			['a', 'b', 'c'].map((id) => ({ id, felder: { abgelegt: true } }))
		);
		expect(ok).toBe(true);
		expect(requests).toEqual([{ ids: ['a', 'b', 'c'], felder: { abgelegt: true } }]);
		expect(store.tasks.every((t) => t.abgelegt)).toBe(true);
	});
	it('ein Fehler nimmt den ganzen Request zurueck', async () => {
		const store = aufbau();
		antwort = () => ({ data: null, error: { message: 'Netz' } });
		const ok = await store.aendereAufgaben(
			['a', 'b'].map((id) => ({ id, felder: { abgelegt: true } })),
			{ leise: true }
		);
		expect(ok).toBe(false);
		expect(store.tasks.some((t) => t.abgelegt)).toBe(false);
	});
	it('nimmt nur zurueck, was der Server nicht uebernommen hat (RLS filtert still)', async () => {
		const store = aufbau();
		antwort = (ids) => ({ data: ids.filter((id) => id !== 'b').map((id) => ({ id })), error: null });
		const ok = await store.aendereAufgaben(
			[
				{ id: 'a', felder: { position: 5 } },
				{ id: 'b', felder: { position: 6 } }
			],
			{ leise: true }
		);
		expect(ok).toBe(false);
		expect(requests).toHaveLength(2);
		expect(store.tasks.find((t) => t.id === 'a')?.position).toBe(5);
		expect(store.tasks.find((t) => t.id === 'b')?.position).toBe(1);
	});
	it('ruecknahme:false laesst den optimistischen Stand stehen', async () => {
		const store = aufbau();
		antwort = () => ({ data: null, error: { message: 'Netz' } });
		await store.aendereAufgaben([{ id: 'c', felder: { position: 9 } }], { leise: true, ruecknahme: false });
		expect(store.tasks.find((t) => t.id === 'c')?.position).toBe(9);
	});
});
