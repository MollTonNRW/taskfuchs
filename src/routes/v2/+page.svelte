<script lang="ts">
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import { listsStore } from '$lib/stores/lists';
	import { hiddenListIds } from '$lib/stores/visibility';
	import { toasts } from '$lib/stores/toast';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { Database } from '$lib/types/database';
	import type { Priority } from '$lib/constants';
	import { v2Events } from '$lib/stores/v2/events.svelte';

	import Pinboard from '$lib/components/v2/Pinboard.svelte';
	import ListPanel from '$lib/components/v2/ListPanel.svelte';
	import TaskCard from '$lib/components/v2/TaskCard.svelte';
	import ToastContainer from '$lib/components/v2/ToastContainer.svelte';
	import ConfirmDialog from '$lib/components/v2/ConfirmDialog.svelte';
	import InputDialog from '$lib/components/v2/InputDialog.svelte';
	import FocusOverlay from '$lib/components/v2/FocusOverlay.svelte';
	import SearchOverlay from '$lib/components/v2/SearchOverlay.svelte';
	import ContextMenu from '$lib/components/v2/ContextMenu.svelte';
	import NotePopover from '$lib/components/v2/NotePopover.svelte';
	import EmojiPicker from '$lib/components/v2/EmojiPicker.svelte';
	import DatePicker from '$lib/components/v2/DatePicker.svelte';
	import PriorityPicker from '$lib/components/v2/PriorityPicker.svelte';
	import BulkToolbar from '$lib/components/v2/BulkToolbar.svelte';
	import ShareDialog from '$lib/components/v2/ShareDialog.svelte';
	import CoinFloat from '$lib/components/v2/CoinFloat.svelte';
	import LevelUpOverlay from '$lib/components/v2/LevelUpOverlay.svelte';

	import { createContextMenus, type ContextMenuDeps } from '$lib/composables/v2/useContextMenus.svelte';
	import { createSortFilter, sortLabels, validSortModes, type SortMode } from '$lib/composables/v2/useSortFilter.svelte';
	import { createPopovers } from '$lib/composables/v2/usePopovers.svelte';
	import { createShareDialog } from '$lib/composables/v2/useShareDialog.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];
	type Profile = Database['public']['Tables']['profiles']['Row'];

	let { data } = $props();

	const store = createTaskStore();

	// CoinFloat state
	let coinFloats = $state<Array<{ id: number; amount: number; x: number; y: number }>>([]);
	let coinFloatCounter = 0;

	// LevelUp state
	let levelUpData = $state<{ show: boolean; level: number; rank: string }>({ show: false, level: 1, rank: '' });

	// Track gamification events to show CoinFloat + LevelUp
	let lastGamEventCounter = 0;
	$effect(() => {
		const counter = v2Events.eventCounter;
		const ev = v2Events.lastEvent;
		if (!ev || counter === lastGamEventCounter) return;
		if (ev.type !== 'task_done' && ev.type !== 'subtask_done') return;
		lastGamEventCounter = counter;

		// Show coin float at a semi-random position near center
		const cx = (typeof window !== 'undefined' ? window.innerWidth / 2 : 300) + (Math.random() - 0.5) * 100;
		const cy = (typeof window !== 'undefined' ? window.innerHeight / 2 : 300) + (Math.random() - 0.5) * 60;
		const floatId = ++coinFloatCounter;
		coinFloats = [...coinFloats, { id: floatId, amount: ev.parentId ? 1 : 2, x: cx, y: cy }];
		setTimeout(() => {
			coinFloats = coinFloats.filter(f => f.id !== floatId);
		}, 1000);
	});

	// Initialize store in $effect (runs during hydration before onMount)
	let storeReady = $state(false);
	$effect(() => {
		if (data.supabase && data.user && !storeReady) {
			store.init(data.supabase, data.user.id, data.lists, data.tasks);
			listsStore.set(data.lists);
			storeReady = true;
		}
	});

	// Reactive lists/tasks from store
	let lists = $derived(store.lists);
	let tasks = $derived(store.tasks);

	// Mobile: active list tab index
	let activeListIndex = $state(0);
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

	// View mode: 'list' | 'kanban'
	let viewMode = $state<'list' | 'kanban'>('list');

	// Sort menu position (computed from sort button)
	let sortMenuPos = $state<{ left: number; top: number }>({ left: 0, top: 0 });

	// Sync viewMode to shared event bus for header display
	$effect(() => {
		v2Events.viewMode = viewMode;
	});

	// Visible lists (with bounds-check on activeListIndex)
	let visibleLists = $derived(
		lists.filter((l: List) => !$hiddenListIds.has(l.id))
	);

	// Clamp activeListIndex when visible lists change (e.g. list hidden/deleted)
	$effect(() => {
		const len = visibleLists.length;
		if (len > 0 && activeListIndex >= len) {
			activeListIndex = len - 1;
		}
	});

	// Pinned tasks
	let pinnedTasks = $derived(
		tasks.filter((t: Task) => t.pinned && !t.done)
	);

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

	// Kanban derived data for the active list
	let activeListTopLevelTasks = $derived(
		visibleLists[activeListIndex]
			? tasks.filter((t: Task) => t.list_id === visibleLists[activeListIndex].id && !t.parent_id && t.type !== 'divider')
			: []
	);
	let kanbanDoneTasks = $derived(
		activeListTopLevelTasks.filter((t: Task) => t.done)
	);
	let kanbanInProgressTasks = $derived(
		activeListTopLevelTasks.filter((t: Task) => !t.done && tasks.some((sub: Task) => sub.parent_id === t.id && sub.done))
	);
	let kanbanOpenTasks = $derived(
		activeListTopLevelTasks.filter((t: Task) => !t.done && !tasks.some((sub: Task) => sub.parent_id === t.id && sub.done))
	);

	// ==========================================
	// COMPOSABLES
	// ==========================================

	// Popovers
	const popovers = createPopovers({
		get tasks() { return tasks; },
		updateTaskNote: (id: string, note: string) => store.updateTaskNote(id, note),
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
			deleteAllSubtasksInList: (listId: string) => store.deleteAllSubtasksInList(listId),
			deleteAllSubtasksOfTask: (taskId: string) => store.deleteAllSubtasksOfTask(taskId),
			duplicateList: (listId: string) => store.duplicateList(listId),
			renameList: (listId: string, name: string) => store.renameList(listId, name),
			deleteList: (listId: string) => store.deleteList(listId),
			toggleTask: (taskId: string, done: boolean) => store.toggleTask(taskId, done),
			changeTaskPriority: (taskId: string, priority: Priority) => store.changeTaskPriority(taskId, priority),
			changeTaskTimeframe: (taskId: string, timeframe: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null) => store.changeTaskTimeframe(taskId, timeframe),
			toggleHighlight: (taskId: string) => store.toggleHighlight(taskId),
			togglePin: (taskId: string) => store.togglePin(taskId),
			updateTask: (taskId: string, text: string) => store.updateTask(taskId, text),
			updateTaskNote: (taskId: string, note: string) => store.updateTaskNote(taskId, note),
			updateTaskEmoji: (taskId: string, emoji: string) => store.updateTaskEmoji(taskId, emoji),
			assignTask: (taskId: string, userId: string | null) => store.assignTask(taskId, userId),
			moveTaskToList: (taskId: string, listId: string) => store.moveTaskToList(taskId, listId),
			deleteTaskDirect: (taskId: string) => store.deleteTaskDirect(taskId),
			convertTaskToList: (taskId: string) => store.convertTaskToList(taskId)
		},
		get collapsedSubtasksListIds() { return collapsedSubtasksListIds; },
		toggleCollapseSubtasks,
		setSubtasksForceState: (listId: string, open: boolean) => {
			const next = new Map(subtasksForceState);
			next.set(listId, open);
			subtasksForceState = next;
		},
		getActiveListIndex: () => activeListIndex,
		setActiveListIndex: (idx: number) => { activeListIndex = idx; },
		get profileMap() { return profileMap; },
		get userId() { return data.user?.id; },
		get userEmail() { return data.user?.email; },
		openNotePopover: (taskId: string, x: number, y: number) => popovers.openNotePopover(taskId, x, y),
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
		const activeList = visibleLists[activeListIndex];
		if (!activeList) return [];
		return sortFilter.tasksForList(activeList.id);
	});

	// Focus subtasks (derived from popovers)
	let focusSubtasks = $derived(
		popovers.focusTask
			? tasks.filter((t: Task) => t.parent_id === popovers.focusTask!.id).sort((a: Task, b: Task) => a.position - b.position)
			: []
	);

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
				if (levelUpData.show) { levelUpData = { show: false, level: 1, rank: '' }; return; }
				if (ctx.contextMenu.show) { ctx.close(); return; }
				if (popovers.focusMode.show) { popovers.focusMode = { show: false, taskId: '' }; return; }
				if (popovers.notePopover.show) { popovers.notePopover = { show: false, taskId: '', note: '', x: 0, y: 0 }; return; }
				if (popovers.emojiPicker.show) { popovers.emojiPicker = { show: false, taskId: '', x: 0, y: 0 }; return; }
				if (listIconPicker.show) { listIconPicker = { show: false, listId: '', x: 0, y: 0 }; return; }
				if (popovers.datePicker.show) { popovers.datePicker = { show: false, taskId: '', x: 0, y: 0 }; return; }
				if (popovers.priorityPicker.show) { popovers.priorityPicker = { show: false, taskId: '', x: 0, y: 0, current: 'normal' }; return; }
				if (share.shareDialog.show) { share.close(); return; }
				if (searchOpen) { searchOpen = false; return; }
				if (bulkMode) { clearBulkSelection(); return; }
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

	let lastViewSignal = 0;
	$effect(() => {
		const sig = v2Events.viewSignal;
		if (sig.counter > lastViewSignal) {
			if (sig.mode === 'list' || sig.mode === 'kanban') { viewMode = sig.mode; }
		}
		lastViewSignal = sig.counter;
	});

	let lastAddListSignal = 0;
	$effect(() => {
		const val = v2Events.addListSignal;
		if (val > lastAddListSignal) { store.createList(); }
		lastAddListSignal = val;
	});

	// Push nav counts to shared event bus for sidebar display
	$effect(() => {
		const counts: Record<string, { done: number; total: number }> = {};
		let totalOpen = 0;
		for (const list of lists) {
			const listTasks = tasks.filter((t: Task) => t.list_id === list.id && !t.parent_id && t.type !== 'divider');
			const done = listTasks.filter((t: Task) => t.done).length;
			const total = listTasks.length;
			counts[list.id] = { done, total };
			totalOpen += (total - done);
		}
		v2Events.setNavCounts(counts);
		v2Events.setOpenTaskCount(totalOpen);
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

			// Emit gamification events
			if (newDone) {
				if (task.parent_id) {
					v2Events.emit('subtask_done', id, task.parent_id);
				} else {
					v2Events.emit('task_done', id, null);
				}
			} else {
				v2Events.emit('task_undone', id, task.parent_id);
			}
		}
	}

	function handleEditTask(id: string, text: string) {
		store.updateTask(id, text);
	}

	function handleContextMenu(e: MouseEvent, task: Task) {
		ctx.handleTaskContext(e, task);
	}

	function handleListMenuClick(listId: string) {
		const list = lists.find((l: List) => l.id === listId);
		if (!list) return;
		const btn = document.querySelector(`[data-list-menu="${listId}"]`) as HTMLElement;
		const rect = btn?.getBoundingClientRect();
		const syntheticEvent = new MouseEvent('contextmenu', {
			clientX: rect ? rect.left : 200,
			clientY: rect ? rect.bottom : 100,
			bubbles: true
		});
		ctx.handleListContext(syntheticEvent, list);
	}

	function handleTaskDblClick(task: Task) {
		popovers.openFocusMode(task.id);
	}

	function handleSearchSelect(taskId: string) {
		const task = tasks.find((t: Task) => t.id === taskId);
		if (task) popovers.openFocusMode(task.id);
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

		if (dx < 0) {
			// Swipe left -> next list
			if (activeListIndex < visibleLists.length - 1) {
				activeListIndex = activeListIndex + 1;
			}
		} else {
			// Swipe right -> previous list
			if (activeListIndex > 0) {
				activeListIndex = activeListIndex - 1;
			}
		}
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
					// Map visible index back to the actual list position
					const targetList = visibleLists[dropIdx] ?? visibleLists[visibleLists.length - 1];
					const newPosition = targetList ? targetList.position : visibleLists.length;
					store.reorderList(data.listId, dropIdx);
					// Update activeListIndex to follow the moved tab
					const newIdx = visibleLists.findIndex((l: List) => l.id === data.listId);
					if (newIdx >= 0) activeListIndex = newIdx;
					else activeListIndex = Math.min(dropIdx, visibleLists.length - 1);
				}
			}
		} catch { /* ignore */ }
	}

	// Long-press on list tabs (mobile touch-and-hold, 300ms)
	let tabLongPressTimer: ReturnType<typeof setTimeout> | null = null;
	function handleTabTouchStart(e: TouchEvent, list: List) {
		const touch = e.touches[0];
		const tx = touch.clientX;
		const ty = touch.clientY;
		tabLongPressTimer = setTimeout(() => {
			tabLongPressTimer = null;
			const syntheticEvent = new MouseEvent('contextmenu', {
				clientX: tx,
				clientY: ty,
				bubbles: true
			});
			ctx.handleListContext(syntheticEvent, list);
		}, 300);
	}
	function handleTabTouchEnd() {
		if (tabLongPressTimer) { clearTimeout(tabLongPressTimer); tabLongPressTimer = null; }
	}
	function handleTabTouchCancel() {
		if (tabLongPressTimer) { clearTimeout(tabLongPressTimer); tabLongPressTimer = null; }
	}

	// Bulk handlers
	function handleBulkToggleDone(done: boolean) {
		store.bulkToggleDone([...bulkSelectedIds], done);
		if (done) {
			for (const id of bulkSelectedIds) {
				const task = tasks.find((t: Task) => t.id === id);
				if (task) {
					v2Events.emit(task.parent_id ? 'subtask_done' : 'task_done', id, task.parent_id);
				}
			}
		}
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
	onUnpin={(id) => { store.togglePin(id); }}
	onUnpinAll={() => { for (const t of pinnedTasks) store.togglePin(t.id); }}
	onTaskClick={(task) => { popovers.openFocusMode(task.id); }}
	onPin={(taskId) => { const t = tasks.find((x: Task) => x.id === taskId); if (t && !t.pinned) store.togglePin(taskId); }}
/>

<!-- List Tabs (always visible, like v6 PoC) -->
{#if visibleLists.length > 0}
	<div class="v2-list-tabs">
		{#each visibleLists as list, i (list.id)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<button
				class="v2-list-tab"
				class:active={i === activeListIndex}
				class:tab-drag-over-left={tabDragOverIdx === i && draggingTabId && draggingTabId !== list.id}
				class:tab-drag-over-right={tabDragOverIdx === i + 1 && draggingTabId && draggingTabId !== list.id}
				onclick={() => (activeListIndex = i)}
				oncontextmenu={(e) => ctx.handleListContext(e, list)}
				ontouchstart={(e) => handleTabTouchStart(e, list)}
				ontouchend={handleTabTouchEnd}
				ontouchmove={handleTabTouchCancel}
				ontouchcancel={handleTabTouchCancel}
				draggable="true"
				ondragstart={(e) => handleTabDragStart(e, list, i)}
				ondragend={handleTabDragEnd}
				ondragover={(e) => handleTabDragOver(e, i)}
				ondrop={handleTabDrop}
			>
				<span class="v2-tab-icon">{list.icon}</span>
				{list.title}
			</button>
		{/each}
	</div>
{/if}

<!-- View: List or Kanban -->
{#if viewMode === 'kanban' && visibleLists[activeListIndex]}
	<!-- Kanban View -->
	{@const activeList = visibleLists[activeListIndex]}
	<div class="v2-kanban-view">
		<!-- Offen -->
		<div class="v2-kanban-col">
			<div class="v2-kanban-header">
				<span class="dot" style="background: var(--v2-accent);"></span>
				<span>Offen</span>
				<span class="v2-kanban-count">{kanbanOpenTasks.length}</span>
			</div>
			<div class="v2-kanban-body">
				{#each kanbanOpenTasks as task (task.id)}
					{@const subs = tasks.filter((t: Task) => t.parent_id === task.id).sort((a: Task, b: Task) => a.position - b.position)}
					{@const subsDone = subs.filter((s: Task) => s.done).length}
					<TaskCard
						{task}
						subtasks={subs}
						subtaskCount={subs.length}
						subtaskDoneCount={subsDone}
						allSubtasksDone={subs.length > 0 && subsDone === subs.length}
						ontoggle={handleToggleTask}
						onedit={handleEditTask}
						ontogglesubtask={handleToggleTask}
						oneditsubtask={handleEditTask}
						oncontextmenu={handleContextMenu}
						ondblclick={handleTaskDblClick}
						onReorderSubtask={(subtaskId, parentId, newPos) => store.reorderSubtask(subtaskId, parentId, newPos)}
						{bulkMode}
						bulkSelected={bulkSelectedIds.has(task.id)}
						onBulkToggle={toggleBulkSelect}
					/>
				{/each}
			</div>
		</div>

		<!-- In Arbeit -->
		<div class="v2-kanban-col">
			<div class="v2-kanban-header">
				<span class="dot" style="background: var(--v2-yellow, #f59e0b);"></span>
				<span>In Arbeit</span>
				<span class="v2-kanban-count">{kanbanInProgressTasks.length}</span>
			</div>
			<div class="v2-kanban-body">
				{#each kanbanInProgressTasks as task (task.id)}
					{@const subs = tasks.filter((t: Task) => t.parent_id === task.id).sort((a: Task, b: Task) => a.position - b.position)}
					{@const subsDone = subs.filter((s: Task) => s.done).length}
					<TaskCard
						{task}
						subtasks={subs}
						subtaskCount={subs.length}
						subtaskDoneCount={subsDone}
						allSubtasksDone={subs.length > 0 && subsDone === subs.length}
						ontoggle={handleToggleTask}
						onedit={handleEditTask}
						ontogglesubtask={handleToggleTask}
						oneditsubtask={handleEditTask}
						oncontextmenu={handleContextMenu}
						ondblclick={handleTaskDblClick}
						onReorderSubtask={(subtaskId, parentId, newPos) => store.reorderSubtask(subtaskId, parentId, newPos)}
						{bulkMode}
						bulkSelected={bulkSelectedIds.has(task.id)}
						onBulkToggle={toggleBulkSelect}
					/>
				{/each}
			</div>
		</div>

		<!-- Erledigt -->
		<div class="v2-kanban-col">
			<div class="v2-kanban-header">
				<span class="dot" style="background: var(--v2-green, #22c55e);"></span>
				<span>Erledigt</span>
				<span class="v2-kanban-count">{kanbanDoneTasks.length}</span>
			</div>
			<div class="v2-kanban-body">
				{#each kanbanDoneTasks as task (task.id)}
					<TaskCard
						{task}
						ontoggle={handleToggleTask}
						onedit={handleEditTask}
						oncontextmenu={handleContextMenu}
						ondblclick={handleTaskDblClick}
						{bulkMode}
						bulkSelected={bulkSelectedIds.has(task.id)}
						onBulkToggle={toggleBulkSelect}
					/>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<!-- Single List View (v6 style: one list at a time) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="v2-single-list-container"
		ontouchstart={handleSwipeTouchStart}
		ontouchmove={handleSwipeTouchMove}
		ontouchend={handleSwipeTouchEnd}
	>
		{#if visibleLists[activeListIndex]}
			{@const activeList = visibleLists[activeListIndex]}
			<ListPanel
				list={activeList}
				tasks={sortedActiveListTasks}
				colIndex={activeListIndex}
				isActive={true}
				forceSubtasksOpen={getForceSubtasksOpen(activeList.id)}
				onQuickAdd={handleQuickAdd}
				onToggleTask={handleToggleTask}
				onEditTask={handleEditTask}
				onToggleSubtask={handleToggleTask}
				onEditSubtask={handleEditTask}
				onContextMenu={handleContextMenu}
				onTaskDblClick={handleTaskDblClick}
				onListMenuClick={handleListMenuClick}
				onReorderTask={(taskId, targetListId, newPos) => store.reorderTask(taskId, targetListId, newPos)}
				onReorderSubtask={(subtaskId, parentId, newPos) => store.reorderSubtask(subtaskId, parentId, newPos)}
				{bulkMode}
				bulkSelectedIds={bulkSelectedIds}
				onBulkToggle={toggleBulkSelect}
			/>
		{/if}
	</div>
{/if}

<!-- Sort Dropdown (floating) -->
{#if sortFilter.sortMenuOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0" style="z-index: 60;" onclick={() => { sortFilter.sortMenuOpen = false; }} role="presentation"></div>
	<div class="v2-glass-card" style="position: fixed; z-index: 61; top: {sortMenuPos.top}px; left: {sortMenuPos.left}px; padding: 8px; min-width: 160px;">
		<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); padding: 4px 8px; margin-bottom: 4px;">Sortierung</div>
		{#each validSortModes as mode}
			<button
				onclick={() => { sortFilter.sortMode = mode; sortFilter.sortMenuOpen = false; }}
				style="width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--v2-radius); font-size: .65rem; color: var(--v2-text-secondary); background: {sortFilter.sortMode === mode ? 'var(--v2-accent-glow)' : 'transparent'}; border: none; cursor: pointer; transition: all .15s ease; text-align: left; min-height: 44px;"
				aria-label="Sortierung: {sortLabels[mode]}"
			>
				<span>{sortLabels[mode]}</span>
				{#if sortFilter.sortMode === mode}
					<span style="margin-left: auto; font-size: .6rem; color: var(--v2-accent);">&#x2713;</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<!-- Empty state -->
{#if visibleLists.length === 0}
	<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center;">
		<div style="font-size: 2.5rem; margin-bottom: 16px;" aria-hidden="true">&#x1F98A;</div>
		<h2 style="font-size: 1rem; font-weight: 700; color: var(--v2-text); margin-bottom: 8px;">Willkommen bei TaskFuchs v2</h2>
		<p style="font-size: .75rem; color: var(--v2-text-muted); max-width: 320px; line-height: 1.6;">
			Erstelle deine erste Liste um loszulegen.
		</p>
		<button
			onclick={() => store.createList()}
			style="margin-top: 16px; padding: 10px 20px; border: 1px dashed var(--v2-accent); border-radius: var(--v2-radius); background: var(--v2-accent-glow); color: var(--v2-accent); font-size: .75rem; font-weight: 600; cursor: pointer; font-family: var(--v2-font); min-height: 44px;"
			aria-label="Neue Liste erstellen"
		>
			+ Neue Liste
		</button>
	</div>
{/if}

<!-- Focus Overlay -->
{#if popovers.focusTask}
	<FocusOverlay
		task={popovers.focusTask}
		subtasks={focusSubtasks}
		onClose={() => { popovers.focusMode = { show: false, taskId: '' }; }}
		onToggle={handleToggleTask}
		onUpdate={handleEditTask}
		onChangePriority={(id, p) => store.changeTaskPriority(id, p)}
		onChangeTimeframe={(id, tf) => store.changeTaskTimeframe(id, tf)}
		onUpdateNote={(id, note) => store.updateTaskNote(id, note)}
		onUpdateEmoji={(id, emoji) => store.updateTaskEmoji(id, emoji)}
		onToggleSubtask={handleToggleTask}
		onUpdateSubtask={handleEditTask}
		onAddSubtask={(parentId, text) => store.addSubtask(parentId, text)}
	/>
{/if}

<!-- Search Overlay -->
{#if searchOpen}
	<SearchOverlay
		{tasks}
		lists={visibleLists}
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

<!-- Note Popover -->
{#if popovers.notePopover.show}
	<NotePopover
		note={popovers.notePopover.note}
		x={popovers.notePopover.x}
		y={popovers.notePopover.y}
		onSave={(text) => { popovers.handleNoteSave(text); }}
		onClose={() => { popovers.notePopover = { show: false, taskId: '', note: '', x: 0, y: 0 }; }}
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
	lists={visibleLists}
	onToggleDone={handleBulkToggleDone}
	onChangePriority={handleBulkChangePriority}
	onDelete={handleBulkDelete}
	onMoveToList={handleBulkMoveToList}
	onCancel={clearBulkSelection}
/>

<!-- CoinFloat particles -->
{#each coinFloats as float (float.id)}
	<div aria-hidden="true">
		<CoinFloat amount={float.amount} x={float.x} y={float.y} />
	</div>
{/each}

<!-- Level Up Overlay -->
{#if levelUpData.show}
	<LevelUpOverlay
		newLevel={levelUpData.level}
		newRank={levelUpData.rank}
		onClose={() => { levelUpData = { show: false, level: 1, rank: '' }; }}
	/>
{/if}

<!-- Toast + Confirm + Input -->
<ToastContainer />
<ConfirmDialog />
<InputDialog />
