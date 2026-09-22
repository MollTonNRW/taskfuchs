<script lang="ts">
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import { toasts, showInputDialog } from '$lib/stores/toast';
	import { browser } from '$app/environment';
	import { onMount, untrack } from 'svelte';
	import type { Database } from '$lib/types/database';
	import type { Priority } from '$lib/constants';
	import { v2Events } from '$lib/stores/v2/events.svelte';
	import { nav } from '$lib/stores/tf/navigation.svelte';
	import { profilesStore } from '$lib/stores/profiles';
	import { getProfilesByIds } from '$lib/services/supabase-crud';

	import Pinboard from '$lib/components/v2/Pinboard.svelte';
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

	let isMobile = $state(false);

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

	// Sync bulkMode to shared event bus for header display
	$effect(() => {
		v2Events.bulkModeActive = bulkMode;
	});

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

	// Pinned tasks
	let pinnedTasks = $derived(
		tasks.filter((t: Task) => t.pinned && !t.done)
	);

	// Profile der Pinner (pinned_by) fuer das "gepinnt von"-Badge vorladen --
	// nur fremde IDs, die noch nicht geladen wurden. Befuellt den globalen
	// profilesStore, aus dem das Pinboard-Badge liest.
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
			store.changeListIcon(listIconPicker.listId, emoji || '\uD83D\uDCCB');
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

	// Sync sort label to shared event bus for header display
	$effect(() => {
		v2Events.sortLabel = sortLabels[sortFilter.sortMode];
	});

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
	let focusSubtasks = $derived(
		selectedTask
			? tasks.filter((t: Task) => t.parent_id === selectedTask!.id).sort((a: Task, b: Task) => a.position - b.position)
			: []
	);

	/** Liegt der Fokus in einem Textfeld? Dann gehoeren Pfeiltasten dem Cursor. */
	function inEingabefeld(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
	}

	// Track mobile/desktop + Realtime + Keyboard shortcuts
	onMount(() => {
		const mq = window.matchMedia('(max-width: 768px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
		mq.addEventListener('change', handler);

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

		// Keyboard shortcuts
		function handleGlobalKeydown(e: KeyboardEvent) {
			// Ctrl+K / Cmd+K: search
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				searchOpen = !searchOpen;
			}
			// Escape: close all overlays
			if (e.key === 'Escape') {
				if (ctx.contextMenu.show) { ctx.close(); return; }
				if (nav.selectedTaskId) { nav.selectTask(null); return; }
				if (popovers.emojiPicker.show) { popovers.emojiPicker = { show: false, taskId: '', x: 0, y: 0 }; return; }
				if (listIconPicker.show) { listIconPicker = { show: false, listId: '', x: 0, y: 0 }; return; }
				if (popovers.datePicker.show) { popovers.datePicker = { show: false, taskId: '', x: 0, y: 0 }; return; }
				if (popovers.priorityPicker.show) { popovers.priorityPicker = { show: false, taskId: '', x: 0, y: 0, current: 'normal' }; return; }
				if (share.shareDialog.show) { share.close(); return; }
				if (searchOpen) { searchOpen = false; return; }
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
			mq.removeEventListener('change', handler);
			window.removeEventListener('keydown', handleGlobalKeydown);
			if (sb && listsChannel) sb.removeChannel(listsChannel);
			if (sb && tasksChannel) sb.removeChannel(tasksChannel);
		};
	});

	// Layout -> Page communication via store signals (replaces window custom events)
	let lastSearchToggle = 0;
	$effect(() => {
		const val = v2Events.searchToggle;
		if (val > lastSearchToggle) { searchOpen = !searchOpen; }
		lastSearchToggle = val;
	});

	let lastSortToggle = 0;
	$effect(() => {
		const val = v2Events.sortToggle;
		if (val > lastSortToggle) {
			if (!sortFilter.sortMenuOpen) {
				const btn = document.querySelector('.v2-sort-btn') as HTMLElement;
				if (btn) {
					const rect = btn.getBoundingClientRect();
					sortMenuPos = { left: rect.left, top: rect.bottom + 4 };
				}
			}
			sortFilter.sortMenuOpen = !sortFilter.sortMenuOpen;
		}
		lastSortToggle = val;
	});

	let lastBulkToggle = 0;
	$effect(() => {
		const val = v2Events.bulkToggle;
		if (val > lastBulkToggle) {
			if (bulkMode) { clearBulkSelection(); } else { explicitBulkMode = true; }
		}
		lastBulkToggle = val;
	});

	let lastAddListSignal = v2Events.addListSignal;
	$effect(() => {
		const val = v2Events.addListSignal;
		if (val > lastAddListSignal) { handleAddList(); }
		lastAddListSignal = val;
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

	async function handleAddList() {
		const idx = await store.createList();
		if (idx < 0) return;
		const newList = store.lists[idx];
		if (!newList) return;
		nav.selectList(newList.id);
		requestAnimationFrame(() => {
			document.querySelector(`[data-tab-list-id="${newList.id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
		});
		const name = await showInputDialog('Liste benennen', '', newList.title, 'Listenname');
		if (name?.trim() && name.trim() !== newList.title) store.renameList(newList.id, name.trim());
	}

	function handleTaskOpen(task: Task) {
		nav.selectTask(task.id);
	}

	function handleSearchSelect(taskId: string) {
		const task = tasks.find((t: Task) => t.id === taskId);
		if (task) nav.selectTask(task.id);
	}

	// ---- Swipe between lists (mobile) ----
	let swipeStartX = 0;
	let swipeStartY = 0;
	let swipeActive = false;

	function handleSwipeTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		swipeStartX = touch.clientX;
		swipeStartY = touch.clientY;
		swipeActive = true;
	}

	function handleSwipeTouchMove(e: TouchEvent) {
		if (!swipeActive || e.touches.length !== 1) return;
		// We only detect — no preventDefault here (passive listener, keeps scrolling intact)
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

	// ---- List Tab Drag & Drop ----
	let tabDragOverIdx: number | null = $state(null);
	let draggingTabId: string | null = $state(null);

	function handleTabDragStart(e: DragEvent, list: List, idx: number) {
		if (!e.dataTransfer) return;
		draggingTabId = list.id;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-list-tab', JSON.stringify({ listId: list.id }));
		const el = e.currentTarget as HTMLElement;
		requestAnimationFrame(() => { el.style.opacity = '0.4'; });
	}

	function handleTabDragEnd(e: DragEvent) {
		draggingTabId = null;
		tabDragOverIdx = null;
		const el = e.currentTarget as HTMLElement;
		el.style.opacity = '';
	}

	function handleTabDragOver(e: DragEvent, idx: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const isAfter = e.clientX > rect.left + rect.width / 2;
		tabDragOverIdx = isAfter ? idx + 1 : idx;
	}

	function handleTabDrop(e: DragEvent) {
		e.preventDefault();
		if (!e.dataTransfer) return;
		const dropIdx = tabDragOverIdx ?? 0;
		tabDragOverIdx = null;
		draggingTabId = null;
		try {
			const raw = e.dataTransfer.getData('application/x-list-tab');
			if (raw) {
				const data = JSON.parse(raw);
				if (data.listId) {
					// Die Auswahl haengt an der ID — Umsortieren laesst sie unberuehrt
					store.reorderList(data.listId, dropIdx);
				}
			}
		} catch { /* ignore */ }
	}

	// Long-press on list tabs (mobile touch-and-hold, 300ms)
	let tabLongPressTimer: ReturnType<typeof setTimeout> | null = null;
	let tabLongPressFiredAt = 0;
	let tabTouchStartX = 0;
	let tabTouchStartY = 0;

	function handleTabTouchStart(e: TouchEvent, list: List) {
		const touch = e.touches[0];
		tabTouchStartX = touch.clientX;
		tabTouchStartY = touch.clientY;
		tabLongPressTimer = setTimeout(() => {
			tabLongPressTimer = null;
			tabLongPressFiredAt = Date.now();
			const syntheticEvent = new MouseEvent('contextmenu', {
				clientX: tabTouchStartX,
				clientY: tabTouchStartY,
				bubbles: true
			});
			ctx.handleListContext(syntheticEvent, list);
		}, 300);
	}
	function handleTabTouchMove(e: TouchEvent) {
		if (!tabLongPressTimer) return;
		const touch = e.touches[0];
		// 10px-Toleranz statt Sofort-Abbruch — minimale Fingerbewegung killt den
		// Long-Press nicht mehr
		if (Math.abs(touch.clientX - tabTouchStartX) > 10 || Math.abs(touch.clientY - tabTouchStartY) > 10) {
			clearTimeout(tabLongPressTimer);
			tabLongPressTimer = null;
		}
	}
	function handleTabTouchEnd(e: TouchEvent) {
		if (tabLongPressTimer) { clearTimeout(tabLongPressTimer); tabLongPressTimer = null; }
		// Nach gefeuertem Long-Press: emulierten Ghost-Click unterdrücken, der
		// sonst das frisch geöffnete Menü über dessen Backdrop sofort schließt
		if (Date.now() - tabLongPressFiredAt < 700) e.preventDefault();
	}
	function handleTabTouchCancel() {
		if (tabLongPressTimer) { clearTimeout(tabLongPressTimer); tabLongPressTimer = null; }
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

<!-- Pinboard -->
<Pinboard
	{tasks}
	{lists}
	currentUserId={data.user?.id ?? ''}
	onUnpin={(id) => { store.togglePin(id); }}
	onUnpinAll={() => { for (const t of pinnedTasks) store.togglePin(t.id); }}
	onTaskClick={(task) => { nav.selectTask(task.id); }}
	onPin={(taskId) => { const t = tasks.find((x: Task) => x.id === taskId); if (t && !t.pinned) store.togglePin(taskId); }}
/>

<!-- List Tabs -->
{#if lists.length > 0}
	<div class="v2-list-tabs">
		{#each lists as list, i (list.id)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<button
				class="v2-list-tab"
				class:active={list.id === nav.activeListId}
				class:tab-drag-over-left={tabDragOverIdx === i && draggingTabId && draggingTabId !== list.id}
				class:tab-drag-over-right={tabDragOverIdx === i + 1 && draggingTabId && draggingTabId !== list.id}
				onclick={() => nav.selectList(list.id)}
				oncontextmenu={(e) => { e.preventDefault(); if (Date.now() - tabLongPressFiredAt > 700) ctx.handleListContext(e, list); }}
				ontouchstart={(e) => handleTabTouchStart(e, list)}
				ontouchend={handleTabTouchEnd}
				ontouchmove={handleTabTouchMove}
				ontouchcancel={handleTabTouchCancel}
				draggable="true"
				ondragstart={(e) => handleTabDragStart(e, list, i)}
				ondragend={handleTabDragEnd}
				ondragover={(e) => handleTabDragOver(e, i)}
				ondrop={handleTabDrop}
				data-tab-list-id={list.id}
			>
				<span class="v2-tab-icon">{list.icon}</span>
				{list.title}
			</button>
		{/each}
		<button class="v2-list-tab v2-add-list-tab" onclick={handleAddList} aria-label="Neue Liste erstellen">+</button>
	</div>
{/if}

<!-- Single List View (one list at a time) -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="v2-single-list-container"
	ontouchstart={handleSwipeTouchStart}
	ontouchmove={handleSwipeTouchMove}
	ontouchend={handleSwipeTouchEnd}
>
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
</div>

<!-- Sort Dropdown (floating) -->
{#if sortFilter.sortMenuOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0" style="z-index: 60;" onclick={() => { sortFilter.sortMenuOpen = false; }} role="presentation"></div>
	<div class="v2-glass-card" style="position: fixed; z-index: 61; top: {sortMenuPos.top}px; left: {sortMenuPos.left}px; padding: 8px; min-width: 160px;">
		<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--ink-3); padding: 4px 8px; margin-bottom: 4px;">Sortierung</div>
		{#each validSortModes as mode}
			<button
				onclick={() => { sortFilter.sortMode = mode; sortFilter.sortMenuOpen = false; }}
				style="width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--v2-radius); font-size: .65rem; color: var(--ink-2); background: {sortFilter.sortMode === mode ? 'var(--accent-glow)' : 'transparent'}; border: none; cursor: pointer; transition: all .15s ease; text-align: left; min-height: 44px;"
				aria-label="Sortierung: {sortLabels[mode]}"
			>
				<span>{sortLabels[mode]}</span>
				{#if sortFilter.sortMode === mode}
					<span style="margin-left: auto; font-size: .6rem; color: var(--accent);">&#x2713;</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<!-- Empty state -->
{#if lists.length === 0}
	<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center;">
		<div style="font-size: 2.5rem; margin-bottom: 16px;" aria-hidden="true">&#x1F98A;</div>
		<h2 style="font-size: 1rem; font-weight: 700; color: var(--ink); margin-bottom: 8px;">Willkommen bei TaskFuchs v2</h2>
		<p style="font-size: .75rem; color: var(--ink-3); max-width: 320px; line-height: 1.6;">
			Erstelle deine erste Liste um loszulegen.
		</p>
		<button
			onclick={handleAddList}
			style="margin-top: 16px; padding: 10px 20px; border: 1px dashed var(--accent); border-radius: var(--v2-radius); background: var(--accent-glow); color: var(--accent); font-size: .75rem; font-weight: 600; cursor: pointer; font-family: var(--font-ui); min-height: 44px;"
			aria-label="Neue Liste erstellen"
		>
			+ Neue Liste
		</button>
	</div>
{/if}

<!-- Focus Overlay -->
{#if selectedTask}
	<FocusOverlay
		task={selectedTask}
		subtasks={focusSubtasks}
		onClose={() => { nav.selectTask(null); }}
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
{/if}

<!-- Search Overlay -->
{#if searchOpen}
	<SearchOverlay
		{tasks}
		lists={lists}
		onSelect={handleSearchSelect}
		onClose={() => { searchOpen = false; }}
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
