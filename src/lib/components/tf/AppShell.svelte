<script lang="ts" module>
	import type { MobileTab as MobileTabTyp } from '$lib/stores/tf/navigation.svelte';

	/**
	 * Startzustand, den die Vorschau-Route `/vorschau` aus ihren
	 * Abfrageparametern baut (siehe `routes/vorschau/+page.svelte`).
	 *
	 * In `/app` ist das Feld `undefined` — die App stellt ihre Zustaende selbst
	 * her. Die Vorschau braucht sie ohne Bedienung: das Abnahmeskript faehrt
	 * elf Frames nacheinander an und kann weder Menues oeffnen noch tippen.
	 */
	export type VorschauZustand = {
		liste?: string;
		task?: string;
		tab?: MobileTabTyp;
		offen?: boolean;
		dunkel?: boolean;
		teilen?: boolean;
		menu?: string;
		listenmenu?: boolean;
		neueliste?: boolean;
		suche?: string;
		quickadd?: string;
		toast?: 'geloescht' | 'erledigt';
		confirm?: 'liste';
	};
</script>

<script lang="ts">
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import { onMount, tick, untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Database } from '$lib/types/database';
	import type { Priority, Timeframe } from '$lib/constants';
	import { nav, type MobileTab } from '$lib/stores/tf/navigation.svelte';
	import { theme } from '$lib/stores/tf/theme.svelte';
	import { getProfilesByIds } from '$lib/services/supabase-crud';
	import { baueAusProfil, type Mitnutzer } from '$lib/utils/mitnutzer';

	import Icon from '$lib/components/tf/Icon.svelte';
	import NavColumn from '$lib/components/tf/NavColumn.svelte';
	import ListsOverview from '$lib/components/tf/ListsOverview.svelte';
	import MobileTabBar from '$lib/components/tf/MobileTabBar.svelte';
	import SmartList from '$lib/components/tf/SmartList.svelte';
	import AvatarStack from '$lib/components/tf/AvatarStack.svelte';
	import TaskList from '$lib/components/tf/TaskList.svelte';
	import TaskDetail from '$lib/components/tf/TaskDetail.svelte';
	import DetailSheet from '$lib/components/tf/DetailSheet.svelte';
	import SearchPalette from '$lib/components/tf/SearchPalette.svelte';
	import SearchMobile from '$lib/components/tf/SearchMobile.svelte';

	import ToastContainer from '$lib/components/tf/ToastContainer.svelte';
	import ConfirmDialog from '$lib/components/tf/ConfirmDialog.svelte';
	import ContextMenu from '$lib/components/tf/ContextMenu.svelte';
	import ShareDialog from '$lib/components/tf/ShareDialog.svelte';
	import BulkToolbar from '$lib/components/tf/BulkToolbar.svelte';

	import InputDialog from '$lib/components/tf/InputDialog.svelte';
	import EmojiPicker from '$lib/components/tf/EmojiPicker.svelte';

	import {
		createContextMenus,
		type ContextMenuDeps,
		type Zeigerpunkt
	} from '$lib/composables/tf/useContextMenus.svelte';
	import { createSortFilter, sortLabels, validSortModes, type SortMode } from '$lib/composables/tf/useSortFilter.svelte';
	import { createShareDialog } from '$lib/composables/tf/useShareDialog.svelte';
	import { bestaetigen, toasts } from '$lib/stores/toast';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	/**
	 * Die gesamte Oberflaeche der Richtung A „Klar" — drei Spalten am Zeiger,
	 * Tab-Leiste am Finger.
	 *
	 * Sie steht als Komponente und nicht mehr in `routes/app/+page.svelte`,
	 * damit die Vorschau-Route `/vorschau` DIESELBE Shell mounten kann statt
	 * einer nachgebauten zweiten. Was die Seite mitbringt, sind Daten und ein
	 * Datenbankzugang — woher die kommen, ist der Shell gleichgueltig.
	 */
	let {
		supabase,
		benutzerId,
		benutzerEmail,
		startListen,
		startAufgaben,
		startMitnutzer = {},
		onLogout,
		vorschau
	}: {
		supabase: SupabaseClient<Database>;
		benutzerId: string | null;
		benutzerEmail: string | null;
		startListen: List[];
		startAufgaben: Task[];
		startMitnutzer?: Record<string, Mitnutzer[]>;
		onLogout: () => void;
		/** Nur `/vorschau`: Startzustand aus Abfrageparametern. */
		vorschau?: VorschauZustand;
	} = $props();

	const store = createTaskStore();

	// Initialize store in $effect (runs during hydration before onMount)
	let storeReady = $state(false);
	$effect(() => {
		if (supabase && benutzerId && !storeReady) {
			store.init(supabase, benutzerId, startListen, startAufgaben);
			// Gespeicherte Listenauswahl gegen die geladenen Listen pruefen
			nav.hydrate(startListen.map((l: List) => l.id));
			storeReady = true;
		}
	});

	// Reactive lists/tasks from store
	let lists = $derived(store.lists);
	let tasks = $derived(store.tasks);

	// Aktive Liste und Detail-Auswahl kommen aus dem gemeinsamen Navigationszustand
	let activeList = $derived(lists.find((l: List) => l.id === nav.activeListId) ?? null);
	let selectedTask = $derived(
		nav.selectedTaskId ? (tasks.find((t: Task) => t.id === nav.selectedTaskId) ?? null) : null
	);

	// Bestand nachfuehren: faellt die aktive Liste weg (Loeschen, Realtime), rueckt
	// nav auf die naechste vorhandene; ist die ausgewaehlte Aufgabe verschwunden,
	// faellt die Auswahl. untrack, damit die Schreibvorgaenge auf nav diesen
	// Effekt nicht erneut ausloesen.
	$effect(() => {
		if (!storeReady) return;
		const ids = lists.map((l: List) => l.id);
		const vorhandene = tasks;
		untrack(() => {
			nav.syncLists(ids);
			if (nav.selectedTaskId && !vorhandene.some((t: Task) => t.id === nav.selectedTaskId)) {
				nav.selectTask(null);
			}
		});
	});

	// ==========================================
	// BREAKPOINT — genau ein Ort fuer „mobil"
	// ==========================================
	// 900 px: darunter blieben von 248 + 384 px Fixbreite weniger als 270 px
	// fuer die Liste. Die drei frueheren Mechanismen (window.innerWidth >= 769
	// ohne Resize-Listener, harte 768-px-Abfragen, eigenes matchMedia) sind
	// ersatzlos entfallen.
	// Startwert bewusst wie auf dem Server: `bind:innerWidth` setzt die echte
	// Breite noch vor dem ersten Bild. Wuerde hier schon window.innerWidth
	// stehen, unterschiede sich der erste Client-Baum vom SSR-Baum und die
	// Hydration liefe auf die falschen Knoten.
	let fensterBreite = $state(1200);
	let isMobile = $derived(fensterBreite < 900);

	// Das Listenmenue hat mit dem Umbau auf sieben Eintraege sein
	// „Unteraufgaben ein-/ausklappen" verloren (Spezifikation Abschnitt 6);
	// damit entfaellt der erzwungene Klappzustand je Liste ersatzlos. Jede
	// Zeile entscheidet wieder selbst, TaskList bekommt kein forceSubtasksOpen.

	// Bulk selection
	let bulkSelectedIds = $state(new Set<string>());
	let explicitBulkMode = $state(false);
	let bulkMode = $derived(explicitBulkMode || bulkSelectedIds.size > 0);

	function toggleBulkSelect(taskId: string) {
		const next = new Set(bulkSelectedIds);
		if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
		bulkSelectedIds = next;
	}

	function clearBulkSelection() {
		bulkSelectedIds = new Set();
		explicitBulkMode = false;
	}

	// Sort menu position (computed from sort button)
	let sortMenuPos = $state<{ left: number; top: number }>({ left: 0, top: 0 });

	// ==========================================
	// ZAEHLER DER NAVIGATION
	// ==========================================
	// Offene Aufgaben der obersten Ebene je Liste. Kommt aus `store.tasks`,
	// nicht mehr aus dem alten Ereignisbus (`v2Events.navCounts`).
	let offeneJeListe = $derived.by(() => {
		const m = new Map<string, number>();
		for (const t of tasks) {
			if (t.done || t.parent_id || t.type === 'divider') continue;
			m.set(t.list_id, (m.get(t.list_id) ?? 0) + 1);
		}
		return m;
	});

	// ==========================================
	// MITNUTZER
	// ==========================================
	// Zuordnung listId -> Beteiligte aus `+page.ts` (list_shares + profiles).
	// Die Navigationszeile und die mobile Uebersicht zeigen nur die ANDEREN,
	// die Geteilt-Pille im Listen-Header alle — inklusive des eigenen Avatars.
	// Aenderungen aus dem Teilen-Dialog legen sich ueber den Ladezustand,
	// damit neue Avatare ohne Neuladen erscheinen (T5b hatte das offen
	// gelassen). Die Ladedaten bleiben unangetastet.
	let mitnutzerLaufzeit = $state<Record<string, Mitnutzer[]>>({});
	let mitnutzer = $derived<Record<string, Mitnutzer[]>>({
		...startMitnutzer,
		...mitnutzerLaufzeit
	});
	let aktiveBeteiligte = $derived(activeList ? (mitnutzer[activeList.id] ?? []) : []);
	let aktiveFremde = $derived(aktiveBeteiligte.filter((m: Mitnutzer) => !m.ich));

	// ==========================================
	// SMART-ANSICHTEN (Spezifikation Abschnitt 6)
	// ==========================================
	/**
	 * Angepinnt: `pinned && !done`, oberste Ebene, ohne Trenner. Die drei
	 * fremden Leser (G2-Startbildschirm, InkyPi `pins.py`, Webhook
	 * `taskfuchs-read`) holen dieselbe Menge direkt aus der Datenbank —
	 * geschrieben werden `pinned` und `pinned_by` unveraendert in
	 * `tasks.svelte.ts` (`togglePin`, `clearPinboard`, `restorePins`).
	 */
	let pinnedTasks = $derived(
		tasks.filter((t: Task) => t.pinned && !t.done && !t.parent_id && t.type !== 'divider')
	);

	/** Dringend: ASAP/High oder heute faellig bzw. ueberfaellig, jeweils offen. */
	let dringendTasks = $derived.by(() => {
		// Ende des heutigen Tages als Zeitstempel — ohne ein Date-Objekt zu halten.
		const heuteEndeMs = new Date().setHours(23, 59, 59, 999);
		return tasks.filter((t: Task) => {
			if (t.done || t.parent_id || t.type === 'divider') return false;
			if (t.priority === 'asap' || t.priority === 'high') return true;
			if (!t.due_date) return false;
			const faellig = Date.parse(t.due_date);
			return !Number.isNaN(faellig) && faellig <= heuteEndeMs;
		});
	});

	function subtasksFor(taskId: string): Task[] {
		return tasks
			.filter((t: Task) => t.parent_id === taskId)
			.sort((a: Task, b: Task) => a.position - b.position);
	}

	// ==========================================
	// FREMDE PROFILE NACHLADEN
	// ==========================================
	/**
	 * Wer in einer FREMDEN geteilten Liste angelegt oder angepinnt hat,
	 * steht nicht in `mitnutzer`: RLS laesst dort nur den Besitzer und die
	 * eigene Freigabezeile durch (Migration 003). Der Chip „gepinnt von
	 * Ingo" aus Spezifikation Frame 9 fiel genau deshalb ersatzlos aus —
	 * die Profile wurden zwar nachgeladen, aber in einen Store geschrieben,
	 * den niemand las.
	 *
	 * Jetzt landen sie hier und gehen als Rueckfallebene an die Zeilen.
	 */
	let fremdeProfile = $state<Record<string, Mitnutzer>>({});
	let angefragteIds = new Set<string>();

	$effect(() => {
		const sb = supabase;
		const me = benutzerId;
		if (!sb) return;
		const bekannt = mitnutzer;
		const fehlend = new Set<string>();
		for (const t of tasks) {
			for (const id of [t.pinned_by, t.user_id]) {
				if (!id || id === me || angefragteIds.has(id)) continue;
				if ((bekannt[t.list_id] ?? []).some((m: Mitnutzer) => m.id === id)) continue;
				fehlend.add(id);
			}
		}
		if (fehlend.size === 0) return;
		for (const id of fehlend) angefragteIds.add(id);
		getProfilesByIds(sb, [...fehlend]).then(({ data: profile }) => {
			if (!profile || profile.length === 0) return;
			const zusatz: Record<string, Mitnutzer> = {};
			for (const pr of profile) zusatz[pr.id] = baueAusProfil(pr);
			fremdeProfile = { ...fremdeProfile, ...zusatz };
		});
	});

	// ==========================================
	// „NEU" — gesehene Listen
	// ==========================================
	/**
	 * Vermerkt wird die ZUVOR offene Liste, nicht die gerade geoeffnete:
	 * wer eine Liste ansieht, soll ihre „neu"-Marker auch lesen koennen
	 * (Spezifikation Frame 1 zeigt „Gluehbirnen Flur" mit Chip in der
	 * offenen Liste). Erst beim Weitergehen faellt der Marker.
	 */
	let zuletztOffen: string | null = null;
	$effect(() => {
		const jetzt = nav.activeListId;
		untrack(() => {
			if (zuletztOffen && zuletztOffen !== jetzt) store.listeGesehen(zuletztOffen);
			zuletztOffen = jetzt;
		});
	});

	// ==========================================
	// SUCHE
	// ==========================================
	// Zwei Fassungen, ein Suchwerk (`utils/suche.ts`): auf dem Zeigergeraet
	// die ⌘K-Palette ueber allem, am Finger ein eigener Tab. `searchOpen`
	// gilt nur fuer die Palette — der mobile Tab ist ein Schirm, kein
	// Overlay, und steht in `nav.mobileTab`.
	let searchOpen = $state(false);
	// Der Suchbegriff des mobilen Tabs lebt hier, nicht in der Komponente:
	// wer einen Treffer antippt, wechselt in den Tab „Listen" — kommt er
	// zurueck, soll seine Eingabe noch dastehen.
	let mobileSuche = $state('');
	/** Vorbelegung der Palette — nur die Vorschau-Route setzt sie. */
	let suchVorgabe = $state('');

	// Wird das Fenster unter den Umbruch gezogen, waehrend die Palette offen
	// steht, uebernimmt der Tab. Ohne das bliebe `searchOpen` unsichtbar
	// stehen und verschluckte drueben den naechsten Escape.
	$effect(() => {
		if (isMobile && searchOpen) searchOpen = false;
	});

	// List Icon Picker state
	let listIconPicker = $state<{ show: boolean; listId: string; x: number; y: number }>({ show: false, listId: '', x: 0, y: 0 });

	function openListIconPicker(listId: string, x: number, y: number) {
		listIconPicker = { show: true, listId, x, y };
	}

	function handleListIconSelect(emoji: string) {
		if (listIconPicker.listId) {
			store.changeListIcon(listIconPicker.listId, emoji || '📋');
		}
	}

	// ==========================================
	// COMPOSABLES
	// ==========================================

	// Sort/Filter
	const sortFilter = createSortFilter(
		{
			get tasks() { return tasks; },
			reorderTask: (taskId: string, targetListId: string, newPosition: number) => store.reorderTask(taskId, targetListId, newPosition)
		},
		{ show: (msg: string, type: 'info' | 'error' | 'success', duration?: number) => toasts.show(msg, type, duration) }
	);

	// Share Dialog
	const share = createShareDialog(
		{
			get sb() { return supabase; },
			get eigeneId() { return benutzerId; },
			get eigeneEmail() { return benutzerEmail; }
		},
		{ error: (msg: string) => toasts.error(msg) },
		// Ohne diese Rueckmeldung erschiene ein neuer Mitnutzer erst nach
		// einem Neuladen in Navigationsspalte, Uebersicht und Geteilt-Pille.
		(listId: string, beteiligte: Mitnutzer[]) => {
			mitnutzerLaufzeit = { ...mitnutzerLaufzeit, [listId]: beteiligte };
		}
	);

	/**
	 * Liste loeschen — der einzige Ort mit Bestaetigungsdialog.
	 *
	 * Spezifikation Abschnitt 6: ein Dialog steht nur, wo es kein
	 * Rueckgaengig gibt. Der Text nennt die konkreten Zahlen und die
	 * Mitnutzer, denen die Liste ebenfalls verschwindet.
	 */
	async function listeLoeschen(list: List) {
		const offen = tasks.filter((t: Task) => t.list_id === list.id && !t.done && !t.parent_id && t.type !== 'divider').length;
		const erledigt = tasks.filter((t: Task) => t.list_id === list.id && t.done && !t.parent_id).length;
		const andere = (mitnutzer[list.id] ?? []).filter((m: Mitnutzer) => !m.ich);

		const teile: string[] = [];
		if (offen + erledigt > 0) {
			teile.push(
				`${offen} offene und ${erledigt} erledigte ${offen + erledigt === 1 ? 'Aufgabe wird' : 'Aufgaben werden'} mit gelöscht.`
			);
		}
		if (andere.length > 0) {
			const namen =
				andere.length === 1
					? andere[0].name
					: `${andere.slice(0, -1).map((m: Mitnutzer) => m.name).join(', ')} und ${andere[andere.length - 1].name}`;
			teile.push(`Die Liste ist mit ${namen} geteilt und verschwindet auch bei ihnen.`);
		}
		teile.push('Das lässt sich nicht rückgängig machen.');

		const ok = await bestaetigen({
			titel: `Liste \u201e${list.title}\u201c löschen?`,
			text: teile.join(' '),
			knopf: 'Liste löschen',
			destruktiv: true
		});
		if (ok) store.deleteList(list.id);
	}

	/**
	 * „Alle lösen" aus dem Pinnwand-Menü. Kein Dialog, sondern ein Undo-Toast
	 * (Spezifikation Abschnitt 6) — und das Rückgängig stellt auch wieder
	 * her, WER angepinnt hatte; `pinned_by` darf nicht auf denjenigen
	 * umspringen, der den Toast anklickt.
	 */
	async function pinnwandLeeren() {
		const vorher = await store.clearPinboard();
		if (vorher.length === 0) return;
		toasts.undo(
			vorher.length === 1 ? 'Pin gelöst' : `${vorher.length} Pins gelöst`,
			() => store.restorePins(vorher)
		);
	}

	// Context Menus — vier Eintraege an der Aufgabe, sieben an der Liste.
	// Die Bruecke ist mit ihnen geschrumpft: von 24 Rueckrufen auf das, was
	// die beiden Menues wirklich noch ausloesen.
	const ctxDeps: ContextMenuDeps = {
		store: {
			get lists() { return lists; },
			renameList: (listId: string, name: string) => store.renameList(listId, name),
			deleteDoneInList: (listId: string) => void store.deleteDoneInList(listId),
			// Dieselbe Regel wie Erledigt-Balken und Undo-Toast: oberste Ebene,
			// ohne Trenner. Frueher zaehlte das Menue selbst und kam damit auf
			// eine andere Zahl als der Toast anschliessend meldete.
			erledigteAnzahl: (listId: string) => store.erledigteAnzahl(listId),
			togglePin: (taskId: string) => store.togglePin(taskId),
			updateTask: (taskId: string, text: string) => store.updateTask(taskId, text),
			moveTaskToList: (taskId: string, listId: string) => store.moveTaskToList(taskId, listId),
			deleteTaskDirect: (taskId: string) => store.deleteTaskDirect(taskId)
		},
		startBulkSelect: (taskId?: string) => {
			explicitBulkMode = true;
			if (taskId) bulkSelectedIds = new Set([...bulkSelectedIds, taskId]);
		},
		openShareDialog: (list: List, x: number, y: number) => share.openShareDialog(list, x, y),
		openListIconPicker: (listId: string, x: number, y: number) => openListIconPicker(listId, x, y),
		listeLoeschen,
		pinnwandLeeren,
		beteiligteAnzahl: (listId: string) => (mitnutzer[listId] ?? []).length,
		sortierung: {
			get aktuell() { return sortFilter.sortMode; },
			optionen: validSortModes.map((m) => ({ wert: m, label: sortLabels[m] })),
			waehlen: (wert: string) => { sortFilter.sortMode = wert as SortMode; }
		},
		get mobil() { return isMobile; }
	};
	const ctx = createContextMenus(ctxDeps);

	// Sorted tasks for active list (reactive to sortMode changes)
	// Read sortFilter.sortMode explicitly so Svelte 5 tracks it as a dependency
	let sortedActiveListTasks = $derived.by(() => {
		const _mode = sortFilter.sortMode; // explicit dependency on sortMode
		if (!activeList) return [];
		return sortFilter.tasksForList(activeList.id);
	});

	// ==========================================
	// DETAIL
	// ==========================================
	// Unteraufgaben und Liste der ausgewaehlten Aufgabe. Die Liste traegt
	// den Chip im Detail-Kopf und ist nicht zwingend die gerade offene —
	// die Suche und die Smart-Ansichten waehlen quer ueber alle Listen.
	let focusSubtasks = $derived(selectedTask ? subtasksFor(selectedTask.id) : []);
	let detailListe = $derived(
		selectedTask ? (lists.find((l: List) => l.id === selectedTask.list_id) ?? null) : null
	);

	/** Die gemeinsamen Rueckrufe des Details — Spalte und Sheet teilen sie. */
	const detailAktionen = {
		onSchliessen: () => nav.selectTask(null),
		onToggle: handleToggleTask,
		onUmbenennen: (id: string, text: string) => store.updateTask(id, text),
		onPrioritaet: (id: string, p: Priority) => store.changeTaskPriority(id, p),
		onZeitrahmen: (id: string, tf: Timeframe | null) => store.changeTaskTimeframe(id, tf),
		onFaellig: (id: string, wert: string | null) => store.updateTaskDate(id, wert),
		onNotiz: (id: string, note: string) => store.updateTaskNote(id, note),
		onPin: (id: string) => store.togglePin(id),
		onVerschieben: (id: string, listId: string) => store.moveTaskToList(id, listId),
		// Kein Bestaetigungsdialog — `deleteTaskDirect` legt einen Undo-Toast
		// nach (Spezifikation Abschnitt 6). Die Auswahl raeumt der Effekt
		// oben ab, sobald die Aufgabe aus dem Bestand faellt.
		onLoeschen: (id: string) => void store.deleteTaskDirect(id),
		onUnterToggle: handleToggleTask,
		onUnterUmbenennen: (id: string, text: string) => store.updateSubtask(id, text),
		onUnterLoeschen: (id: string) => store.deleteSubtask(id),
		onUnterNeu: (parentId: string, text: string) => store.addSubtask(parentId, text)
	};

	// ==========================================
	// SCHIRM-ZUSTAND
	// ==========================================
	/** Mobil: Unterschirm „Liste geoeffnet" bzw. Smart-Ansicht. */
	let unterschirm = $derived(nav.listOpenMobile);
	/** Kopfzeile und Inhalt der Mitte: Smart-Ansicht schlaegt die Liste. */
	let smartTitel = $derived(nav.smartView === 'pins' ? 'Angepinnt' : 'Dringend');
	let smartAufgaben = $derived(nav.smartView === 'pins' ? pinnedTasks : dringendTasks);
	let smartLeerText = $derived(
		nav.smartView === 'pins' ? 'Nichts angepinnt.' : 'Nichts Dringendes. Gute Lage.'
	);

	let benutzerName = $derived.by(() => {
		const mail = benutzerEmail ?? '';
		const lokal = mail.split('@')[0] ?? '';
		return lokal ? lokal.charAt(0).toUpperCase() + lokal.slice(1) : 'Ich';
	});
	let benutzerInitiale = $derived(benutzerName.charAt(0).toUpperCase());

	/** Liegt der Fokus in einem Textfeld? Dann gehoeren Pfeiltasten dem Cursor. */
	function inEingabefeld(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
	}

	// Realtime + Keyboard shortcuts
	onMount(() => {
		// Realtime subscriptions (guard against missing supabase)
		const sb = supabase;
		let listsChannel: any = null;
		let tasksChannel: any = null;
		/**
		 * Realtime holt verpasste Ereignisse nicht nach — was waehrend einer
		 * Unterbrechung geschah, war bisher dauerhaft verloren. Der
		 * SUBSCRIBED-Rueckruf feuert beim ersten Verbinden UND nach jedem
		 * Wiederverbinden; beide Kanaele melden sich einzeln, darum ein
		 * kurzer Sammelpunkt gegen den doppelten Ladevorgang.
		 */
		let resyncUhr: ReturnType<typeof setTimeout> | null = null;
		function nachVerbindung(status: string) {
			if (status !== 'SUBSCRIBED') return;
			if (resyncUhr) clearTimeout(resyncUhr);
			resyncUhr = setTimeout(() => {
				resyncUhr = null;
				void store.resync();
			}, 150);
		}
		if (sb) {
			listsChannel = sb
				.channel('tf-lists-realtime')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, (payload: any) => {
					store.handleRealtimeList(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
				})
				.subscribe(nachVerbindung);
			tasksChannel = sb
				.channel('tf-tasks-realtime')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload: any) => {
					store.handleRealtimeTask(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
				})
				.subscribe(nachVerbindung);
		}

		// Keyboard shortcuts — genau eine Ctrl+K-Registrierung (die zweite im
		// Layout ist mit der alten Kopfzeile entfallen, nachgeprueft in T9).
		function handleGlobalKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				// Am Finger gibt es keine Palette, sondern den Tab „Suche" —
				// eine angeschlossene Tastatur soll trotzdem dort landen.
				if (isMobile) nav.setTab('suche');
				else searchOpen = !searchOpen;
			}
			// Escape: close all overlays
			if (e.key === 'Escape') {
				if (ctx.contextMenu.show) { ctx.close(); return; }
				if (listIconPicker.show) { listIconPicker = { show: false, listId: '', x: 0, y: 0 }; return; }
				if (share.shareDialog.show) { share.close(); return; }
				if (searchOpen) { searchOpen = false; return; }
				if (nav.selectedTaskId) { nav.selectTask(null); return; }
				if (bulkMode) { clearBulkSelection(); return; }
			}
			// Pfeiltasten: Nachbarliste waehlen — aber nie in einem Eingabefeld,
			// dort gehoert links/rechts dem Cursor.
			if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !inEingabefeld(e.target)) {
				const idx = lists.findIndex((l: List) => l.id === nav.activeListId);
				if (idx >= 0) {
					const ziel = lists[idx + (e.key === 'ArrowLeft' ? -1 : 1)];
					if (ziel) nav.selectList(ziel.id);
				}
			}
			// Delete: Auswahl im Mehrfachmodus loeschen. Die Bedingung lautete
			// `!e.target` und war damit tot — ein Tastendruck hat immer ein Ziel.
			// Gemeint war: nicht waehrend einer Texteingabe.
			if (
				(e.key === 'Delete' || e.key === 'Backspace') &&
				bulkMode &&
				!inEingabefeld(e.target)
			) {
				e.preventDefault();
				void store.bulkDelete([...bulkSelectedIds]);
				clearBulkSelection();
			}
		}
		window.addEventListener('keydown', handleGlobalKeydown);

		return () => {
			window.removeEventListener('keydown', handleGlobalKeydown);
			if (resyncUhr) clearTimeout(resyncUhr);
			if (sb && listsChannel) sb.removeChannel(listsChannel);
			if (sb && tasksChannel) sb.removeChannel(tasksChannel);
		};
	});

	// ==========================================
	// HANDLERS
	// ==========================================
	function handleQuickAdd(listId: string, text: string) {
		store.addTask(listId, text);
	}

	function handleToggleTask(id: string) {
		const task = tasks.find((t: Task) => t.id === id);
		if (task) {
			const newDone = !task.done;
			store.toggleTask(id, newDone);
		}
	}

	function handleEditTask(id: string, text: string) {
		store.updateTask(id, text);
	}

	function handleContextMenu(e: Zeigerpunkt, task: Task) {
		ctx.handleTaskContext(e, task);
	}

	/**
	 * Karte „Neue Liste": erst hier wird geschrieben, dann gleich hinspringen.
	 * Der Rueckgabewert entscheidet, ob die Karte schliesst — schlaegt das
	 * Anlegen fehl, bleibt sie mit Name und Symbol stehen.
	 */
	async function neueListeAnlegen(title: string, icon: string): Promise<boolean> {
		const id = await store.createList(title, icon);
		if (!id) return false;
		nav.selectList(id);
		return true;
	}

	function handleTaskOpen(task: Task) {
		nav.selectTask(task.id);
	}

	/**
	 * Die Liste hinter der Palette mitfuehren (Spezifikation Frame 3).
	 * Erst die Liste — sie raeumt die alte Auswahl ab —, dann die Aufgabe.
	 */
	function sucheVorschau(listId: string, taskId: string) {
		nav.selectList(listId);
		nav.selectTask(taskId);
	}

	/** Mobiler Treffer angetippt: zurueck in den Listen-Tab und hinspringen. */
	function sucheOeffnenMobil(listId: string, taskId: string) {
		nav.setTab('listen');
		sucheVorschau(listId, taskId);
	}

	function sucheSchliessen() {
		searchOpen = false;
	}

	function waehleTab(t: MobileTab) {
		nav.setTab(t);
	}

	function zurueck() {
		nav.back();
	}

	// ==========================================
	// VORSCHAU-ZUSTAENDE (nur /vorschau)
	// ==========================================
	/** Karte „Neue Liste" ausgeklappt starten. */
	let vorschauNeueListe = $state(false);
	/** Quick-Add aktiv mit diesem Text starten. */
	let vorschauQuickAdd = $state('');

	/** Rechteck eines Elements als Zeigerpunkt fuer die Menue-Funktionen. */
	function ankerAus(auswahl: string): Zeigerpunkt | null {
		const el = document.querySelector(auswahl);
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { clientX: r.right, clientY: r.bottom, preventDefault() {} };
	}

	/**
	 * Stellt einen der elf Mockup-Zustaende her, ohne dass jemand klickt.
	 *
	 * Alles, was auch ein Mensch ausloesen wuerde, laeuft hier ueber
	 * denselben Weg wie bei einer Bedienung — `nav`, `theme`, `ctx`, `share`,
	 * `store`. Es gibt keine zweite Logik und keine gestellten Anzeigen: der
	 * Undo-Toast „8 erledigte Aufgaben geloescht" entsteht, indem wirklich
	 * geloescht wird, und „Hecke schneiden erledigt" entsteht, indem die
	 * Aufgabe wirklich abgehakt wird.
	 */
	async function vorschauHerstellen(v: VorschauZustand) {
		const mobil = window.innerWidth < 900;

		if (v.dunkel) theme.set(true);
		if (v.tab) nav.setTab(v.tab);
		if (v.liste) {
			nav.selectList(v.liste);
			// `selectList` oeffnet mobil den Unterschirm; ohne `offen=1` soll
			// die Uebersicht stehen bleiben.
			if (!v.offen) nav.back();
		}
		if (v.task) nav.selectTask(v.task);
		if (v.neueliste) vorschauNeueListe = true;
		if (v.quickadd) vorschauQuickAdd = v.quickadd;
		if (v.suche) {
			if (mobil) {
				nav.setTab('suche');
				mobileSuche = v.suche;
			} else {
				suchVorgabe = v.suche;
				searchOpen = true;
			}
		}

		// Ab hier braucht es den gerenderten Baum: die Menues haengen an den
		// Rechtecken ihrer Knoepfe.
		await tick();

		const liste = lists.find((l: List) => l.id === nav.activeListId) ?? null;

		if (v.teilen && liste) {
			const anker = ankerAus('.tf-shared');
			await share.openShareDialog(liste, anker?.clientX ?? window.innerWidth - 20, anker?.clientY ?? 64);
		}
		if (v.menu) {
			const aufgabe = tasks.find((t: Task) => t.id === v.menu);
			const anker = ankerAus(`[data-tf-task="${v.menu}"] .tf-more`) ?? ankerAus(`[data-tf-task="${v.menu}"]`);
			if (aufgabe && anker) ctx.handleTaskContext(anker, aufgabe);
		}
		if (v.listenmenu && liste) {
			const anker = ankerAus('[data-tf-listenmenu]');
			if (anker) ctx.handleListContext(anker, liste);
		}
		if (v.toast === 'geloescht' && nav.activeListId) {
			await store.deleteDoneInList(nav.activeListId);
		}
		if (v.toast === 'erledigt') {
			// Frame 9 zeigt den Toast zu „Hecke schneiden". Die Aufgabe ist im
			// Demobestand bereits erledigt — also einmal oeffnen (ohne Toast)
			// und wieder abhaken. Danach steht derselbe Bestand wie vorher,
			// und der Toast samt Rueckgaengig ist echt.
			const hecke = tasks.find((t: Task) => t.text === 'Hecke schneiden');
			if (hecke) {
				await store.toggleTask(hecke.id, false);
				await store.toggleTask(hecke.id, true);
			}
		}
		if (v.confirm === 'liste' && liste) {
			void listeLoeschen(liste);
		}
	}

	// Einmal, sobald der Bestand steht: `nav.hydrate` im Init-Effekt hat die
	// aktive Liste da schon gesetzt und wuerde eine fruehere Auswahl sonst
	// wieder ueberschreiben.
	let vorschauLaeuft = false;
	$effect(() => {
		if (!storeReady || !vorschau || vorschauLaeuft) return;
		vorschauLaeuft = true;
		const zustand = vorschau;
		untrack(() => void vorschauHerstellen(zustand));
	});

	function sortMenuUmschalten(e: MouseEvent) {
		if (!sortFilter.sortMenuOpen) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			sortMenuPos = { left: rect.left, top: rect.bottom + 4 };
		}
		sortFilter.sortMenuOpen = !sortFilter.sortMenuOpen;
	}

	// ---- Swipe between lists (mobile) ----
	let swipeStartX = 0;
	let swipeStartY = 0;
	let swipeActive = false;

	function handleSwipeTouchStart(e: TouchEvent) {
		// Nur auf dem Unterschirm einer Liste — nicht in der Uebersicht und
		// nicht in den Smart-Ansichten.
		if (!nav.listOpenMobile || nav.smartView) return;
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		swipeStartX = touch.clientX;
		swipeStartY = touch.clientY;
		swipeActive = true;
	}

	function handleSwipeTouchEnd(e: TouchEvent) {
		if (!swipeActive) return;
		swipeActive = false;

		const touch = e.changedTouches[0];
		const dx = touch.clientX - swipeStartX;
		const dy = touch.clientY - swipeStartY;

		// Only trigger swipe if horizontal > 50px and vertical < 30px
		if (Math.abs(dx) < 50 || Math.abs(dy) > 30) return;

		// Wischen nach links -> naechste Liste, nach rechts -> vorherige
		const idx = lists.findIndex((l: List) => l.id === nav.activeListId);
		if (idx < 0) return;
		const ziel = lists[idx + (dx < 0 ? 1 : -1)];
		if (ziel) nav.selectList(ziel.id);
	}

	// ---- Listen in der Navigationsspalte umsortieren ----
	let ziehIndex: number | null = $state(null);
	let ziehListId: string | null = $state(null);

	function listDragStart(e: DragEvent, list: List) {
		if (!e.dataTransfer) return;
		ziehListId = list.id;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-list', JSON.stringify({ listId: list.id }));
	}

	function listDragOver(e: DragEvent, idx: number) {
		if (!ziehListId) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		ziehIndex = e.clientY > rect.top + rect.height / 2 ? idx + 1 : idx;
	}

	function listDrop(e: DragEvent) {
		e.preventDefault();
		const ziel = ziehIndex;
		const id = ziehListId;
		ziehIndex = null;
		ziehListId = null;
		if (id !== null && ziel !== null) store.reorderList(id, ziel);
	}

	function listDragEnd() {
		ziehIndex = null;
		ziehListId = null;
	}

	// Bulk handlers
	function handleBulkToggleDone(done: boolean) {
		store.bulkToggleDone([...bulkSelectedIds], done);
		clearBulkSelection();
	}

	function handleBulkChangePriority(p: Priority) {
		store.bulkChangePriority([...bulkSelectedIds], p);
		clearBulkSelection();
	}

	function handleBulkDelete() {
		void store.bulkDelete([...bulkSelectedIds]);
		clearBulkSelection();
	}

	function handleBulkMoveToList(listId: string) {
		store.bulkMoveToList([...bulkSelectedIds], listId);
		clearBulkSelection();
	}
