<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { Database } from '$lib/types/database';
	import ListPanel from '$lib/components/ListPanel.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import Pinboard from '$lib/components/Pinboard.svelte';
	import NotePopover from '$lib/components/NotePopover.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import FocusOverlay from '$lib/components/FocusOverlay.svelte';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import SearchOverlay from '$lib/components/SearchOverlay.svelte';
	import BulkToolbar from '$lib/components/BulkToolbar.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { seedDemoData } from '$lib/seed-data';
	import { listsStore } from '$lib/stores/lists';
	import { hiddenListIds } from '$lib/stores/visibility';
	import { profilesStore, profileMap } from '$lib/stores/profiles';
	import { sortLabels, type Priority } from '$lib/constants';
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import * as crud from '$lib/services/supabase-crud';
	import { toasts } from '$lib/stores/toast';

	import { createSortFilter, type SortMode } from '$lib/composables/useSortFilter.svelte';
	import { createContextMenus } from '$lib/composables/useContextMenus.svelte';
	import { createPopovers } from '$lib/composables/usePopovers.svelte';
	import { createShareDialog } from '$lib/composables/useShareDialog.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	let { data } = $props();

	// Central store for tasks & lists CRUD
	const store = createTaskStore();

	let activeListIndex = $state(0);

	// ==========================================
	// COMPOSABLES
	// ==========================================
	const sortFilter = createSortFilter(store, toasts);
	const popovers = createPopovers(store);
	const sharing = createShareDialog(store, toasts);

	// Collapse subtasks per list
	let collapsedSubtasksListIds = $state<Set<string>>(new Set());
	function toggleCollapseSubtasks(listId: string) {
		const next = new Set(collapsedSubtasksListIds);
		if (next.has(listId)) next.delete(listId);
		else next.add(listId);
		collapsedSubtasksListIds = next;
	}

	const ctxMenuDeps = {
		store,
		get collapsedSubtasksListIds() { return collapsedSubtasksListIds; },
		toggleCollapseSubtasks,
		getActiveListIndex: () => activeListIndex,
		setActiveListIndex: (idx: number) => { activeListIndex = idx; },
		get profileMap() { return $profileMap; },
		get userId() { return data.user?.id; },
		get userEmail() { return data.user?.email ?? undefined; },
		openNotePopover: popovers.openNotePopover,
		openDatePicker: popovers.openDatePicker,
		openEmojiPicker: popovers.openEmojiPicker
	};
	const ctxMenus = createContextMenus(ctxMenuDeps);

	// ==========================================
	// SWIPE (mobile list navigation)
	// ==========================================
	let swipeStartX = 0;
	let swipeStartY = 0;
	let swipeTracked = false;

	function handleSwipeStart(e: TouchEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, button, select, [data-drag-handle], .drag-handle')) return;
		swipeStartX = e.touches[0].clientX;
		swipeStartY = e.touches[0].clientY;
		swipeTracked = true;
	}

	function handleSwipeEnd(e: TouchEvent) {
		if (!swipeTracked) return;
		swipeTracked = false;
		const endX = e.changedTouches[0].clientX;
		const endY = e.changedTouches[0].clientY;
		const deltaX = endX - swipeStartX;
		const deltaY = endY - swipeStartY;
		if (Math.abs(deltaX) < 50 || Math.abs(deltaY) > 30) return;
		if (deltaX < 0) {
			activeListIndex = Math.min(activeListIndex + 1, visibleLists.length - 1);
		} else {
			activeListIndex = Math.max(activeListIndex - 1, 0);
		}
	}

	// ==========================================
	// SYNC & INIT
	// ==========================================
	$effect(() => {
		store.init(data.supabase as any, data.user!.id, data.lists as List[], data.tasks as Task[]);
	});

	$effect(() => { listsStore.set(store.lists); });

	// ==========================================
	// SEARCH
	// ==========================================
	let searchQuery = $state('');
	let searchOpen = $state(false);

	let searchResults = $derived(
		searchQuery.trim().length < 2
			? []
			: store.tasks.filter((t) => {
					const q = searchQuery.toLowerCase();
					return t.text.toLowerCase().includes(q) || (t.note && t.note.toLowerCase().includes(q));
				})
	);

	function clearSearch() { searchQuery = ''; searchOpen = false; }

	// ==========================================
	// BULK ACTIONS
	// ==========================================
	let bulkMode = $state(false);
	let selectedTaskIds = $state<Set<string>>(new Set());

	function toggleBulkSelect(taskId: string) {
		selectedTaskIds = new Set(selectedTaskIds);
		if (selectedTaskIds.has(taskId)) selectedTaskIds.delete(taskId);
		else selectedTaskIds.add(taskId);
	}

	function selectAllInList(listId: string) {
		const listTaskIds = store.tasks
			.filter((t) => t.list_id === listId && !t.parent_id && !t.done && t.type !== 'divider')
			.map((t) => t.id);
		selectedTaskIds = new Set(listTaskIds);
	}

	function clearSelection() {
		selectedTaskIds = new Set();
		bulkMode = false;
	}

	async function handleBulkToggleDone(done: boolean) {
		const ids = [...selectedTaskIds]; clearSelection();
		await store.bulkToggleDone(ids, done);
	}
	async function handleBulkChangePriority(priority: Priority) {
		const ids = [...selectedTaskIds]; clearSelection();
		await store.bulkChangePriority(ids, priority);
	}
	async function handleBulkDelete() {
		const ids = [...selectedTaskIds]; clearSelection();
		await store.bulkDelete(ids);
	}
	async function handleBulkMoveToList(targetListId: string) {
		const ids = [...selectedTaskIds]; clearSelection();
		await store.bulkMoveToList(ids, targetListId);
	}

	// ==========================================
	// VISIBLE LISTS + CLAMP
	// ==========================================
	let visibleLists = $derived(store.lists.filter((l) => !$hiddenListIds.has(l.id)));

	$effect(() => {
		const maxIdx = visibleLists.length - 1;
		if (visibleLists.length === 0) { activeListIndex = 0; }
		else if (activeListIndex > maxIdx) { activeListIndex = maxIdx; }
	});

	// ==========================================
	// REALTIME
	// ==========================================
	onMount(() => {
		const sb = store.sb;
		const listsChannel = sb
			.channel('lists-realtime')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, (payload) => {
				store.handleRealtimeList(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
			})
			.subscribe();
		const tasksChannel = sb
			.channel('tasks-realtime')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
				store.handleRealtimeTask(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
			})
			.subscribe();
		return () => { sb.removeChannel(listsChannel); sb.removeChannel(tasksChannel); };
	});

	// ==========================================
	// SEED / DEMO DATA
	// ==========================================
	onMount(async () => {
		const sb = store.sb;
		const { data: p } = await sb.from('profiles').select('*');
		if (p) profilesStore.set(p as Database['public']['Tables']['profiles']['Row'][]);
		if (data.user && data.lists.length === 0) {
			const seeded = await seedDemoData(sb, data.user.id);
			if (seeded) {
				const result = await crud.loadUserData(sb, data.user.id);
				store.setLists(result.lists);
				store.setTasks(result.tasks);
			}
		}
	});

	let seedingDemo = $state(false);
	async function loadDemoData() {
		if (!data.user || seedingDemo) return;
		seedingDemo = true;
		const sb = store.sb;
		const seeded = await seedDemoData(sb, data.user.id, true);
		if (seeded) {
			const result = await crud.loadUserData(sb, data.user.id);
			store.setLists(result.lists);
			store.setTasks(result.tasks);
		}
		seedingDemo = false;
	}

	// ==========================================
	// PINBOARD
	// ==========================================
	function scrollToTask(taskId: string) {
		const el = document.getElementById(`task-${taskId}`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			el.classList.add('task-highlight-in');
			setTimeout(() => el.classList.remove('task-highlight-in'), 1000);
		}
	}

	// ==========================================
	// MINIMIZED LISTS
	// ==========================================
	let minimizedListIds = $state<Set<string>>(new Set());
	function toggleMinimizeList(listId: string) {
		minimizedListIds = new Set(minimizedListIds);
		if (minimizedListIds.has(listId)) minimizedListIds.delete(listId);
		else minimizedListIds.add(listId);
	}

	// ==========================================
	// RESIZABLE COLUMNS (Desktop)
	// ==========================================
	let columnWidths = $state<Record<string, number>>({});
	let resizing = $state<{ listId: string; startX: number; startWidth: number } | null>(null);

	function getColumnWidth(listId: string): number { return columnWidths[listId] || 360; }

	function handleResizeStart(e: MouseEvent, listId: string) {
		e.preventDefault();
		const panel = (e.target as HTMLElement).previousElementSibling as HTMLElement;
		if (!panel) return;
		const startWidth = panel.getBoundingClientRect().width;
		resizing = { listId, startX: e.clientX, startWidth };
		(e.target as HTMLElement).classList.add('dragging');
		function handleResizeMove(ev: MouseEvent) {
			if (!resizing) return;
			const delta = ev.clientX - resizing.startX;
			const newWidth = Math.max(280, Math.min(600, resizing.startWidth + delta));
			columnWidths = { ...columnWidths, [resizing.listId]: newWidth };
		}
		function handleResizeEnd() {
			if (resizing) document.querySelector('.col-resize-handle.dragging')?.classList.remove('dragging');
			resizing = null;
			window.removeEventListener('mousemove', handleResizeMove);
			window.removeEventListener('mouseup', handleResizeEnd);
		}
		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', handleResizeEnd);
	}

	// ==========================================
	// KEYBOARD SHORTCUTS
	// ==========================================
	function handleGlobalKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault(); searchOpen = !searchOpen;
			if (!searchOpen) searchQuery = '';
			return;
		}

		if (e.key === 'Escape') {
			if (searchOpen) { clearSearch(); return; }
			if (bulkMode) { clearSelection(); return; }
			if (popovers.emojiPicker.show) { popovers.emojiPicker = { ...popovers.emojiPicker, show: false }; return; }
			if (popovers.focusMode.show) { popovers.focusMode = { ...popovers.focusMode, show: false }; return; }
			if (popovers.notePopover.show) { popovers.notePopover = { ...popovers.notePopover, show: false }; return; }
			if (ctxMenus.contextMenu.show) { ctxMenus.contextMenu = { ...ctxMenus.contextMenu, show: false }; return; }
			if (sharing.shareDialog.show) { sharing.shareDialog = { ...sharing.shareDialog, show: false }; return; }
		}

		if (isInput) return;
		if (e.key === '/') { e.preventDefault(); searchOpen = true; }
	}

	// ==========================================
	// LIST CREATE HANDLER
	// ==========================================
	async function handleCreateList() {
		const newIdx = await store.createList();
		if (newIdx >= 0) activeListIndex = newIdx;
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head>
	<title>TaskFuchs</title>
</svelte:head>

<ToastContainer />
<ConfirmDialog />

{#if ctxMenus.contextMenu.show}
	<ContextMenu
		items={ctxMenus.contextMenu.items}
		x={ctxMenus.contextMenu.x}
		y={ctxMenus.contextMenu.y}
		onClose={() => (ctxMenus.contextMenu = { ...ctxMenus.contextMenu, show: false })}
	/>
{/if}

{#if popovers.notePopover.show}
	<NotePopover
		note={popovers.notePopover.note}
		x={popovers.notePopover.x}
		y={popovers.notePopover.y}
		onSave={popovers.handleNoteSave}
		onClose={() => (popovers.notePopover = { ...popovers.notePopover, show: false })}
	/>
{/if}

{#if sharing.shareDialog.show && sharing.shareDialog.list}
	<ShareDialog
		list={sharing.shareDialog.list}
		shares={sharing.shareDialog.shares}
		onClose={() => (sharing.shareDialog = { ...sharing.shareDialog, show: false })}
		onShare={sharing.shareList}
		onRemoveShare={sharing.removeShare}
		onChangeRole={sharing.changeShareRole}
	/>
{/if}

{#if popovers.focusMode.show && popovers.focusTask}
	<FocusOverlay
		task={popovers.focusTask}
		allTasks={store.tasks}
		onClose={() => (popovers.focusMode = { ...popovers.focusMode, show: false })}
		onToggle={store.toggleTask}
		onUpdate={store.updateTask}
		onDelete={store.deleteTask}
		onChangePriority={store.changeTaskPriority}
		onToggleHighlight={store.toggleHighlight}
		onTogglePin={store.togglePin}
		onUpdateNote={store.updateTaskNote}
		onUpdateEmoji={store.updateTaskEmoji}
		onToggleSubtask={store.toggleSubtask}
		onUpdateSubtask={store.updateSubtask}
		onDeleteSubtask={store.deleteSubtask}
		onAddSubtask={store.addSubtask}
		onTaskContext={ctxMenus.handleTaskContext}
	/>
{/if}

{#if popovers.emojiPicker.show}
	<EmojiPicker
		x={popovers.emojiPicker.x}
		y={popovers.emojiPicker.y}
		onSelect={popovers.handleEmojiSelect}
		onClose={() => (popovers.emojiPicker = { ...popovers.emojiPicker, show: false })}
	/>
{/if}

{#if popovers.datePicker.show}
	<DatePicker
		x={popovers.datePicker.x}
		y={popovers.datePicker.y}
		current={store.tasks.find(t => t.id === popovers.datePicker.taskId)?.due_date ?? null}
		onSelect={popovers.handleDateSelect}
		onClose={() => (popovers.datePicker = { ...popovers.datePicker, show: false })}
	/>
{/if}

<!-- Pinboard -->
<Pinboard
	tasks={store.tasks}
	lists={store.lists}
	onUnpin={store.togglePin}
	onScrollToTask={scrollToTask}
	onClearAll={store.clearPinboard}
	onPin={store.togglePin}
	onTaskClick={popovers.openFocusMode}
/>

<!-- Search Overlay -->
<SearchOverlay
	open={searchOpen}
	query={searchQuery}
	results={searchResults}
	lists={store.lists}
	onClose={clearSearch}
	onSelect={popovers.openFocusMode}
	onQueryChange={(q) => { searchQuery = q; }}
/>

<!-- Bulk Action Toolbar -->
<BulkToolbar
	active={bulkMode}
	selectedCount={selectedTaskIds.size}
	lists={store.lists}
	onToggleDone={handleBulkToggleDone}
	onChangePriority={handleBulkChangePriority}
	onDelete={handleBulkDelete}
	onMoveToList={handleBulkMoveToList}
	onCancel={clearSelection}
/>

<div class="max-w-7xl mx-auto p-4 md:p-6">
	<!-- Toolbar: Search, Sort, Bulk -->
	{#if store.lists.length > 0}
		<div class="flex items-center justify-between mb-4 gap-3">
			<div class="flex items-center gap-2">
				<!-- Search Button -->
				<button
					onclick={() => (searchOpen = true)}
					class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm tf-text-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
					style="border: 1px solid var(--tf-border);"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
					<span class="hidden sm:inline">Suchen</span>
					<kbd class="hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded" style="background: var(--tf-surface-hover);">/</kbd>
				</button>

				<!-- Sort Dropdown -->
				<div class="relative">
					<button
						onclick={() => (sortFilter.sortMenuOpen = !sortFilter.sortMenuOpen)}
						class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm tf-text-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors {sortFilter.sortMode !== 'position' ? 'tf-accent' : ''}"
						style="border: 1px solid var(--tf-border);"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>
						<span class="hidden sm:inline">{sortLabels[sortFilter.sortMode]}</span>
					</button>
					{#if sortFilter.sortMenuOpen}
						<div class="fixed inset-0 z-20" onclick={() => (sortFilter.sortMenuOpen = false)} role="presentation"></div>
						<div class="absolute left-0 top-full mt-1 z-30 w-48 rounded-xl p-1.5 shadow-lg tf-popover-bg border" style="border-color: var(--tf-border);">
							{#each Object.entries(sortLabels) as [key, label]}
								<button
									onclick={() => { sortFilter.sortMode = key as SortMode; sortFilter.sortMenuOpen = false; }}
									class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors {sortFilter.sortMode === key ? 'font-medium' : ''} hover:bg-black/5 dark:hover:bg-white/5"
									style={sortFilter.sortMode === key ? 'color: var(--tf-accent);' : ''}
								>
									{label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Bulk Mode Toggle -->
			<button
				onclick={() => { bulkMode = !bulkMode; if (!bulkMode) clearSelection(); }}
				class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors {bulkMode ? 'text-white' : 'tf-text-muted hover:bg-black/5 dark:hover:bg-white/5'}"
				style={bulkMode ? 'background: var(--tf-accent);' : `border: 1px solid var(--tf-border);`}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
				<span class="hidden sm:inline">{bulkMode ? 'Auswahl aktiv' : 'Auswählen'}</span>
			</button>
		</div>
	{/if}

	{#if store.lists.length === 0}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-20">
			<img src="/icons/icon-96x96.png" alt="TaskFuchs" class="w-16 h-16 mb-4 rounded-xl" />
			<h2 class="text-xl font-semibold mb-2 tf-text">Willkommen bei TaskFuchs!</h2>
			<p class="tf-text-secondary mb-6 text-center max-w-sm">
				Erstelle deine erste Liste, um loszulegen.
			</p>
			<button
				onclick={handleCreateList}
				class="flex items-center gap-2 px-6 py-3 text-white font-medium rounded-xl hover:shadow-lg active:scale-95 transition-all"
				style="background: var(--tf-accent-gradient);"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Erste Liste erstellen
			</button>
		</div>
	{:else}
		<!-- Mobile: Tab Navigation -->
		<div class="md:hidden mb-4 -mx-4 px-4 sticky top-[57px] z-20 pb-2 pt-2" style="background: var(--tf-header-bg); backdrop-filter: blur(12px); border-bottom: 1px solid var(--tf-border);">
			<div class="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
				{#each visibleLists as list, i (list.id)}
					<button
						onclick={() => (activeListIndex = i)}
						class="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap flex-shrink-0 transition-all"
						style={i === activeListIndex
							? 'background: var(--tf-accent); color: white;'
							: `color: var(--tf-text-secondary);`}
					>
						{list.icon} {list.title}
					</button>
				{/each}
				<button
					onclick={handleCreateList}
					class="px-2 py-1.5 rounded-lg text-sm flex-shrink-0 transition-colors tf-accent"
					aria-label="Neue Liste erstellen"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Mobile: Single List View -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="md:hidden" ontouchstart={handleSwipeStart} ontouchend={handleSwipeEnd}>
			{#if visibleLists[activeListIndex]}
				{#key activeListIndex}
					<div in:fade={{ duration: 150, delay: 50 }} out:fade={{ duration: 100 }}>
						<ListPanel
							list={visibleLists[activeListIndex]}
							tasks={sortFilter.filteredTasksForList(visibleLists[activeListIndex].id)}
							onRename={store.renameList}
							onDelete={store.deleteList}
							onIconChange={store.changeListIcon}
							onAddTask={store.addTask}
							onToggleTask={store.toggleTask}
							onUpdateTask={store.updateTask}
							onDeleteTask={store.deleteTask}
							onAddSubtask={store.addSubtask}
							onToggleSubtask={store.toggleSubtask}
							onUpdateSubtask={store.updateSubtask}
							onDeleteSubtask={store.deleteSubtask}
							onChangePriority={store.changeTaskPriority}
							onEmojiClick={popovers.openEmojiPicker}
							onChangeProgress={store.changeTaskProgress}
							onListContext={(e: MouseEvent) => ctxMenus.handleListContext(e, visibleLists[activeListIndex])}
							onTaskContext={ctxMenus.handleTaskContext}
							onNoteClick={popovers.openNotePopover}
							onReorderTask={sortFilter.handleReorderTask}
							onReorderSubtask={store.reorderSubtask}
							onShareClick={() => sharing.openShareDialog(visibleLists[activeListIndex])}
							onTaskClick={popovers.openFocusMode}
							{bulkMode}
							{selectedTaskIds}
							onBulkToggle={toggleBulkSelect}
							onSelectAll={selectAllInList}
							subtasksForceCollapsed={collapsedSubtasksListIds.has(visibleLists[activeListIndex].id)}
						/>
					</div>
				{/key}
			{/if}
		</div>

		<!-- Desktop: Side by Side -->
		<div class="hidden md:flex gap-0 overflow-x-auto pb-4">
			{#each visibleLists as list, listIdx (list.id)}
				{#if minimizedListIds.has(list.id)}
					<!-- Minimierte Liste: schmale Spalte mit Icon -->
					<div class="flex-shrink-0 flex flex-col items-center w-12 py-3 rounded-2xl border mx-0.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style="border-color: var(--tf-border); background: var(--tf-surface);">
						<button
							onclick={() => toggleMinimizeList(list.id)}
							class="flex flex-col items-center gap-2 w-full"
							title="{list.icon} {list.title} — Klick zum Maximieren"
						>
							<span class="text-lg">{list.icon}</span>
							<span class="text-[9px] font-medium tf-text-muted writing-mode-vertical" style="writing-mode: vertical-rl; text-orientation: mixed;">{list.title}</span>
							<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style="background: var(--tf-accent); color: white;">{sortFilter.filteredTasksForList(list.id).filter(t => !t.parent_id && t.type !== 'divider' && !t.done).length}</span>
						</button>
					</div>
				{:else}
					<div class="flex-shrink-0 flex flex-col" data-col={listIdx} style="width: {getColumnWidth(list.id)}px; min-width: 280px; max-width: 600px;">
						<ListPanel
							{list}
							tasks={sortFilter.filteredTasksForList(list.id)}
							onRename={store.renameList}
							onDelete={store.deleteList}
							onIconChange={store.changeListIcon}
							onAddTask={store.addTask}
							onToggleTask={store.toggleTask}
							onUpdateTask={store.updateTask}
							onDeleteTask={store.deleteTask}
							onAddSubtask={store.addSubtask}
							onToggleSubtask={store.toggleSubtask}
							onUpdateSubtask={store.updateSubtask}
							onDeleteSubtask={store.deleteSubtask}
							onChangePriority={store.changeTaskPriority}
							onEmojiClick={popovers.openEmojiPicker}
							onChangeProgress={store.changeTaskProgress}
							onListContext={(e: MouseEvent) => ctxMenus.handleListContext(e, list)}
							onTaskContext={ctxMenus.handleTaskContext}
							onNoteClick={popovers.openNotePopover}
							onReorderTask={sortFilter.handleReorderTask}
							onReorderSubtask={store.reorderSubtask}
							onReorderList={(listId: string, newPos: number) => store.reorderList(listId, newPos)}
							onShareClick={() => sharing.openShareDialog(list)}
							onTaskClick={popovers.openFocusMode}
							listIndex={listIdx}
							{bulkMode}
							{selectedTaskIds}
							onBulkToggle={toggleBulkSelect}
							onSelectAll={selectAllInList}
							onMinimize={() => toggleMinimizeList(list.id)}
							subtasksForceCollapsed={collapsedSubtasksListIds.has(list.id)}
						/>
					</div>
					<!-- Resize Handle -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="col-resize-handle"
						onmousedown={(e) => handleResizeStart(e, list.id)}
					></div>
				{/if}
			{/each}

			<!-- Add List Button (Desktop) -->
			<div class="w-[360px] min-w-[280px] flex-shrink-0 space-y-2">
				<button
					onclick={handleCreateList}
					class="w-full h-32 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center gap-2 cursor-pointer tf-text-muted hover:opacity-80"
					style="border-color: var(--tf-border);"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					<span class="font-medium">Neue Liste</span>
				</button>
				<button
					onclick={loadDemoData}
					disabled={seedingDemo}
					class="w-full py-2 rounded-xl text-xs tf-text-muted hover:opacity-80 transition-colors"
					style="border: 1px dashed var(--tf-border);"
				>
					{seedingDemo ? 'Lade Demo-Daten...' : '🦊 Demo-Daten laden'}
				</button>
			</div>
		</div>
	{/if}
</div>
