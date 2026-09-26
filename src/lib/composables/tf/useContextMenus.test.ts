import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import type { Database } from '$lib/types/database';
import type { Einkauf } from '$lib/stores/einkauf';
import { confirmStore, inputDialogStore, resolveConfirm, resolveInput, toasts } from '$lib/stores/toast';
import { createContextMenus, type ContextMenuDeps } from './useContextMenus.svelte';

type Task = Database['public']['Tables']['tasks']['Row'];
type List = Database['public']['Tables']['lists']['Row'];

const zeile = (o: Partial<Task>): Task => ({
	id: 'x', list_id: 'L', user_id: 'u', parent_id: null, text: '', type: 'task', divider_label: null,
	done: false, abgelegt: false, priority: 'normal', timeframe: null, highlighted: false, pinned: false,
	pinned_by: null, emoji: null, note: null, due_date: null, assigned_to: null, calendar_event_id: null,
	position: 0, created_at: '', updated_at: '', version: 1, ...o
});

const liste = (o: Partial<List>): List => ({
	id: 'L', user_id: 'u', title: 'Einkaufen', icon: '🛒', position: 0, visible: true, kind: 'aufgaben',
	created_at: '', updated_at: '', version: 1, ...o
});

const punkt = { clientX: 10, clientY: 20, preventDefault() {} };

