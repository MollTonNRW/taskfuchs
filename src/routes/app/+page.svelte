<script lang="ts">
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import { toasts } from '$lib/stores/toast';
	import { goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import type { Database } from '$lib/types/database';
	import type { Priority } from '$lib/constants';
	import { nav, type MobileTab } from '$lib/stores/tf/navigation.svelte';
	import { theme } from '$lib/stores/v2/theme.svelte';
	import { profilesStore } from '$lib/stores/profiles';
	import { getProfilesByIds } from '$lib/services/supabase-crud';

	import Icon from '$lib/components/tf/Icon.svelte';
	import NavColumn from '$lib/components/tf/NavColumn.svelte';
	import ListsOverview from '$lib/components/tf/ListsOverview.svelte';
	import MobileTabBar from '$lib/components/tf/MobileTabBar.svelte';
	import SmartList from '$lib/components/tf/SmartList.svelte';

	import ListPanel from '$lib/components/v2/ListPanel.svelte';
	import ToastContainer from '$lib/components/v2/ToastContainer.svelte';
	import ConfirmDialog from '$lib/components/v2/ConfirmDialog.svelte';
	import InputDialog from '$lib/components/v2/InputDialog.svelte';
	import FocusOverlay from '$lib/components/v2/FocusOverlay.svelte';
	import SearchOverlay from '$lib/components/v2/SearchOverlay.svelte';
	import ContextMenu from '$lib/components/v2/ContextMenu.svelte';
	import EmojiPicker from '$lib/components/v2/EmojiPicker.svelte';
	import DatePicker from '$lib/components/v2/DatePicker.svelte';
	import PriorityPicker from '$lib/components/v2/PriorityPicker.svelte';
	import BulkToolbar from '$lib/components/v2/BulkToolbar.svelte';
	import ShareDialog from '$lib/components/v2/ShareDialog.svelte';

	import { createContextMenus, type ContextMenuDeps } from '$lib/composables/v2/useContextMenus.svelte';
	import { createSortFilter, sortLabels, validSortModes, type SortMode } from '$lib/composables/v2/useSortFilter.svelte';
	import { createPopovers } from '$lib/composables/v2/usePopovers.svelte';
	import { createShareDialog } from '$lib/composables/v2/useShareDialog.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];
	type Profile = Database['public']['Tables']['profiles']['Row'];

	let { data } = $props();

	const store = createTaskStore();

	// Initialize store in $effect (runs during hydration before onMount)
	let storeReady = $state(false);
	$effect(() => {
		if (data.supabase && data.user && !storeReady) {
			store.init(data.supabase, data.user.id, data.lists, data.tasks);
			// Gespeicherte Listenauswahl gegen die geladenen Listen pruefen
			nav.hydrate(data.lists.map((l: List) => l.id));
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

	// Force subtasks open/closed per list (null = TaskCard controls itself)
	let subtasksForceState = $state<Map<string, boolean>>(new Map());
	// Legacy compat: collapsedSubtasksListIds derived from forceState for context menu deps
	let collapsedSubtasksListIds = $derived.by(() => {
		const set = new Set<string>();
		for (const [id, open] of subtasksForceState) {
			if (!open) set.add(id);
		}
		return set;
	});
	function toggleCollapseSubtasks(listId: string) {
		const next = new Map(subtasksForceState);
		const current = next.get(listId);
		if (current === false) {
			// Currently forced closed -> force open
			next.set(listId, true);
		} else {
			// Currently forced open or not set -> force closed
			next.set(listId, false);
		}
		subtasksForceState = next;
	}
	function getForceSubtasksOpen(listId: string): boolean | null {
		return subtasksForceState.has(listId) ? subtasksForceState.get(listId)! : null;
	}

	// Profile map (for assign submenu)
	let profileMap = $state(new Map<string, Profile>());

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

	let pinnedTasks = $derived(tasks.filter((t: Task) => t.pinned && !t.done && !t.parent_id));

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

	// Profile der Pinner (pinned_by) fuer das "gepinnt von"-Badge vorladen --
	// nur fremde IDs, die noch nicht geladen wurden. Befuellt den globalen
	// profilesStore, aus dem das Badge liest.
	let loadedPinnerIds = new Set<string>();
	$effect(() => {
		const sb = data.supabase;
		const me = data.user?.id;
		if (!sb) return;
		const missing = [
			...new Set(
				tasks
					.map((t: Task) => t.pinned_by)
					.filter((id): id is string => !!id && id !== me && !loadedPinnerIds.has(id))
			)
		];
		if (missing.length === 0) return;
		for (const id of missing) loadedPinnerIds.add(id);
		getProfilesByIds(sb, missing).then(({ data: profiles }) => {
			if (!profiles || profiles.length === 0) return;
			profilesStore.update((existing) => {
				const ids = new Set(existing.map((p) => p.id));
				const added = profiles.filter((p) => !ids.has(p.id));
				return added.length > 0 ? [...existing, ...added] : existing;
			});
		});
	});

	// Search overlay
	let searchOpen = $state(false);

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

	// Popovers
	const popovers = createPopovers({
		get tasks() { return tasks; },
		updateTaskEmoji: (id: string, emoji: string) => store.updateTaskEmoji(id, emoji),
		updateTaskDate: (id: string, date: string | null) => store.updateTaskDate(id, date),
		changeTaskPriority: (id: string, p: Priority) => store.changeTaskPriority(id, p)
	});

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
		{ get sb() { return data.supabase; } },
		{ error: (msg: string) => toasts.error(msg) }
	);

	// Context Menus
	const ctxDeps: ContextMenuDeps = {
		store: {
			get tasks() { return tasks; },
			get lists() { return lists; },
			addTask: (listId: string, text: string) => store.addTask(listId, text),
			addTaskAfter: (taskId: string, text: string) => store.addTaskAfter(taskId, text),
			addSubtask: (taskId: string, text: string) => store.addSubtask(taskId, text),
			createDivider: (listId: string, position: number, label: string) => store.createDivider(listId, position, label),
			checkAllInList: (listId: string) => store.checkAllInList(listId),
			deleteDoneInList: (listId: string) => store.deleteDoneInList(listId),
			deleteAllSubtasksOfTask: (taskId: string) => store.deleteAllSubtasksOfTask(taskId),
			renameList: (listId: string, name: string) => store.renameList(listId, name),
			deleteList: (listId: string) => store.deleteList(listId),
			changeTaskPriority: (taskId: string, priority: Priority) => store.changeTaskPriority(taskId, priority),
			changeTaskTimeframe: (taskId: string, timeframe: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null) => store.changeTaskTimeframe(taskId, timeframe),
			togglePin: (taskId: string) => store.togglePin(taskId),
			updateTask: (taskId: string, text: string) => store.updateTask(taskId, text),
			updateTaskEmoji: (taskId: string, emoji: string) => store.updateTaskEmoji(taskId, emoji),
			moveTaskToList: (taskId: string, listId: string) => store.moveTaskToList(taskId, listId),
			deleteTaskDirect: (taskId: string) => store.deleteTaskDirect(taskId)
		},
		get collapsedSubtasksListIds() { return collapsedSubtasksListIds; },
		toggleCollapseSubtasks,
		setSubtasksForceState: (listId: string, open: boolean) => {
			const next = new Map(subtasksForceState);
			next.set(listId, open);
			subtasksForceState = next;
		},
		get profileMap() { return profileMap; },
		get userId() { return data.user?.id; },
		get userEmail() { return data.user?.email; },
		startBulkSelect: (taskId: string) => {
			explicitBulkMode = true;
			bulkSelectedIds = new Set([...bulkSelectedIds, taskId]);
		},
		openDatePicker: (taskId: string, x: number, y: number) => popovers.openDatePicker(taskId, x, y),
		openEmojiPicker: (taskId: string, x: number, y: number) => popovers.openEmojiPicker(taskId, x, y),
		openShareDialog: (list: List) => share.openShareDialog(list),
		openListIconPicker: (listId: string, x: number, y: number) => openListIconPicker(listId, x, y)
	};
	const ctx = createContextMenus(ctxDeps);

	// Sorted tasks for active list (reactive to sortMode changes)
	// Read sortFilter.sortMode explicitly so Svelte 5 tracks it as a dependency
	let sortedActiveListTasks = $derived.by(() => {
		const _mode = sortFilter.sortMode; // explicit dependency on sortMode
		if (!activeList) return [];
		return sortFilter.tasksForList(activeList.id);
	});

	// Unteraufgaben der ausgewaehlten Aufgabe
	let focusSubtasks = $derived(selectedTask ? subtasksFor(selectedTask.id) : []);

	// ==========================================
	// SCHIRM-ZUSTAND
	// ==========================================
	/** Mobil: Unterschirm „Liste geoeffnet" bzw. Smart-Ansicht. */
	let unterschirm = $derived(nav.listOpenMobile);
	/** Kopfzeile und Inhalt der Mitte: Smart-Ansicht schlaegt die Liste. */
	let smartTitel = $derived(nav.smartView === 'pins' ? 'Angepinnt' : 'Dringend');
	let smartAufgaben = $derived(nav.smartView === 'pins' ? pinnedTasks : dringendTasks);

	let benutzerName = $derived.by(() => {
		const mail = data.user?.email ?? '';
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
		const sb = data.supabase;
		let listsChannel: any = null;
		let tasksChannel: any = null;
		if (sb) {
			listsChannel = sb
				.channel('v2-lists-realtime')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, (payload: any) => {
					store.handleRealtimeList(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
				})
				.subscribe();
			tasksChannel = sb
				.channel('v2-tasks-realtime')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload: any) => {
					store.handleRealtimeTask(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
				})
				.subscribe();
		}

		// Keyboard shortcuts — genau eine Ctrl+K-Registrierung (die zweite im
		// Layout ist mit der alten Kopfzeile entfallen).
		function handleGlobalKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				searchOpen = !searchOpen;
			}
			// Escape: close all overlays
			if (e.key === 'Escape') {
				if (ctx.contextMenu.show) { ctx.close(); return; }
				if (popovers.emojiPicker.show) { popovers.emojiPicker = { show: false, taskId: '', x: 0, y: 0 }; return; }
				if (listIconPicker.show) { listIconPicker = { show: false, listId: '', x: 0, y: 0 }; return; }
				if (popovers.datePicker.show) { popovers.datePicker = { show: false, taskId: '', x: 0, y: 0 }; return; }
				if (popovers.priorityPicker.show) { popovers.priorityPicker = { show: false, taskId: '', x: 0, y: 0, current: 'normal' }; return; }
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
			// Delete: delete selected in bulk mode
			if ((e.key === 'Delete' || e.key === 'Backspace') && bulkMode && !e.target) {
				e.preventDefault();
				store.bulkDelete([...bulkSelectedIds]);
				clearBulkSelection();
			}
		}
		window.addEventListener('keydown', handleGlobalKeydown);

		return () => {
			window.removeEventListener('keydown', handleGlobalKeydown);
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

	function handleContextMenu(e: MouseEvent, task: Task) {
		ctx.handleTaskContext(e, task);
	}

	/** Karte „Neue Liste": erst hier wird geschrieben, dann gleich hinspringen. */
	async function neueListeAnlegen(title: string, icon: string) {
		const id = await store.createList(title, icon);
		if (!id) return;
		nav.selectList(id);
	}

	function handleTaskOpen(task: Task) {
		nav.selectTask(task.id);
	}

	function handleSearchSelect(taskId: string) {
		const task = tasks.find((t: Task) => t.id === taskId);
		if (!task) return;
		// Erst die Liste — sie raeumt die alte Auswahl ab —, dann die Aufgabe.
		nav.selectList(task.list_id);
		nav.selectTask(task.id);
	}

	function sucheSchliessen() {
		searchOpen = false;
	}

	function waehleTab(t: MobileTab) {
		// Die Suche ist bis T9 das bestehende Overlay: der Tab oeffnet es,
		// der bisherige Schirm bleibt darunter stehen.
		if (t === 'suche') {
			searchOpen = true;
			return;
		}
		nav.setTab(t);
	}

	function zurueck() {
		nav.back();
	}

	async function logout() {
		await data.supabase.auth.signOut();
		goto('/auth/login');
	}

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
		store.bulkDelete([...bulkSelectedIds]);
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
		<ListPanel
			list={activeList}
			tasks={sortedActiveListTasks}
			isActive={true}
			forceSubtasksOpen={getForceSubtasksOpen(activeList.id)}
			onQuickAdd={handleQuickAdd}
			onToggleTask={handleToggleTask}
			onToggleSubtask={handleToggleTask}
			onEditSubtask={handleEditTask}
			onContextMenu={handleContextMenu}
			onTaskOpen={handleTaskOpen}
			onReorderTask={(taskId, targetListId, newPos) => store.reorderTask(taskId, targetListId, newPos)}
			onReorderSubtask={(subtaskId, parentId, newPos) => store.reorderSubtask(subtaskId, parentId, newPos)}
			{bulkMode}
			bulkSelectedIds={bulkSelectedIds}
			onBulkToggle={toggleBulkSelect}
		/>
	{/if}
{/snippet}

{#snippet smartInhalt(aufgaben: Task[], leerText: string)}
	<SmartList
		{aufgaben}
		{lists}
		{subtasksFor}
		onToggle={handleToggleTask}
		onOpen={handleTaskOpen}
		onContextMenu={handleContextMenu}
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
			onLogout={logout}
			onListDragStart={listDragStart}
			onListDragOver={listDragOver}
			onListDrop={listDrop}
			onListDragEnd={listDragEnd}
			{ziehIndex}
			{ziehListId}
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
						</h2>
						<button
							class="tf-ib gross"
							aria-label="Listenmen&uuml; &ouml;ffnen"
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
				{:else}
					<h2><span class="name">Listen</span></h2>
				{/if}
			</header>

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
						{@render smartInhalt(smartAufgaben, 'Nichts Dringendes. Gute Lage.')}
					{:else}
						{@render listenInhalt()}
					{/if}
				{:else}
					<ListsOverview
						{lists}
						activeListId={nav.activeListId}
						{offeneJeListe}
						dringendAnzahl={dringendTasks.length}
						benutzer={benutzerName}
						initiale={benutzerInitiale}
						isDark={theme.isDark}
						onSelectList={(id) => nav.selectList(id)}
						onSelectSmart={(v) => nav.selectSmart(v)}
						onNeueListe={neueListeAnlegen}
						onListContext={(e, list) => ctx.handleListContext(e, list)}
						onToggleTheme={() => theme.toggle()}
						onLogout={logout}
					/>
				{/if}
			</div>
		{:else if nav.smartView}
			<header class="tf-lh">
				<h2>
					<Icon name={nav.smartView === 'pins' ? 'pin' : 'blitz'} />
					<span class="name">{smartTitel}</span>
					<span class="cnt">{smartAufgaben.length}</span>
				</h2>
			</header>
			<div class="tf-liste">
				{@render smartInhalt(
					smartAufgaben,
					nav.smartView === 'pins' ? 'Nichts angepinnt.' : 'Nichts Dringendes. Gute Lage.'
				)}
			</div>
		{:else if activeList}
			<header class="tf-lh">
				<h2>
					<span>{activeList.icon}</span>
					<span class="name">{activeList.title}</span>
					<span class="cnt">{offeneJeListe.get(activeList.id) ?? 0} offen</span>
				</h2>
				<span class="sp"></span>
				<button class="tf-sortbtn" onclick={sortMenuUmschalten}>
					<Icon name="sortierung" size={16} />
					{sortLabels[sortFilter.sortMode]}
					<Icon name="chevron-ab" size={16} />
				</button>
				<button
					class="tf-ib"
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
		<!-- Spalte 3 — Detail. Keine Huelle, kein Scrim, kein Klick daneben. -->
		<aside class="tf-detail" aria-label="Aufgabendetail">
			{#if selectedTask}
				<div class="tf-detail-head">
					<button
						class="tf-ib"
						onclick={() => nav.selectTask(null)}
						aria-label="Auswahl aufheben"
					>
						<Icon name="chevron-links" />
					</button>
				</div>
				{#key selectedTask.id}
					<FocusOverlay
						eingebettet
						task={selectedTask}
						subtasks={focusSubtasks}
						onClose={() => nav.selectTask(null)}
						onToggle={handleToggleTask}
						onUpdate={handleEditTask}
						onChangePriority={(id, p) => store.changeTaskPriority(id, p)}
						onChangeTimeframe={(id, tf) => store.changeTaskTimeframe(id, tf)}
						onUpdateNote={(id, note) => store.updateTaskNote(id, note)}
						onOpenEmojiPicker={(taskId, x, y) => popovers.openEmojiPicker(taskId, x, y)}
						onToggleSubtask={handleToggleTask}
						onUpdateSubtask={handleEditTask}
						onAddSubtask={(parentId, text) => store.addSubtask(parentId, text)}
					/>
				{/key}
			{:else}
				<div class="tf-detail-leer">Aufgabe ausw&auml;hlen</div>
			{/if}
		</aside>
	{/if}

	{#if isMobile}
		<MobileTabBar tab={searchOpen ? 'suche' : nav.mobileTab} onTab={waehleTab} />
	{/if}
</div>

<!-- Detail als Overlay — nur mobil (Bottom-Sheet baut T7) -->
{#if isMobile && selectedTask}
	{#key selectedTask.id}
		<FocusOverlay
			task={selectedTask}
			subtasks={focusSubtasks}
			onClose={() => nav.selectTask(null)}
			onToggle={handleToggleTask}
			onUpdate={handleEditTask}
			onChangePriority={(id, p) => store.changeTaskPriority(id, p)}
			onChangeTimeframe={(id, tf) => store.changeTaskTimeframe(id, tf)}
			onUpdateNote={(id, note) => store.updateTaskNote(id, note)}
			onOpenEmojiPicker={(taskId, x, y) => popovers.openEmojiPicker(taskId, x, y)}
			onToggleSubtask={handleToggleTask}
			onUpdateSubtask={handleEditTask}
			onAddSubtask={(parentId, text) => store.addSubtask(parentId, text)}
		/>
	{/key}
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

<!-- Search Overlay -->
{#if searchOpen}
	<SearchOverlay
		{tasks}
		lists={lists}
		onSelect={handleSearchSelect}
		onClose={sucheSchliessen}
	/>
{/if}

<!-- Context Menu -->
{#if ctx.contextMenu.show}
	<ContextMenu
		items={ctx.contextMenu.items}
		x={ctx.contextMenu.x}
		y={ctx.contextMenu.y}
		onclose={() => { ctx.close(); }}
	/>
{/if}

<!-- Emoji Picker (Task) -->
{#if popovers.emojiPicker.show}
	<EmojiPicker
		x={popovers.emojiPicker.x}
		y={popovers.emojiPicker.y}
		onSelect={(emoji) => { popovers.handleEmojiSelect(emoji); }}
		onClose={() => { popovers.emojiPicker = { show: false, taskId: '', x: 0, y: 0 }; }}
	/>
{/if}

<!-- Emoji Picker (List Icon) -->
{#if listIconPicker.show}
	<EmojiPicker
		x={listIconPicker.x}
		y={listIconPicker.y}
		onSelect={(emoji) => { handleListIconSelect(emoji); }}
		onClose={() => { listIconPicker = { show: false, listId: '', x: 0, y: 0 }; }}
	/>
{/if}

<!-- Date Picker -->
{#if popovers.datePicker.show}
	{@const dpTask = tasks.find((t) => t.id === popovers.datePicker.taskId)}
	<DatePicker
		x={popovers.datePicker.x}
		y={popovers.datePicker.y}
		current={dpTask?.due_date ?? null}
		onSelect={(date) => { popovers.handleDateSelect(date); }}
		onClose={() => { popovers.datePicker = { show: false, taskId: '', x: 0, y: 0 }; }}
	/>
{/if}

<!-- Priority Picker -->
{#if popovers.priorityPicker.show}
	<PriorityPicker
		x={popovers.priorityPicker.x}
		y={popovers.priorityPicker.y}
		current={popovers.priorityPicker.current}
		onSelect={(p) => { popovers.handlePrioritySelect(p); }}
		onClose={() => { popovers.priorityPicker = { show: false, taskId: '', x: 0, y: 0, current: 'normal' }; }}
	/>
{/if}

<!-- Share Dialog -->
{#if share.shareDialog.show && share.shareDialog.list}
	<ShareDialog
		list={share.shareDialog.list}
		shares={share.shareDialog.shares}
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
