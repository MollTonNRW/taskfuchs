import type { Database } from '$lib/types/database';
import type { MenuEintrag } from '$lib/components/tf/ContextMenu.svelte';
import { showInputDialog } from '$lib/stores/toast';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];

export type ContextMenuState = {
	show: boolean;
	x: number;
	y: number;
	breite: number;
	items: MenuEintrag[];
};

/**
 * Was ein Menue vom ausloesenden Ereignis wirklich braucht: einen Punkt auf
 * dem Schirm und die Moeglichkeit, das native Menue abzubestellen.
 *
 * Ein `MouseEvent` erfuellt das von selbst. Auf dem Mobilgeraet gibt es aber
 * keinen Rechtsklick: dort oeffnet langes Tippen das Menue, und die Zeile
 * reicht die Fingerposition aus `TouchEvent.changedTouches[0]` herein
 * (siehe components/tf/TaskRow.svelte). Ohne diesen Typ muesste sie ein
 * MouseEvent erfinden.
 */
export type Zeigerpunkt = {
	clientX: number;
	clientY: number;
	preventDefault(): void;
};

/**
 * Die Menues der Richtung A „Klar" — A-klar-spec.md, Abschnitt 6.
 *
 * **Aufgabenmenue: genau vier Eintraege.** In Liste verschieben (Untermenue) ·
 * Auswaehlen · Anpinnen · ⸺ · Loeschen (danger).
 * **Listenmenue: genau sieben.** Umbenennen · Icon aendern · Teilen (Zahl) ·
 * Auswaehlen · Sortierung (Wert ›) · ⸺ · Erledigte loeschen (Zahl) ·
 * Liste loeschen (danger).
 *
 * Alles Uebrige lebt seit T7 im Aufgabendetail: Terminieren, Prioritaet,
 * Zeitrahmen, Umbenennen, Unteraufgabe anlegen, Unteraufgaben loeschen,
 * Symbol, Neue Aufgabe darunter. Icons kommen aus dem Stroke-Set
 * (components/tf/Icon.svelte) — keine Emoji fuer Funktionen.
 */
export interface ContextMenuDeps {
	store: {
		tasks: Task[];
		lists: List[];
		renameList: (listId: string, name: string) => void;
		deleteDoneInList: (listId: string) => void;
		togglePin: (taskId: string) => void;
		updateTask: (taskId: string, text: string) => void;
		moveTaskToList: (taskId: string, listId: string) => void;
		deleteTaskDirect: (taskId: string) => void;
	};
	/** Mehrfachauswahl starten; ohne Aufgabe nur den Modus einschalten. */
	startBulkSelect: (taskId?: string) => void;
	openShareDialog: (list: List, x: number, y: number) => void;
	openListIconPicker: (listId: string, x: number, y: number) => void;
	/** Liste loeschen — mit Bestaetigungsdialog beim Aufrufer. */
	listeLoeschen: (list: List) => void;
	/** „Alle loesen" der Pinnwand — mit Undo-Toast beim Aufrufer. */
	pinnwandLeeren: () => void;
	/** Anzahl der sichtbaren Beteiligten einer Liste (Zusatz bei „Teilen"). */
	beteiligteAnzahl: (listId: string) => number;
	/** Sortierung: aktueller Wert, alle Moeglichkeiten, Auswahl. */
	sortierung: {
		aktuell: string;
		optionen: { wert: string; label: string }[];
		waehlen: (wert: string) => void;
	};
	/** Breite des Listenmenues: 220 am Zeiger, 232 am Finger. */
	mobil: boolean;
}

