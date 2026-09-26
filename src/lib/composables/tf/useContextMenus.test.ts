import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import type { Database } from '$lib/types/database';
import type { Einkauf } from '$lib/stores/einkauf';
import { confirmStore, inputDialogStore, resolveInput } from '$lib/stores/toast';
import { createContextMenus, type ContextMenuDeps } from './useContextMenus.svelte';

type Task = Database['public']['Tables']['tasks']['Row'];

const zeile = (o: Partial<Task>): Task => ({
	id: 'x', list_id: 'L', user_id: 'u', parent_id: null, text: '', type: 'task', divider_label: null,
	done: false, abgelegt: false, priority: 'normal', timeframe: null, highlighted: false, pinned: false,
	pinned_by: null, emoji: null, note: null, due_date: null, assigned_to: null, calendar_event_id: null,
	position: 0, created_at: '', updated_at: '', version: 1, ...o
});

const punkt = { clientX: 10, clientY: 20, preventDefault() {} };

function aufbau() {
	const kuehl = zeile({ id: 'k1', type: 'divider', text: 'Kühlabteilung', position: 0 });
	const sonst = zeile({ id: 'k2', type: 'divider', text: 'Sonstiges', position: 1 });
	const milch = zeile({ id: 'a1', parent_id: 'k1', text: 'Milch' });
	const store = {
		lists: [],
		renameList: vi.fn(),
		deleteDoneInList: vi.fn(),
		erledigteAnzahl: () => 0,
		togglePin: vi.fn(),
		updateTask: vi.fn(),
		moveTaskToList: vi.fn(),
		deleteTaskDirect: vi.fn()
	};
	const einkauf = {
		kategorienVon: vi.fn(() => [kuehl, sonst]),
		kategorieWechseln: vi.fn(async () => {}),
		kategorieLoeschen: vi.fn(async () => true)
	};
	const deps: ContextMenuDeps = {
		store,
		einkauf: einkauf as unknown as Einkauf,
		startBulkSelect: vi.fn(),
		openShareDialog: vi.fn(),
		openListIconPicker: vi.fn(),
		listeLoeschen: vi.fn(),
		pinnwandLeeren: vi.fn(),
		beteiligteAnzahl: () => 1,
		sortierung: { aktuell: 'manual', optionen: [], waehlen: vi.fn() },
		mobil: false
	};
	return { ctx: createContextMenus(deps), store, einkauf, kuehl, milch };
}

/** Eine Menue-Aktion ausfuehren und auf ihr Ende warten (sie darf async sein). */
const ausfuehren = (action: (() => void) | undefined) => Promise.resolve(action?.() as unknown);

describe('Kategoriemenue', () => {
	it('bietet Umbenennen und Loeschen — Loeschen ohne Rueckfrage, das Rueckgaengig steht im Toast', async () => {
		const { ctx, einkauf, kuehl } = aufbau();
		ctx.handleKategorieContext(punkt, kuehl);
		const items = ctx.contextMenu.items;
		expect(ctx.contextMenu.show).toBe(true);
		expect(items.map((i) => i.label)).toEqual(['Umbenennen', 'Löschen']);
		expect(items[1].danger).toBe(true);
		await ausfuehren(items[1].action);
		expect(einkauf.kategorieLoeschen).toHaveBeenCalledWith('k1');
		expect(get(confirmStore).show).toBe(false);
	});

	it('fragt beim Umbenennen den neuen Namen ab und speichert ihn getrimmt', async () => {
		const { ctx, store, kuehl } = aufbau();
		ctx.handleKategorieContext(punkt, kuehl);
		const laeuft = ausfuehren(ctx.contextMenu.items[0].action);
		expect(get(inputDialogStore)).toMatchObject({
			show: true,
			title: 'Kategorie umbenennen',
			defaultValue: 'Kühlabteilung'
		});
		resolveInput('  Kühlregal ');
		await laeuft;
		expect(store.updateTask).toHaveBeenCalledWith('k1', 'Kühlregal');
	});
});

describe('Artikelmenue', () => {
	it('hat hoechstens vier Eintraege: Umbenennen, Kategorie aendern, Loeschen', () => {
		const { ctx, einkauf, milch } = aufbau();
		ctx.handleArtikelContext(punkt, milch);
		const eintraege = ctx.contextMenu.items.filter((i) => !i.divider);
		expect(eintraege.map((i) => i.label)).toEqual(['Umbenennen', 'Kategorie ändern', 'Löschen']);
		expect(einkauf.kategorienVon).toHaveBeenCalledWith('L');
		// Der ⋮ der Zeile bleibt markiert, solange ihr Menue offen steht.
		expect(ctx.offeneTaskId).toBe('a1');
	});

	it('listet alle Kategorien der Liste, markiert die aktuelle und haengt um', async () => {
		const { ctx, einkauf, milch } = aufbau();
		ctx.handleArtikelContext(punkt, milch);
		const unter = ctx.contextMenu.items.find((i) => i.label === 'Kategorie ändern')!.submenu!;
		expect(unter.map((u) => [u.label, !!u.active])).toEqual([
			['Kühlabteilung', true],
			['Sonstiges', false]
		]);
		await ausfuehren(unter[1].action);
		expect(einkauf.kategorieWechseln).toHaveBeenCalledWith('a1', 'k2');
	});

	it('loescht mit Undo-Toast ueber den Store', async () => {
		const { ctx, store, milch } = aufbau();
		ctx.handleArtikelContext(punkt, milch);
		const loeschen = ctx.contextMenu.items.find((i) => i.label === 'Löschen')!;
		expect(loeschen.danger).toBe(true);
		await ausfuehren(loeschen.action);
		expect(store.deleteTaskDirect).toHaveBeenCalledWith('a1');
	});
});
