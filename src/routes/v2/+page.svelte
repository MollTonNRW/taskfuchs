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
	import ToastContainer from '$lib/components/v2/ToastContainer.svelte';
	import ConfirmDialog from '$lib/components/v2/ConfirmDialog.svelte';
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

	// Initialize store
	$effect(() => {
		if (data.supabase && data.user) {
			store.init(data.supabase, data.user.id, data.lists, data.tasks);
			listsStore.set(data.lists);
		}
	});

	// Reactive lists/tasks from store
	let lists = $derived(store.lists);
	let tasks = $derived(store.tasks);

	// Mobile: active list tab index
	let activeListIndex = $state(0);
	let isMobile = $state(false);

	// Collapsed subtask list IDs
	let collapsedSubtasksListIds = $state(new Set<string>());
	function toggleCollapseSubtasks(listId: string) {
		const next = new Set(collapsedSubtasksListIds);
		if (next.has(listId)) next.delete(listId); else next.add(listId);
		collapsedSubtasksListIds = next;
	}

	// Profile map (for assign submenu)
	let profileMap = $state(new Map<string, Profile>());

	// Bulk selection
	let bulkSelectedIds = $state(new Set<string>());
	let bulkMode = $derived(bulkSelectedIds.size > 0);

	function toggleBulkSelect(taskId: string) {
		const next = new Set(bulkSelectedIds);
		if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
		bulkSelectedIds = next;
	}

	function clearBulkSelection() {
		bulkSelectedIds = new Set();
	}

	// Visible lists
	let visibleLists = $derived(
		lists.filter((l: List) => !$hiddenListIds.has(l.id))
	);

	// Pinned tasks
	let pinnedTasks = $derived(
		tasks.filter((t: Task) => t.pinned && !t.done)
	);

	// Search overlay
	let searchOpen = $state(false);

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

	// Share Dialog
	const share = createShareDialog(
		{ get sb() { return store.sb; } },
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
		getActiveListIndex: () => activeListIndex,
		setActiveListIndex: (idx: number) => { activeListIndex = idx; },
		get profileMap() { return profileMap; },
		get userId() { return data.user?.id; },
		get userEmail() { return data.user?.email; },
		openNotePopover: (taskId: string, x: number, y: number) => popovers.openNotePopover(taskId, x, y),
		openDatePicker: (taskId: string, x: number, y: number) => popovers.openDatePicker(taskId, x, y),
		openEmojiPicker: (taskId: string, x: number, y: number) => popovers.openEmojiPicker(taskId, x, y),
		openShareDialog: (list: List) => share.openShareDialog(list)
	};
	const ctx = createContextMenus(ctxDeps);

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

		// Realtime subscriptions
		const sb = store.sb;
		const listsChannel = sb
			.channel('v2-lists-realtime')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, (payload: any) => {
				store.handleRealtimeList(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
			})
			.subscribe();
		const tasksChannel = sb
			.channel('v2-tasks-realtime')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload: any) => {
				store.handleRealtimeTask(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
			})
			.subscribe();

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
			sb.removeChannel(listsChannel);
			sb.removeChannel(tasksChannel);
		};
	});

	// Bounds-check activeListIndex
	$effect(() => {
		if (activeListIndex >= visibleLists.length) {
			activeListIndex = Math.max(0, visibleLists.length - 1);
		}
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
	onTaskClick={(task) => { popovers.openFocusMode(task.id); }}
/>

<!-- Mobile: List Tabs -->
{#if isMobile && visibleLists.length > 1}
	<div class="v2-list-tabs">
		{#each visibleLists as list, i (list.id)}
			<button
				class="v2-list-tab"
				class:active={i === activeListIndex}
				onclick={() => (activeListIndex = i)}
			>
				{list.icon} {list.title}
			</button>
		{/each}
	</div>
{/if}

<!-- Lists -->
<div class="v2-lists-container">
	{#each visibleLists as list, i (list.id)}
		<ListPanel
			{list}
			tasks={sortFilter.tasksForList(list.id)}
			colIndex={i}
			isActive={!isMobile || i === activeListIndex}
			onQuickAdd={handleQuickAdd}
			onToggleTask={handleToggleTask}
			onEditTask={handleEditTask}
			onToggleSubtask={handleToggleTask}
			onEditSubtask={handleEditTask}
			onContextMenu={handleContextMenu}
			onTaskDblClick={handleTaskDblClick}
			onListMenuClick={handleListMenuClick}
		/>
	{/each}
</div>

<!-- Sort Dropdown (floating) -->
{#if sortFilter.sortMenuOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0" style="z-index: 60;" onclick={() => { sortFilter.sortMenuOpen = false; }} role="presentation"></div>
	<div class="v2-glass-card" style="position: fixed; z-index: 61; top: 60px; right: 16px; padding: 8px; min-width: 160px;">
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

<!-- Emoji Picker -->
{#if popovers.emojiPicker.show}
	<EmojiPicker
		x={popovers.emojiPicker.x}
		y={popovers.emojiPicker.y}
		onSelect={(emoji) => { popovers.handleEmojiSelect(emoji); }}
		onClose={() => { popovers.emojiPicker = { show: false, taskId: '', x: 0, y: 0 }; }}
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

<!-- Toast + Confirm -->
<ToastContainer />
<ConfirmDialog />