export function createContextMenus(deps: ContextMenuDeps) {
	let contextMenu = $state<ContextMenuState>({ show: false, x: 0, y: 0, breite: 220, items: [] });

	function oeffnen(e: Zeigerpunkt, items: MenuEintrag[], breite = 220) {
		contextMenu = { show: true, x: e.clientX, y: e.clientY, breite, items };
	}

	function handleListContext(e: Zeigerpunkt, list: List) {
		e.preventDefault();
		const { store, sortierung } = deps;
		const erledigte = store.tasks.filter((t) => t.list_id === list.id && t.done && !t.parent_id).length;
		const geteilt = deps.beteiligteAnzahl(list.id);
		const x = e.clientX;
		const y = e.clientY;

		oeffnen(
			e,
			[
				{
					label: 'Umbenennen',
					icon: 'umbenennen',
					action: async () => {
						const neu = await showInputDialog('Liste umbenennen', '', list.title, 'Neuer Listenname');
						if (neu?.trim()) store.renameList(list.id, neu.trim());
					}
				},
				{
					label: 'Icon ändern',
					icon: 'emoji',
					action: () => deps.openListIconPicker(list.id, x, y)
				},
				{
					label: 'Teilen',
					icon: 'teilen',
					// Der Zusatz zaehlt alle Beteiligten inklusive der eigenen
					// Person — so wie die Geteilt-Pille im Listen-Header.
					extra: geteilt > 1 ? String(geteilt) : undefined,
					action: () => deps.openShareDialog(list, x, y)
				},
				{ label: 'Auswählen', icon: 'auswahl', action: () => deps.startBulkSelect() },
				{
					label: 'Sortierung',
					icon: 'sortierung-menue',
					extra: sortierung.optionen.find((o) => o.wert === sortierung.aktuell)?.label ?? '',
					submenu: sortierung.optionen.map((o) => ({
						label: o.label,
						action: () => sortierung.waehlen(o.wert),
						active: o.wert === sortierung.aktuell
					}))
				},
				{ divider: true, label: '' },
				{
					label: 'Erledigte löschen',
					icon: 'loeschen',
					extra: erledigte > 0 ? String(erledigte) : undefined,
					inaktiv: erledigte === 0,
					// Kein Dialog: `deleteDoneInList` legt einen Undo-Toast nach.
					action: () => store.deleteDoneInList(list.id)
				},
				{
					label: 'Liste löschen',
					icon: 'loeschen',
					danger: true,
					action: () => deps.listeLoeschen(list)
				}
			],
			deps.mobil ? 232 : 220
		);
	}

	function handleTaskContext(e: Zeigerpunkt, task: Task) {
		e.preventDefault();
		const { store } = deps;

		// Trenner: ein Restbestand aus der Zeit vor dem Umbau. Neue Trenner
		// legt die Oberflaeche nicht mehr an, vorhandene bleiben bedienbar.
		if (task.type === 'divider') {
			oeffnen(e, [
				{
					label: 'Umbenennen',
					icon: 'umbenennen',
					action: async () => {
						const neu = await showInputDialog('Trenner umbenennen', '', task.text, 'Neuer Trenner-Name');
						if (neu?.trim()) store.updateTask(task.id, neu.trim());
					}
				},
				{
					label: 'Löschen',
					icon: 'loeschen',
					danger: true,
					action: () => store.deleteTaskDirect(task.id)
				}
			]);
			return;
		}

		// Unteraufgabe: Umbenennen und Prioritaet stehen im Detail, hier bleibt
		// nur der Griff, den die Zeile selbst nicht hat.
		if (task.parent_id) {
			oeffnen(e, [
				{
					label: 'Löschen',
					icon: 'loeschen',
					danger: true,
					action: () => store.deleteTaskDirect(task.id)
				}
			]);
			return;
		}

		const andereListen = store.lists.filter((l) => l.id !== task.list_id);

		oeffnen(e, [
			{
				label: 'In Liste verschieben',
				icon: 'verschieben',
				submenu:
					andereListen.length > 0
						? andereListen.map((l) => ({
								label: l.title,
								emoji: l.icon,
								action: () => store.moveTaskToList(task.id, l.id)
							}))
						: [{ label: 'Keine weitere Liste', action: () => {} }]
			},
			{ label: 'Auswählen', icon: 'auswahl', action: () => deps.startBulkSelect(task.id) },
			{
				label: task.pinned ? 'Loslösen' : 'Anpinnen',
				icon: 'pin',
				action: () => store.togglePin(task.id)
			},
			{ divider: true, label: '' },
			{
				label: 'Löschen',
				icon: 'loeschen',
				danger: true,
				// Kein Dialog: `deleteTaskDirect` legt einen Undo-Toast nach.
				action: () => store.deleteTaskDirect(task.id)
			}
		]);
	}

	/**
	 * Menue der Pinnwand (⋮ im Kopf, Spezifikation Abschnitt 4) — genau zwei
	 * Eintraege. Beide gab es schon: „Auswaehlen" ist derselbe Eintrag wie im
	 * Aufgaben- und im Listenmenue, „Alle loesen" der Nachfolger des
	 * gleichnamigen Knopfes aus `components/v2/Pinboard.svelte`, den der
	 * Rueckbau mitgenommen hatte.
	 *
	 * Kein Bestaetigungsdialog: der steht laut Abschnitt 6 nur dort, wo es
	 * kein Rueckgaengig gibt — „Alle loesen" bekommt einen Undo-Toast.
	 */
	function handlePinboardContext(e: Zeigerpunkt, anzahl: number) {
		e.preventDefault();
		oeffnen(
			e,
			[
				{ label: 'Auswählen', icon: 'auswahl', action: () => deps.startBulkSelect() },
				{ divider: true, label: '' },
				{
					label: 'Alle lösen',
					icon: 'pin',
					extra: anzahl > 0 ? String(anzahl) : undefined,
					inaktiv: anzahl === 0,
					action: () => deps.pinnwandLeeren()
				}
			],
			deps.mobil ? 232 : 220
		);
	}

	function close() {
		contextMenu = { show: false, x: 0, y: 0, breite: 220, items: [] };
	}

	return {
		get contextMenu() {
			return contextMenu;
		},
		set contextMenu(v: ContextMenuState) {
			contextMenu = v;
		},
		handleListContext,
		handleTaskContext,
		handlePinboardContext,
		close
	};
}