function aufbau() {
	const kuehl = zeile({ id: 'k1', type: 'divider', text: 'Kühlabteilung', position: 0 });
	const sonst = zeile({ id: 'k2', type: 'divider', text: 'Sonstiges', position: 1 });
	const milch = zeile({ id: 'a1', parent_id: 'k1', text: 'Milch' });
	const imWagen = [
		zeile({ id: 'a2', parent_id: 'k1', text: 'Butter', done: true }),
		zeile({ id: 'a3', parent_id: 'k2', text: 'Kerzen', done: true })
	];
	const abgelegt = zeile({ id: 'a4', parent_id: 'k1', text: 'Quark', done: true, abgelegt: true });
	const fremd = zeile({ id: 'f1', list_id: 'X', parent_id: 'k9', text: 'Brot', done: true });
	const store = {
		lists: [],
		tasks: [kuehl, sonst, milch, ...imWagen, abgelegt, fremd],
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
		kategorieLoeschen: vi.fn(async () => true),
		listeUmstellen: vi.fn(async () => true),
		einkaufFertig: vi.fn(async () => 2)
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
		sortierung: {
			aktuell: 'priority',
			optionen: [
				{ wert: 'manual', label: 'Manuell' },
				{ wert: 'priority', label: 'Priorität' },
				{ wert: 'due', label: 'Fällig' },
				{ wert: 'alpha', label: 'Alphabetisch' },
				{ wert: 'created', label: 'Erstellt' }
			],
			waehlen: vi.fn()
		},
		mobil: false,
		kategorieNeu: vi.fn()
	};
	return { ctx: createContextMenus(deps), deps, store, einkauf, kuehl, milch };
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
		// Der ⋮ an der Ueberschrift bleibt markiert, solange ihr Menue offen steht.
		expect(ctx.offeneTaskId).toBe('k1');
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

describe('Listenmenue einer Aufgabenliste', () => {
	it('hat sieben Eintraege; „Ansicht“ traegt die Sortierung und den Listentyp', async () => {
		const { ctx, deps } = aufbau();
		ctx.handleListContext(punkt, liste({ kind: 'aufgaben' }));
		const items = ctx.contextMenu.items;
		expect(items.filter((i) => !i.divider).map((i) => i.label)).toEqual([
			'Umbenennen',
			'Icon ändern',
			'Teilen',
			'Auswählen',
			'Ansicht',
			'Erledigte löschen',
			'Liste löschen'
		]);
		const ansicht = items.find((i) => i.label === 'Ansicht')!;
		expect(ansicht.extra).toBe('Priorität');
		expect(ansicht.submenu!.map((u) => (u.divider ? '—' : u.label))).toEqual([
			'Manuell',
			'Priorität',
			'Fällig',
			'Alphabetisch',
			'Erstellt',
			'—',
			'Als Einkaufsliste'
		]);
		expect(ansicht.submenu!.filter((u) => u.active).map((u) => u.label)).toEqual(['Priorität']);
		await ausfuehren(ansicht.submenu![0].action);
		expect(deps.sortierung.waehlen).toHaveBeenCalledWith('manual');
	});

	it('„Als Einkaufsliste“ fragt vorher und stellt erst nach der Bestaetigung um', async () => {
		const { ctx, einkauf } = aufbau();
		const eintrag = () => {
			ctx.handleListContext(punkt, liste({ id: 'L', title: 'Einkaufen', kind: 'aufgaben' }));
			return ctx.contextMenu.items.find((i) => i.label === 'Ansicht')!.submenu!.find((u) => u.label === 'Als Einkaufsliste')!;
		};

		let laeuft = ausfuehren(eintrag().action);
		expect(get(confirmStore)).toMatchObject({
			show: true,
			titel: '„Einkaufen“ als Einkaufsliste nutzen?',
			knopf: 'Umstellen',
			destruktiv: false
		});
		resolveConfirm(false);
		await laeuft;
		expect(einkauf.listeUmstellen).not.toHaveBeenCalled();

		laeuft = ausfuehren(eintrag().action);
		resolveConfirm(true);
		await laeuft;
		expect(einkauf.listeUmstellen).toHaveBeenCalledWith('L', 'einkauf');
	});
});

describe('Listenmenue einer Einkaufsliste', () => {
	it('hat sieben Eintraege ohne Auswaehlen und Erledigte loeschen', () => {
		const { ctx } = aufbau();
		ctx.handleListContext(punkt, liste({ kind: 'einkauf' }));
		expect(ctx.contextMenu.items.filter((i) => !i.divider).map((i) => i.label)).toEqual([
			'Umbenennen',
			'Icon ändern',
			'Teilen',
			'Kategorie hinzufügen',
			'Ansicht',
			'Einkauf fertig',
			'Liste löschen'
		]);
		expect(ctx.contextMenu.items.find((i) => i.label === 'Liste löschen')!.danger).toBe(true);
	});

	it('„Einkauf fertig“ zaehlt nur den Wagen dieser Liste und legt ab', async () => {
		const { ctx, einkauf } = aufbau();
		ctx.handleListContext(punkt, liste({ kind: 'einkauf' }));
		const fertig = ctx.contextMenu.items.find((i) => i.label === 'Einkauf fertig')!;
		expect(fertig.extra).toBe('2');
		expect(fertig.inaktiv).toBe(false);
		await ausfuehren(fertig.action);
		expect(einkauf.einkaufFertig).toHaveBeenCalledWith('L');
	});

	it('„Einkauf fertig“ ist bei leerem Wagen inaktiv', () => {
		const { ctx, store } = aufbau();
		store.tasks = store.tasks.filter((t) => !(t.done && !t.abgelegt && t.list_id === 'L'));
		ctx.handleListContext(punkt, liste({ kind: 'einkauf' }));
		const fertig = ctx.contextMenu.items.find((i) => i.label === 'Einkauf fertig')!;
		expect(fertig.extra).toBeUndefined();
		expect(fertig.inaktiv).toBe(true);
	});

	it('„Kategorie hinzufügen“ meint die Liste des Menues', async () => {
		const { ctx, deps } = aufbau();
		ctx.handleListContext(punkt, liste({ id: 'E2', kind: 'einkauf' }));
		await ausfuehren(ctx.contextMenu.items.find((i) => i.label === 'Kategorie hinzufügen')!.action);
		expect(deps.kategorieNeu).toHaveBeenCalledWith('E2');
	});

	it('„Als Aufgabenliste“ stellt ohne Rueckfrage um und meldet es', async () => {
		const { ctx, einkauf } = aufbau();
		ctx.handleListContext(punkt, liste({ kind: 'einkauf' }));
		const unter = ctx.contextMenu.items.find((i) => i.label === 'Ansicht')!.submenu!;
		expect(unter.map((u) => u.label)).toEqual(['Als Aufgabenliste']);
		await ausfuehren(unter[0].action);
		expect(get(confirmStore).show).toBe(false);
		expect(einkauf.listeUmstellen).toHaveBeenCalledWith('L', 'aufgaben');
		expect(get(toasts).map((t) => t.message)).toContain('Wieder eine Aufgabenliste');
	});
});
