import type { Database } from '$lib/types/database';
import type { MenuEintrag } from '$lib/components/tf/ContextMenu.svelte';
import type { Einkauf } from '$lib/stores/einkauf';
import { bestaetigen, showInputDialog, toasts } from '$lib/stores/toast';
import { einkaufsAnsicht } from '$lib/utils/einkauf';

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
 * Auswaehlen · Ansicht (Sortierung ›, darin „Als Einkaufsliste") · ⸺ ·
 * Erledigte loeschen (Zahl) · Liste loeschen (danger).
 *
 * Alles Uebrige lebt seit T7 im Aufgabendetail: Terminieren, Prioritaet,
 * Zeitrahmen, Umbenennen, Unteraufgabe anlegen, Unteraufgaben loeschen,
 * Symbol, Neue Aufgabe darunter. Icons kommen aus dem Stroke-Set
 * (components/tf/Icon.svelte) — keine Emoji fuer Funktionen.
 *
 * **Einkaufsliste** (docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md):
 * Listenmenue Umbenennen · Icon aendern · Teilen · Kategorie hinzufuegen ·
 * Ansicht („Als Aufgabenliste" ›) · ⸺ · Einkauf fertig (Zahl im Wagen) ·
 * Liste loeschen. Kategoriemenue Umbenennen · Loeschen; Artikelmenue
 * Umbenennen · Kategorie aendern (Untermenue) · ⸺ · Loeschen. Artikel haben
 * kein Detail.
 */
export interface ContextMenuDeps {
	store: {
		lists: List[];
		/** Alle Zeilen — fuer die Zahl im Wagen bei „Einkauf fertig". */
		tasks: Task[];
		renameList: (listId: string, name: string) => void;
		deleteDoneInList: (listId: string) => void;
		/**
		 * Zaehler fuer „Erledigte loeschen". Kommt aus dem Store, damit Menue,
		 * Erledigt-Balken und Undo-Toast dieselbe Menge meinen: oberste Ebene,
		 * ohne Trenner. Hier gezaehlt wurde frueher `done && !parent_id` —
		 * Trenner inbegriffen, und geloescht wurde noch einmal etwas anderes.
		 */
		erledigteAnzahl: (listId: string) => number;
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
	/** Aktionen der Einkaufsliste (Kategorie-, Artikel- und Listenmenue). */
	einkauf: Einkauf;
	/** „Kategorie hinzufuegen": Namen abfragen und in DIESER Liste anlegen. */
	kategorieNeu: (listId: string) => void;
}

export function createContextMenus(deps: ContextMenuDeps) {
	let contextMenu = $state<ContextMenuState>({ show: false, x: 0, y: 0, breite: 220, items: [] });
	/**
	 * Aufgabe, deren Menue gerade offen steht — fuer `.more.on` an ihrer
	 * Zeile (Spezifikation Abschnitt 5: „geoeffnet .more.on -> Flaeche
	 * --surface-2, Icon --ink"). `TaskRow` kannte die Eigenschaft
	 * `menuOffen` von Anfang an, aber niemand fuellte sie: bei offenem Menue
	 * verschwand der ⋮ ganz (er ist sonst durchsichtig) und das Menue stand
	 * scheinbar neben nichts.
	 */
	let offeneTaskId = $state<string | null>(null);

	function oeffnen(e: Zeigerpunkt, items: MenuEintrag[], breite = 220, taskId: string | null = null) {
		contextMenu = { show: true, x: e.clientX, y: e.clientY, breite, items };
		offeneTaskId = taskId;
	}

	/**
	 * Listenmenue — sieben Eintraege, je nach Listentyp. Die ersten drei und
	 * der letzte sind gleich; „Ansicht" traegt bei beiden den Wechsel des
	 * Listentyps als letzten Punkt im Untermenue (Ruling R3: kein achter
	 * Eintrag).
	 */
	function handleListContext(e: Zeigerpunkt, list: List) {
		e.preventDefault();
		const { store, sortierung } = deps;
		const geteilt = deps.beteiligteAnzahl(list.id);
		const x = e.clientX;
		const y = e.clientY;

		const vorne: MenuEintrag[] = [
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
			}
		];
		const listeLoeschen: MenuEintrag = {
			label: 'Liste löschen',
			icon: 'loeschen',
			danger: true,
			action: () => deps.listeLoeschen(list)
		};

		if (list.kind === 'einkauf') {
			const imWagen = einkaufsAnsicht(store.tasks.filter((t) => t.list_id === list.id)).wagenAnzahl;
			oeffnen(
				e,
				[
					...vorne,
					{
						label: 'Kategorie hinzufügen',
						icon: 'plus',
						action: () => deps.kategorieNeu(list.id)
					},
					{
						label: 'Ansicht',
						icon: 'sortierung-menue',
						submenu: [
							{
								label: 'Als Aufgabenliste',
								// Ohne Rueckfrage: der Rueckweg ist verlustfrei, Kategorien
								// werden wieder Aufgaben, Abgelegtes bleibt erledigt.
								action: async () => {
									if (await deps.einkauf.listeUmstellen(list.id, 'aufgaben')) {
										toasts.show('Wieder eine Aufgabenliste');
									}
								}
							}
						]
					},
					{ divider: true, label: '' },
					{
						label: 'Einkauf fertig',
						icon: 'haken',
						extra: imWagen > 0 ? String(imWagen) : undefined,
						inaktiv: imWagen === 0,
						// Kein Dialog: `einkaufFertig` legt einen Undo-Toast nach.
						action: () => void deps.einkauf.einkaufFertig(list.id)
					},
					listeLoeschen
				],
				deps.mobil ? 232 : 220
			);
			return;
		}

		const erledigte = store.erledigteAnzahl(list.id);
		oeffnen(
			e,
			[
				...vorne,
				{ label: 'Auswählen', icon: 'auswahl', action: () => deps.startBulkSelect() },
				{
					label: 'Ansicht',
					icon: 'sortierung-menue',
					extra: sortierung.optionen.find((o) => o.wert === sortierung.aktuell)?.label ?? '',
					submenu: [
						...sortierung.optionen.map((o) => ({
							label: o.label,
							action: () => sortierung.waehlen(o.wert),
							active: o.wert === sortierung.aktuell
						})),
						{ divider: true, label: '' },
						{
							label: 'Als Einkaufsliste',
							action: async () => {
								const ok = await bestaetigen({
									titel: `„${list.title}“ als Einkaufsliste nutzen?`,
									text: 'Aufgaben mit Unteraufgaben werden Kategorien, alle anderen Artikel. Zurückstellen geht jederzeit über „Ansicht“.',
									knopf: 'Umstellen',
									destruktiv: false
								});
								if (ok) await deps.einkauf.listeUmstellen(list.id, 'einkauf');
							}
						}
					]
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
				listeLoeschen
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

		oeffnen(
			e,
			[
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
			],
			220,
			task.id
		);
	}

	/**
	 * Menue der Pinnwand (⋮ im Kopf, Spezifikation Abschnitt 4) — genau zwei
	 * Eintraege. Beide gab es schon: „Auswaehlen" ist derselbe Eintrag wie im
	 * Aufgaben- und im Listenmenue, „Alle loesen" der Nachfolger des
	 * gleichnamigen Knopfes aus der Pinnwand, den der Rueckbau mitgenommen
	 * hatte.
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

	/**
	 * Menue an der Ueberschrift einer Kategorie (Einkaufsliste).
	 *
	 * Loeschen ohne Rueckfrage: `kategorieLoeschen` haengt die Artikel nach
	 * „Sonstiges" um, und das Rueckgaengig im Toast nimmt beides zurueck. Ein
	 * Bestaetigungsdialog steht nur, wo es kein Rueckgaengig gibt.
	 */
	function handleKategorieContext(e: Zeigerpunkt, kategorie: Task) {
		e.preventDefault();
		oeffnen(e, [
			{
				label: 'Umbenennen',
				icon: 'umbenennen',
				action: async () => {
					const neu = await showInputDialog('Kategorie umbenennen', '', kategorie.text, 'Neuer Name');
					if (neu?.trim()) deps.store.updateTask(kategorie.id, neu.trim());
				}
			},
			{
				label: 'Löschen',
				icon: 'loeschen',
				danger: true,
				action: () => void deps.einkauf.kategorieLoeschen(kategorie.id)
			}
		], 220, kategorie.id);
	}

	/** Menue an einem Artikel (⋮ am Zeiger, langes Tippen am Finger) — drei Eintraege. */
	function handleArtikelContext(e: Zeigerpunkt, artikel: Task) {
		e.preventDefault();
		const kategorien = deps.einkauf.kategorienVon(artikel.list_id);
		oeffnen(
			e,
			[
				{
					label: 'Umbenennen',
					icon: 'umbenennen',
					action: async () => {
						const neu = await showInputDialog('Artikel umbenennen', '', artikel.text, 'Neuer Name');
						if (neu?.trim()) deps.store.updateTask(artikel.id, neu.trim());
					}
				},
				{
					label: 'Kategorie ändern',
					icon: 'verschieben',
					submenu:
						kategorien.length > 0
							? kategorien.map((k) => ({
									label: k.text,
									active: k.id === artikel.parent_id,
									action: () => void deps.einkauf.kategorieWechseln(artikel.id, k.id)
								}))
							: [{ label: 'Noch keine Kategorie', action: () => {} }]
				},
				{ divider: true, label: '' },
				{
					label: 'Löschen',
					icon: 'loeschen',
					danger: true,
					// Kein Dialog: `deleteTaskDirect` legt einen Undo-Toast nach.
					action: () => deps.store.deleteTaskDirect(artikel.id)
				}
			],
			deps.mobil ? 232 : 220,
			artikel.id
		);
	}

	function close() {
		contextMenu = { show: false, x: 0, y: 0, breite: 220, items: [] };
		offeneTaskId = null;
	}

	return {
		get contextMenu() {
			return contextMenu;
		},
		get offeneTaskId() {
			return offeneTaskId;
		},
		set contextMenu(v: ContextMenuState) {
			contextMenu = v;
		},
		handleListContext,
		handleTaskContext,
		handlePinboardContext,
		handleKategorieContext,
		handleArtikelContext,
		close
	};
}
