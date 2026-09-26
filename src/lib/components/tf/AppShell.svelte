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
		/**
		 * Aufgaben, deren Unteraufgaben ausgeklappt gezeigt werden sollen.
		 * Unteraufgaben starten eingeklappt (stores/filters.ts); die Frames 1,
		 * 2, 3, 9 und 10 zeigen aber je eine ausgeklappte Aufgabe neben
		 * eingeklappten. Kommt nicht aus der Adresszeile — das Abnahmeskript
		 * kennt diesen Parameter nicht, die Vorschau-Seite setzt ihn fest.
		 */
		aufklappen?: string[];
	};
</script>

<script lang="ts">
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import { createHistoryStore } from '$lib/stores/history.svelte';
	import { createEinkauf } from '$lib/stores/einkauf';
	import { onMount, tick, untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Database } from '$lib/types/database';
	import type { Priority, Timeframe } from '$lib/constants';
	import { nav, type MobileTab } from '$lib/stores/tf/navigation.svelte';
	import { theme } from '$lib/stores/tf/theme.svelte';
	import { getProfilesByIds } from '$lib/services/supabase-crud';
	import { baueAusProfil, initialeAus, type Mitnutzer } from '$lib/utils/mitnutzer';
	import type { VerlaufAnbindung } from '$lib/components/tf/TaskHistory.svelte';

	import Icon from '$lib/components/tf/Icon.svelte';
	import NavColumn from '$lib/components/tf/NavColumn.svelte';
	import ListsOverview from '$lib/components/tf/ListsOverview.svelte';
	import MobileTabBar from '$lib/components/tf/MobileTabBar.svelte';
	import SmartList from '$lib/components/tf/SmartList.svelte';
	import AvatarStack from '$lib/components/tf/AvatarStack.svelte';
	import TaskList from '$lib/components/tf/TaskList.svelte';
	import EinkaufsListe from '$lib/components/tf/EinkaufsListe.svelte';
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
	import {
		bestaetigen,
		toasts,
		confirmStore,
		inputDialogStore,
		resolveConfirm,
		resolveInput,
		showInputDialog
	} from '$lib/stores/toast';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';

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

	/** Aufgabenhistorie — offene Warte-Eintraege, Verlaeufe, Realtime. */
	const historie = createHistoryStore();
	const store = createTaskStore({
		// Aufgaben nach dem Loeschen wieder da (Rueckgaengig oder gescheitertes
		// Loeschen): ihren Verlauf samt Sanduhr zurueckholen.
		aufgabenZurueck: (ids, wiedereingefuegt) => void historie.aufgabenZurueck(ids, wiedereingefuegt)
	});

	/** Einkaufs-Modus — Aktionen auf Einkaufslisten ueber die Primitive des Stores. */
	const einkauf = createEinkauf({
		get tasks() { return store.tasks; },
		get lists() { return store.lists; },
		aendereAufgaben: store.aendereAufgaben,
		fuegeEin: store.fuegeEin,
		setzeListenart: store.setzeListenart,
		loescheMitUndo: store.loescheMitUndo,
		entferne: store.entferne,
		toast: {
			undo: (m, f) => toasts.undo(m, f),
			aktion: (m, l, f) => toasts.aktion(m, l, f),
			show: (m) => toasts.show(m)
		}
	});

	// Initialize store in $effect (runs during hydration before onMount)
	let storeReady = $state(false);
	$effect(() => {
		if (supabase && benutzerId && !storeReady) {
			store.init(supabase, benutzerId, startListen, startAufgaben);
			// EINE Abfrage: alle offenen Warte-Eintraege (Sanduhr in den Zeilen).
			// untrack: der Store liest dabei eigenen Zustand, von dem dieser
			// Effekt nicht abhaengen soll.
			const sb = supabase;
			const uid = benutzerId;
			untrack(() => historie.init(sb, uid));
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

	// ==========================================
	// EINKAUFSLISTE
	// ==========================================
	let istEinkauf = $derived(activeList?.kind === 'einkauf');
	/** IDs aller Einkaufslisten — fuer Zaehler und Smart-Ansichten. */
	let einkaufsListen = $derived(
		new Set(lists.filter((l: List) => l.kind === 'einkauf').map((l: List) => l.id))
	);
	/** Alle Zeilen der offenen Einkaufsliste — die Komponente ordnet selbst. */
	let einkaufsZeilen = $derived(
		activeList && istEinkauf ? tasks.filter((t: Task) => t.list_id === activeList.id) : []
	);

	/**
	 * Artikel von aussen (n8n, G2, ein zweites Geraet) kommen als Aufgabe der
	 * obersten Ebene an. Beim Oeffnen und bei jedem Neuzugang einsortieren —
	 * per Stichwort-Tabelle wie das Quick-Add, aber ohne je eine Kategorie
	 * anzulegen (sonst entstuende „Sonstiges" auf zwei Geraeten doppelt) und
	 * ohne Rueckfall auf „Sonstiges" (Begruendung in `ohneKategorieEinsortieren`).
	 * Zeilen MIT Kindern sind nie ein Artikel und bleiben, wo sie sind.
	 * Jede Zeile wird nur EINMAL versucht: schlaegt das Schreiben fehl
	 * (Betrachter) oder passt keine Kategorie, bleibt sie „Ohne Kategorie",
	 * statt den Effekt in eine Schleife zu schicken. Bewusst ein einfaches
	 * Set wie `angefragteIds`: ein reaktives liesse den Effekt bei jedem
	 * Eintrag erneut laufen.
	 */
	const einsortiertVersucht = new Set<string>();
	$effect(() => {
		if (!activeList || activeList.kind !== 'einkauf') return;
		const listId = activeList.id;
		const zeilen = tasks.filter((t: Task) => t.list_id === listId);
		const eltern = new Set(zeilen.map((t: Task) => t.parent_id).filter(Boolean));
		const lose = zeilen.filter(
			(t: Task) =>
				!t.parent_id && t.type === 'task' && !eltern.has(t.id) && !einsortiertVersucht.has(t.id)
		);
		if (lose.length === 0) return;
		for (const t of lose) einsortiertVersucht.add(t.id);
		untrack(() => void einkauf.ohneKategorieEinsortieren(listId));
	});

	/**
	 * „+ Kategorie" am Ende der Einkaufsliste und „Kategorie hinzufügen" im
	 * Listenmenue. Die Liste kommt als Parameter (Ruling R1): das Menue
	 * gehoert zu der Liste, an der es geoeffnet wurde.
	 */
	async function kategorieNeu(listId: string) {
		const name = await showInputDialog('Neue Kategorie', '', '', 'z. B. Backwaren');
		if (name?.trim()) await einkauf.kategorieAnlegen(listId, name.trim());
	}

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

	// Aufgabe weg — geloescht, „Erledigte loeschen", Liste geloescht, per
	// Realtime verschwunden: ihr Verlauf faellt aus dem Zwischenspeicher. In
	// der Datenbank hat `on delete cascade` ihn schon entfernt. Kommt die
	// Aufgabe zurueck (Rueckgaengig, gescheitertes Loeschen), holt
	// `aufgabenZurueck` ihn wieder (siehe createTaskStore oben).
	$effect(() => {
		if (!storeReady) return;
		const vorhanden: Record<string, true> = {};
		for (const t of tasks) vorhanden[t.id] = true;
		untrack(() => historie.verwerfeAufgaben((id) => !!vorhanden[id]));
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
	// Einkaufslisten zaehlen offene Artikel auf jeder Ebene — Kategorien und
	// Abgelegtes (immer `done`) zaehlen nicht.
	let offeneJeListe = $derived.by(() => {
		const m = new Map<string, number>();
		for (const t of tasks) {
			if (t.done || t.type === 'divider') continue;
			if (einkaufsListen.has(t.list_id)) {
				m.set(t.list_id, (m.get(t.list_id) ?? 0) + 1); // offene Artikel, jede Ebene
				continue;
			}
			if (t.parent_id) continue;
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
	 *
	 * Beide Smart-Ansichten ignorieren Einkaufslisten: ein Artikel hat kein
	 * Detail, und eine umgestellte Liste braechte sonst alte Pins und
	 * Prioritaeten ihrer frueheren Aufgaben mit.
	 */
	let pinnedTasks = $derived(
		tasks.filter(
			(t: Task) =>
				t.pinned && !t.done && !t.parent_id && t.type !== 'divider' && !einkaufsListen.has(t.list_id)
		)
	);

	/** Dringend: ASAP/High oder heute faellig bzw. ueberfaellig, jeweils offen. */
	let dringendTasks = $derived.by(() => {
		// Ende des heutigen Tages als Zeitstempel — ohne ein Date-Objekt zu halten.
		const heuteEndeMs = new Date().setHours(23, 59, 59, 999);
		return tasks.filter((t: Task) => {
			if (t.done || t.parent_id || t.type === 'divider') return false;
			if (einkaufsListen.has(t.list_id)) return false;
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
		// Autoren im Verlauf: auch wer eine Liste inzwischen verlassen hat,
		// behaelt dort seinen Namen. Geprueft wird JE LISTE wie oben —
		// `personFuer` sucht auch nur in der Liste der Aufgabe. Wer in einer
		// fremden geteilten Liste schreibt, fehlt dort in `mitnutzer`, selbst
		// wenn er aus einer anderen Liste bekannt ist; eine listenuebergreifende
		// Pruefung liess ihn als „Mitnutzer ?" stehen.
		const listeVon: Record<string, string> = {};
		for (const t of tasks) listeVon[t.id] = t.list_id;
		for (const e of historie.eintraege) {
			const listId = listeVon[e.task_id];
			const leute = listId ? (bekannt[listId] ?? []) : [];
			for (const id of [e.created_by, e.edited_by, e.resolved_by]) {
				if (!id || id === me || angefragteIds.has(id)) continue;
				if (leute.some((m: Mitnutzer) => m.id === id)) continue;
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
			get tasks() { return tasks; },
			renameList: (listId: string, name: string) => store.renameList(listId, name),
			deleteDoneInList: (listId: string) => void store.deleteDoneInList(listId),
			// Dieselbe Regel wie Erledigt-Balken und Undo-Toast: oberste Ebene,
			// ohne Trenner. Frueher zaehlte das Menue selbst und kam damit auf
			// eine andere Zahl als der Toast anschliessend meldete.
			erledigteAnzahl: (listId: string) => store.erledigteAnzahl(listId),
			togglePin: (taskId: string) => store.togglePin(taskId),
			updateTask: (taskId: string, text: string) => store.updateTask(taskId, text),
			moveTaskToList: (taskId: string, listId: string) => store.moveTaskToList(taskId, listId),
			deleteTaskDirect: (taskId: string, meldung?: string) => store.deleteTaskDirect(taskId, meldung)
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
		get mobil() { return isMobile; },
		einkauf,
		kategorieNeu: (listId: string) => void kategorieNeu(listId)
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

	/**
	 * Verlauf gibt es nur an Aufgaben oberster Ebene — nicht an
	 * Unteraufgaben, nicht an Trennern (Spezifikation Aufgabenhistorie).
	 */
	let verlaufAufgabeId = $derived(
		selectedTask && !selectedTask.parent_id && selectedTask.type === 'task' ? selectedTask.id : null
	);
	// Den vollstaendigen Verlauf erst laden, wenn das Detail aufgeht.
	$effect(() => {
		const id = verlaufAufgabeId;
		if (!id || !storeReady) return;
		untrack(() => void historie.ladeVerlauf(id));
	});
	let detailListe = $derived(
		selectedTask ? (lists.find((l: List) => l.id === selectedTask.list_id) ?? null) : null
	);

	// ==========================================
	// AUFGABENHISTORIE IM DETAIL
	// ==========================================
	/**
	 * Darf der angemeldete Nutzer diese Aufgabe bearbeiten — und damit ihren
	 * Verlauf schreiben?
	 *
	 * Die App prueft Schreibrechte sonst nirgends selbst; das entscheidet RLS.
	 * Die einzige Rollenquelle im Client ist `list_shares.role`, aufbereitet
	 * durch `baueMitnutzer` (`Mitnutzer.rolle`, der eigene Eintrag traegt
	 * `ich`). Dieselbe Quelle liest der Teilen-Dialog. Die Regel spiegelt
	 * `can_edit_task` aus Migration 022: Ersteller, Listenbesitzer oder Rolle
	 * owner/editor. Ist die eigene Rolle unbekannt, bleibt die Eingabe offen —
	 * die Datenbank lehnt dann ab, und der Store rollt mit Fehler-Toast zurueck.
	 */
	function darfSchreiben(t: Task): boolean {
		if (!benutzerId) return false;
		if (t.user_id === benutzerId) return true;
		if (lists.find((l: List) => l.id === t.list_id)?.user_id === benutzerId) return true;
		const ich = (mitnutzer[t.list_id] ?? []).find((m: Mitnutzer) => m.ich);
		return !ich || ich.rolle === 'owner' || ich.rolle === 'editor';
	}

	/**
	 * Name, Initiale und Farbe zu einer Benutzer-ID — dieselbe Quelle wie
	 * Herkunft und „gepinnt von": Beteiligte der Liste, sonst nachgeladene
	 * Profile. Nie eine UUID; ohne jede Spur steht „Mitnutzer" mit „?"
	 * (Konto geloescht: `created_by` ist dann leer).
	 */
	function personFuer(listId: string, id: string | null): Mitnutzer {
		if (id) {
			const bekannt = (mitnutzer[listId] ?? []).find((m: Mitnutzer) => m.id === id) ?? fremdeProfile[id];
			if (bekannt) return bekannt;
			if (id === benutzerId) {
				return { id, name: benutzerName, initialen: initialeAus(benutzerName), farbe: 'var(--accent)', rolle: 'owner', ich: true };
			}
		}
		return { id: id ?? '', name: 'Mitnutzer', initialen: '?', farbe: 'var(--ink-3)', rolle: 'viewer', ich: false };
	}

	/** Was Spalte und Sheet an den Verlauf der ausgewaehlten Aufgabe reichen. */
	let verlaufAnbindung = $derived.by<VerlaufAnbindung | null>(() => {
		const t = selectedTask;
		if (!t || !verlaufAufgabeId) return null;
		const taskId = t.id;
		const listId = t.list_id;
		return {
			eintraege: historie.verlauf(taskId),
			darfSchreiben: darfSchreiben(t),
			person: (id: string | null) => personFuer(listId, id),
			leseEntwurf: (id) => historie.entwurf(id),
			merkeEntwurf: (id, e) => historie.merkeEntwurf(id, e),
			onNeu: (art, text) => historie.add(taskId, art, text),
			onAendern: (id, text) => void historie.edit(id, text),
			onLoeschen: (id) => historie.remove(id),
			onIstDa: (id) => void historie.resolve(id),
			onIstDaZurueck: (id) => void historie.unresolve(id)
		};
	});

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
		let historyChannel: any = null;
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
				void historie.resync();
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
			// Aufgabenhistorie: DELETE traegt bei aktivem RLS nur die ID.
			historyChannel = sb
				.channel('tf-history-realtime')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'task_history' }, (payload: any) => {
					historie.handleRealtime(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
				})
				.subscribe(nachVerbindung);
		}

		// Verlaufseintraege werden erst nach Ablauf des Rueckgaengig geloescht.
		// Wer die Seite vorher verlaesst, soll sie trotzdem loswerden.
		const seiteVerlassen = () => historie.loescheVorgemerkte();
		window.addEventListener('pagehide', seiteVerlassen);

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
			window.removeEventListener('pagehide', seiteVerlassen);
			historie.loescheVorgemerkte();
			if (resyncUhr) clearTimeout(resyncUhr);
			if (sb && listsChannel) sb.removeChannel(listsChannel);
			if (sb && tasksChannel) sb.removeChannel(tasksChannel);
			if (sb && historyChannel) sb.removeChannel(historyChannel);
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
	 * Ein Artikel einer Einkaufsliste hat kein Detail: dort nur die Liste,
	 * und eine noch stehende Auswahl (etwa aus der Pinnwand, die die aktive
	 * Liste nicht wechselt) faellt.
	 */
	function sucheVorschau(listId: string, taskId: string) {
		nav.selectList(listId);
		if (einkaufsListen.has(listId)) {
			nav.selectTask(null);
			return;
		}
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
	// ZURUECK-TASTE (Android, TWA) — nur mobil
	// ==========================================
	// Ohne eigenen Verlaufseintrag findet die Zurueck-Taste nichts, wohin sie
	// zurueck koennte, und schliesst die App. Darum liegt, solange mobil
	// irgendeine Ebene ueber der Listenuebersicht offen ist, genau EIN
	// Waechter-Eintrag im Verlauf (SvelteKit-Shallow-Routing, `pushState`).
	// Die Taste nimmt ihn weg; wir schliessen daraufhin die oberste Ebene —
	// dieselbe Reihenfolge wie Escape — und legen ihn neu an, falls noch
	// etwas offen ist. Schliesst die Oberflaeche die letzte Ebene selbst,
	// nehmen wir den Waechter per `history.back()` wieder heraus; sonst
	// braeuchte es in der Uebersicht zwei Druecke zum Beenden.
	// Erst in der Listenuebersicht schliesst Zurueck die App.

	/** Irgendeine Ebene ueber der Listenuebersicht offen? */
	function ebeneOffen(): boolean {
		return (
			$confirmStore.show ||
			$inputDialogStore.show ||
			ctx.contextMenu.show ||
			listIconPicker.show ||
			share.shareDialog.show ||
			bulkMode ||
			!!nav.selectedTaskId ||
			nav.listOpenMobile ||
			nav.mobileTab !== 'listen'
		);
	}

	/** Die oberste offene Ebene schliessen — Reihenfolge wie bei Escape. */
	function obersteEbeneSchliessen() {
		if ($confirmStore.show) return resolveConfirm(false);
		if ($inputDialogStore.show) return resolveInput(null);
		if (ctx.contextMenu.show) return ctx.close();
		if (listIconPicker.show) {
			listIconPicker = { show: false, listId: '', x: 0, y: 0 };
			return;
		}
		if (share.shareDialog.show) return share.close();
		if (bulkMode) return clearBulkSelection();
		if (nav.selectedTaskId || nav.listOpenMobile) return nav.back();
		if (nav.mobileTab !== 'listen') nav.setTab('listen');
	}

	let zurueckTief = $derived(isMobile && ebeneOffen());
	let waechterImVerlauf = $derived(!!page.state.tfEbene);
	/** Wir haben den Waechter gelegt und er wurde noch nicht verbraucht. */
	let waechterGelegt = false;

	$effect(() => {
		const tief = zurueckTief;
		const imVerlauf = waechterImVerlauf;
		untrack(() => {
			if (tief && !imVerlauf) {
				if (waechterGelegt) {
					// Zurueck-Taste: der Waechter ist weg, die Ebene noch offen.
					waechterGelegt = false;
					obersteEbeneSchliessen();
					// Noch etwas offen (Sheet zu, Liste steht noch)? Dann gleich
					// den naechsten Waechter legen. Der Effekt liefe dafuer nicht
					// erneut: `zurueckTief` war vorher true und bleibt true.
					if (isMobile && ebeneOffen()) {
						pushState('', { tfEbene: true });
						waechterGelegt = true;
					}
				} else {
					pushState('', { tfEbene: true });
					waechterGelegt = true;
				}
			} else if (!tief && imVerlauf && waechterGelegt) {
				// Die Oberflaeche hat die letzte Ebene selbst geschlossen.
				waechterGelegt = false;
				history.back();
			} else if (!tief) {
				waechterGelegt = false;
			}
		});
	});

	// ==========================================
	// VORSCHAU-ZUSTAENDE (nur /vorschau)
	// ==========================================
	// Diese zwei stehen VOR dem ersten Bild fest, nicht erst in
	// `vorschauHerstellen`: beide werden von Kindkomponenten einmalig beim
	// Anlegen gelesen (`NewListCard`-Karte, Quick-Add-Feld). Spaeter gesetzt
	// kaemen sie zu spaet — die Karte blieb dann zu.
	/** Karte „Neue Liste" ausgeklappt starten. */
	let vorschauNeueListe = $state(untrack(() => vorschau?.neueliste ?? false));
	/** Quick-Add aktiv mit diesem Text starten. */
	let vorschauQuickAdd = $state(untrack(() => vorschau?.quickadd ?? ''));

	/**
	 * In ein Eingabefeld schreiben, als haette jemand getippt: `bind:value`
	 * horcht auf `input`, ein blosses Setzen von `.value` bliebe unbemerkt.
	 */
	function tippe(feld: HTMLInputElement, text: string) {
		const setzer = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setzer?.call(feld, text);
		feld.dispatchEvent(new Event('input', { bubbles: true }));
	}

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

		// Unteraufgaben aufklappen wie ein Mensch: ueber den Zaehler in der
		// Metazeile, nicht ueber einen zweiten Weg in die Komponente hinein.
		for (const id of v.aufklappen ?? []) {
			document.querySelector<HTMLElement>(`[data-tf-task="${id}"] .zaehler`)?.click();
		}
		// Das Aufklappen schiebt alles darunter nach unten. Ohne diesen
		// Renderdurchlauf messen die `ankerAus`-Aufrufe weiter unten die
		// Rechtecke von VOR dem Aufklappen — in Frame 2 schwebte das
		// Aufgabenmenue dadurch 141 px ueber seinem Drei-Punkte-Knopf.
		await tick();

		if (v.neueliste) {
			// Die Karte steht schon offen (`vorschauNeueListe`). Hier wird nur
			// noch ausgefuellt, was Frame 1 zeigt — ueber dieselben Knoepfe und
			// dasselbe Feld, die auch ein Mensch benutzt: Symbolwaehler auf,
			// Schraubenschluessel gewaehlt, „Werkstatt" getippt.
			document.querySelector<HTMLElement>('.tf-newlist .em')?.click();
			await tick();
			const zellen = document.querySelectorAll<HTMLElement>('.tf-emoji .em');
			[...zellen].find((b) => b.textContent?.trim() === '\u{1F527}')?.click();
			await tick();
			const feld = document.querySelector<HTMLInputElement>('.tf-newlist .txt');
			if (feld) tippe(feld, 'Werkstatt');
		}

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
	{#if activeList && istEinkauf}
		<EinkaufsListe
			list={activeList}
			tasks={einkaufsZeilen}
			mobil={isMobile}
			{einkauf}
			onKategorieMenue={ctx.handleKategorieContext}
			onArtikelMenue={ctx.handleArtikelContext}
			onKategorieNeu={kategorieNeu}
			quickAddVorgabe={vorschauQuickAdd}
			menuOffenId={ctx.contextMenu.show ? ctx.offeneTaskId : null}
		/>
	{:else if activeList}
		<TaskList
			list={activeList}
			tasks={sortedActiveListTasks}
			mobil={isMobile}
			selectedTaskId={nav.selectedTaskId}
			beteiligte={aktiveBeteiligte}
			zusatzProfile={fremdeProfile}
			eigeneId={benutzerId}
			istNeu={(id) => store.istNeu(id)}
			warteAuf={(id) => historie.offeneWarte(id)}
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
			menuOffenId={ctx.contextMenu.show ? ctx.offeneTaskId : null}
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
		warteAuf={(id) => historie.offeneWarte(id)}
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
				<SearchMobile
					{tasks}
					{lists}
					bind:begriff={mobileSuche}
					warteAuf={(id) => historie.offeneWarte(id)}
					onOeffnen={sucheOeffnenMobil}
				/>
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
				<!-- Eine Einkaufsliste ordnet nach Kategorien, nicht nach Sortierung. -->
				{#if !istEinkauf}
					<button class="tf-sortbtn" onclick={sortMenuUmschalten}>
						<Icon name="sortierung" size={16} />
						{sortLabels[sortFilter.sortMode]}
						<Icon name="chevron-ab" size={16} />
					</button>
				{/if}
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
					verlauf={verlaufAnbindung}
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
		verlauf={verlaufAnbindung}
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
	<SearchPalette
		{tasks}
		{lists}
		startBegriff={suchVorgabe}
		warteAuf={(id) => historie.offeneWarte(id)}
		onVorschau={sucheVorschau}
		onClose={sucheSchliessen}
	/>
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