</script>

<svelte:window bind:innerWidth={fensterBreite} />

{#snippet listenInhalt()}
	{#if activeList}
		<TaskList
			list={activeList}
			tasks={sortedActiveListTasks}
			mobil={isMobile}
			selectedTaskId={nav.selectedTaskId}
			beteiligte={aktiveBeteiligte}
			zusatzProfile={fremdeProfile}
			eigeneId={benutzerId}
			istNeu={(id) => store.istNeu(id)}
			onQuickAdd={handleQuickAdd}
			onToggleTask={handleToggleTask}
			onEditSubtask={handleEditTask}
			onMenu={handleContextMenu}
			onSubMenu={handleContextMenu}
			onTaskOpen={handleTaskOpen}
			onReorderTask={(taskId, targetListId, newPos) =>
				sortFilter.handleReorderTask(taskId, targetListId, newPos)}
			onReorderSubtask={(subtaskId, parentId, newPos) =>
				store.reorderSubtask(subtaskId, parentId, newPos)}
			onClearDone={(listId) => void store.deleteDoneInList(listId)}
			quickAddVorgabe={vorschauQuickAdd}
			{bulkMode}
			{bulkSelectedIds}
			onBulkToggle={toggleBulkSelect}
		/>
	{/if}
{/snippet}

{#snippet smartInhalt(aufgaben: Task[], leerText: string)}
	<SmartList
		{aufgaben}
		{lists}
		{subtasksFor}
		{mitnutzer}
		zusatzProfile={fremdeProfile}
		eigeneId={benutzerId}
		istNeu={(id) => store.istNeu(id)}
		mobil={isMobile}
		selectedTaskId={nav.selectedTaskId}
		{bulkMode}
		{bulkSelectedIds}
		onToggle={handleToggleTask}
		onOpen={handleTaskOpen}
		onContextMenu={handleContextMenu}
		onBulkToggle={toggleBulkSelect}
		{leerText}
	/>
{/snippet}

<div class="tf-app" class:mobil={isMobile}>
	{#if !isMobile}
		<!-- Spalte 1 — Navigation -->
		<NavColumn
			{lists}
			activeListId={nav.activeListId}
			smartView={nav.smartView}
			{offeneJeListe}
			{mitnutzer}
			pinAnzahl={pinnedTasks.length}
			dringendAnzahl={dringendTasks.length}
			benutzer={benutzerName}
			initiale={benutzerInitiale}
			isDark={theme.isDark}
			onSelectList={(id) => nav.selectList(id)}
			onSelectSmart={(v) => nav.selectSmart(v)}
			onSuche={() => (searchOpen = true)}
			onNeueListe={neueListeAnlegen}
			onListContext={(e, list) => ctx.handleListContext(e, list)}
			onToggleTheme={() => theme.toggle()}
			{onLogout}
			onListDragStart={listDragStart}
			onListDragOver={listDragOver}
			onListDrop={listDrop}
			onListDragEnd={listDragEnd}
			{ziehIndex}
			{ziehListId}
			neueListeOffen={vorschauNeueListe}
		/>
	{/if}

	<!-- Spalte 2 — Liste (Desktop) bzw. der gesamte Schirm (Mobile) -->
	<main class="tf-main">
		{#if isMobile}
			<header class="tf-mobile-header" class:unterschirm={nav.mobileTab === 'listen' && unterschirm}>
				{#if nav.mobileTab === 'listen' && unterschirm}
					<button class="tf-ib gross" onclick={zurueck} aria-label="Zur&uuml;ck zur &Uuml;bersicht">
						<Icon name="chevron-links" />
					</button>
					{#if nav.smartView}
						<h2>
							<Icon name={nav.smartView === 'pins' ? 'pin' : 'blitz'} />
							<span class="name">{smartTitel}</span>
							<span class="cnt">{smartAufgaben.length}</span>
						</h2>
					{:else if activeList}
						<h2>
							<span>{activeList.icon}</span>
							<span class="name">{activeList.title}</span>
							<span class="cnt">{offeneJeListe.get(activeList.id) ?? 0}</span>
							<AvatarStack leute={aktiveFremde} />
						</h2>
						<button
							class="tf-ib gross"
							aria-label="Listenmen&uuml; &ouml;ffnen"
							data-tf-listenmenu
							onclick={(e) => ctx.handleListContext(e, activeList!)}
						>
							<Icon name="mehr" />
						</button>
					{/if}
				{:else if nav.mobileTab === 'pins'}
					<h2>
						<Icon name="pin" />
						<span class="name">Angepinnt</span>
						<span class="cnt">{pinnedTasks.length}</span>
					</h2>
					<button
						class="tf-ib gross"
						aria-label="Pinnwandmen&uuml; &ouml;ffnen"
						onclick={(e) => ctx.handlePinboardContext(e, pinnedTasks.length)}
					>
						<Icon name="mehr" />
					</button>
				{:else if nav.mobileTab === 'suche'}
					<h2><span class="name">Suche</span></h2>
				{:else}
					<h2><span class="name">Listen</span></h2>
				{/if}
			</header>

			{#if nav.mobileTab === 'suche'}
				<!-- Eigener Schirm: Suchfeld und Treffer, kein Overlay ueber
				     einem fremden Schirm wie bis T8. -->
				<SearchMobile {tasks} {lists} bind:begriff={mobileSuche} onOeffnen={sucheOeffnenMobil} />
			{:else}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="tf-liste"
					ontouchstart={handleSwipeTouchStart}
					ontouchend={handleSwipeTouchEnd}
				>
					{#if nav.mobileTab === 'pins'}
						{@render smartInhalt(pinnedTasks, 'Nichts angepinnt.')}
					{:else if unterschirm}
						{#if nav.smartView}
							{@render smartInhalt(smartAufgaben, smartLeerText)}
						{:else}
							{@render listenInhalt()}
						{/if}
					{:else}
						<ListsOverview
							{lists}
							activeListId={nav.activeListId}
							{offeneJeListe}
							{mitnutzer}
							dringendAnzahl={dringendTasks.length}
							benutzer={benutzerName}
							initiale={benutzerInitiale}
							isDark={theme.isDark}
							onSelectList={(id) => nav.selectList(id)}
							onSelectSmart={(v) => nav.selectSmart(v)}
							onNeueListe={neueListeAnlegen}
							onListContext={(e, list) => ctx.handleListContext(e, list)}
							onToggleTheme={() => theme.toggle()}
							{onLogout}
							neueListeOffen={vorschauNeueListe}
						/>
					{/if}
				</div>
			{/if}
		{:else if nav.smartView}
			<header class="tf-lh">
				<h2>
					<Icon name={nav.smartView === 'pins' ? 'pin' : 'blitz'} />
					<span class="name">{smartTitel}</span>
					<span class="cnt">{smartAufgaben.length}</span>
				</h2>
				<span class="sp"></span>
				{#if nav.smartView === 'pins'}
					<button
						class="tf-ib"
						aria-label="Pinnwandmen&uuml; &ouml;ffnen"
						onclick={(e) => ctx.handlePinboardContext(e, pinnedTasks.length)}
					>
						<Icon name="mehr" />
					</button>
				{/if}
			</header>
			<div class="tf-liste">
				{@render smartInhalt(smartAufgaben, smartLeerText)}
			</div>
		{:else if activeList}
			<header class="tf-lh">
				<h2>
					<span>{activeList.icon}</span>
					<span class="name">{activeList.title}</span>
					<span class="cnt">{offeneJeListe.get(activeList.id) ?? 0} offen</span>
				</h2>
				<span class="sp"></span>
				{#if aktiveBeteiligte.length > 1}
					<!-- Die Pille ist zugleich der Anker des Teilen-Popovers
					     (Spezifikation Abschnitt 3: „top:58px; right:20px"). -->
					<button
						class="tf-shared"
						onclick={(e) => {
							const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
							share.openShareDialog(activeList!, r.right, r.bottom + 6);
						}}
					>
						<AvatarStack leute={aktiveBeteiligte} />
						Geteilt &middot; {aktiveBeteiligte.length}
					</button>
				{/if}
				<button class="tf-sortbtn" onclick={sortMenuUmschalten}>
					<Icon name="sortierung" size={16} />
					{sortLabels[sortFilter.sortMode]}
					<Icon name="chevron-ab" size={16} />
				</button>
				<button
					class="tf-ib"
					data-tf-listenmenu
					aria-label="Listenmen&uuml; &ouml;ffnen"
					onclick={(e) => ctx.handleListContext(e, activeList!)}
				>
					<Icon name="mehr" />
				</button>
			</header>
			<div class="tf-liste">
				{@render listenInhalt()}
			</div>
		{:else}
			<div class="tf-leer">
				<h2>Noch keine Liste</h2>
				<p>Lege links &uuml;ber &bdquo;Neue Liste&ldquo; deine erste Liste an.</p>
			</div>
		{/if}
	</main>

	{#if !isMobile}
		<!-- Spalte 3 — Detail. Keine Huelle, kein Scrim, kein Klick daneben.
		     Bewusst ohne {#key}: TaskDetail merkt den Wechsel selbst und
		     sichert die angefangene Notiz, bevor es die naechste uebernimmt. -->
		<aside class="tf-detail" aria-label="Aufgabendetail">
			{#if selectedTask}
				<TaskDetail
					task={selectedTask}
					subtasks={focusSubtasks}
					liste={detailListe}
					listen={lists}
					{...detailAktionen}
				/>
			{:else}
				<div class="tf-detail-leer">Aufgabe ausw&auml;hlen</div>
			{/if}
		</aside>
	{/if}

	{#if isMobile}
		<MobileTabBar tab={nav.mobileTab} onTab={waehleTab} />
	{/if}
</div>

<!-- Detail mobil: Bottom-Sheet ueber der Liste, mit Scrim -->
{#if isMobile && selectedTask}
	<DetailSheet
		task={selectedTask}
		subtasks={focusSubtasks}
		liste={detailListe}
		listen={lists}
		onMenue={handleContextMenu}
		{...detailAktionen}
	/>
{/if}

<!-- Sort Dropdown (floating) -->
{#if sortFilter.sortMenuOpen}
	<div class="fixed inset-0" style="z-index: 60;" onclick={() => { sortFilter.sortMenuOpen = false; }} role="presentation"></div>
	<div class="tf-popmenu" style="position: fixed; right: auto; bottom: auto; z-index: 61; top: {sortMenuPos.top}px; left: {sortMenuPos.left}px;">
		{#each validSortModes as mode (mode)}
			<button
				class="tf-mi"
				onclick={() => { sortFilter.sortMode = mode as SortMode; sortFilter.sortMenuOpen = false; }}
			>
				<span style="flex:1">{sortLabels[mode]}</span>
				{#if sortFilter.sortMode === mode}
					<Icon name="haken" size={16} />
				{/if}
			</button>
		{/each}
	</div>
{/if}

<!-- Suche (Desktop): ⌘K-Palette ueber hellem Scrim. Am Finger uebernimmt
     der Tab „Suche" — dort gibt es kein Overlay. -->
{#if searchOpen && !isMobile}
	<SearchPalette {tasks} {lists} startBegriff={suchVorgabe} onVorschau={sucheVorschau} onClose={sucheSchliessen} />
{/if}

<!-- Context Menu -->
{#if ctx.contextMenu.show}
	<ContextMenu
		items={ctx.contextMenu.items}
		x={ctx.contextMenu.x}
		y={ctx.contextMenu.y}
		breite={ctx.contextMenu.breite}
		onclose={() => { ctx.close(); }}
	/>
{/if}

<!-- Emoji Picker (List Icon) -->
{#if listIconPicker.show}
	<EmojiPicker
		x={listIconPicker.x}
		y={listIconPicker.y}
		aktuell={lists.find((l: List) => l.id === listIconPicker.listId)?.icon ?? ''}
		onSelect={(emoji) => { handleListIconSelect(emoji); }}
		onClose={() => { listIconPicker = { show: false, listId: '', x: 0, y: 0 }; }}
	/>
{/if}

<!-- Share Dialog -->
{#if share.shareDialog.show && share.shareDialog.list}
	<ShareDialog
		list={share.shareDialog.list}
		beteiligte={share.shareDialog.beteiligte}
		shareIdVon={new Map(share.shareDialog.shares.map((sh) => [sh.user_id, sh.id]))}
		eigeneEmail={benutzerEmail}
		x={share.shareDialog.x}
		y={share.shareDialog.y}
		onClose={() => { share.close(); }}
		onShare={(email, role) => { share.shareList(email, role); }}
		onRemoveShare={(shareId) => { share.removeShare(shareId); }}
		onChangeRole={(shareId, role) => { share.changeShareRole(shareId, role); }}
	/>
{/if}

<!-- Bulk Toolbar -->
<BulkToolbar
	selectedCount={bulkSelectedIds.size}
	lists={lists}
	onToggleDone={handleBulkToggleDone}
	onChangePriority={handleBulkChangePriority}
	onDelete={handleBulkDelete}
	onMoveToList={handleBulkMoveToList}
	onCancel={clearBulkSelection}
/>

<!-- Toast + Confirm + Input -->
<ToastContainer />
<ConfirmDialog />
<InputDialog />
