<script lang="ts">
	import { createTaskStore } from '$lib/stores/tasks.svelte';
	import { listsStore } from '$lib/stores/lists';
	import { hiddenListIds } from '$lib/stores/visibility';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { Database } from '$lib/types/database';

	import Pinboard from '$lib/components/v2/Pinboard.svelte';
	import ListPanel from '$lib/components/v2/ListPanel.svelte';
	import ToastContainer from '$lib/components/v2/ToastContainer.svelte';
	import ConfirmDialog from '$lib/components/v2/ConfirmDialog.svelte';
	import FocusOverlay from '$lib/components/v2/FocusOverlay.svelte';
	import SearchOverlay from '$lib/components/v2/SearchOverlay.svelte';
	import ContextMenu from '$lib/components/v2/ContextMenu.svelte';
	import type { MenuItem } from '$lib/components/v2/ContextMenu.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	let { data } = $props();

	const store = createTaskStore();

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

	// Visible lists
	let visibleLists = $derived(
		lists.filter((l: List) => !$hiddenListIds.has(l.id))
	);

	// Pinned tasks
	let pinnedTasks = $derived(
		tasks.filter((t: Task) => t.pinned && !t.done)
	);

	// Focus overlay state
	let focusTask = $state<Task | null>(null);
	let focusSubtasks = $derived(
		focusTask ? tasks.filter((t: Task) => t.parent_id === focusTask!.id).sort((a: Task, b: Task) => a.position - b.position) : []
	);

	// Search overlay
	let searchOpen = $state(false);

	// Context menu state
	let contextMenu = $state<{ items: MenuItem[]; x: number; y: number } | null>(null);

	// Track mobile/desktop
	onMount(() => {
		const mq = window.matchMedia('(max-width: 768px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
		mq.addEventListener('change', handler);

		// Subscribe to realtime
		store.subscribeRealtime();

		// Keyboard shortcuts
		function handleGlobalKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				searchOpen = !searchOpen;
			}
		}
		window.addEventListener('keydown', handleGlobalKeydown);

		return () => {
			mq.removeEventListener('change', handler);
			window.removeEventListener('keydown', handleGlobalKeydown);
			store.unsubscribeRealtime();
		};
	});

	// Bounds-check activeListIndex
	$effect(() => {
		if (activeListIndex >= visibleLists.length) {
			activeListIndex = Math.max(0, visibleLists.length - 1);
		}
	});

	// Handlers
	function handleQuickAdd(listId: string, text: string) {
		store.createTask(listId, text);
	}

	function handleToggleTask(id: string) {
		store.toggleDone(id);
	}

	function handleEditTask(id: string, text: string) {
		store.updateTaskText(id, text);
	}

	function handleContextMenu(e: MouseEvent, task: Task) {
		contextMenu = {
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: 'Bearbeiten', icon: '\u270F\uFE0F', action: () => { focusTask = task; } },
				{ label: 'Loeschen', icon: '\u{1F5D1}\uFE0F', danger: true, action: () => { store.deleteTask(task.id); } },
				{ divider: true, label: '' },
				{ label: 'Fixieren', icon: task.pinned ? '\u{1F4CC}' : '\u{1F4CD}', action: () => { store.togglePin(task.id); } },
			]
		};
	}

	function handleTaskDblClick(task: Task) {
		focusTask = task;
	}

	function handleSearchSelect(taskId: string) {
		const task = tasks.find((t: Task) => t.id === taskId);
		if (task) focusTask = task;
	}
</script>

<!-- Pinboard -->
<Pinboard
	{tasks}
	onTaskClick={(task) => { focusTask = task; }}
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
			{tasks}
			colIndex={i}
			isActive={!isMobile || i === activeListIndex}
			onQuickAdd={handleQuickAdd}
			onToggleTask={handleToggleTask}
			onEditTask={handleEditTask}
			onToggleSubtask={handleToggleTask}
			onEditSubtask={handleEditTask}
			onContextMenu={handleContextMenu}
			onTaskDblClick={handleTaskDblClick}
		/>
	{/each}
</div>

<!-- Empty state -->
{#if visibleLists.length === 0}
	<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center;">
		<div style="font-size: 2.5rem; margin-bottom: 16px;">&#x1F98A;</div>
		<h2 style="font-size: 1rem; font-weight: 700; color: var(--v2-text); margin-bottom: 8px;">Willkommen bei TaskFuchs v2</h2>
		<p style="font-size: .75rem; color: var(--v2-text-muted); max-width: 320px; line-height: 1.6;">
			Erstelle deine erste Liste um loszulegen.
		</p>
		<button
			onclick={() => store.createList()}
			style="margin-top: 16px; padding: 10px 20px; border: 1px dashed var(--v2-accent); border-radius: var(--v2-radius); background: var(--v2-accent-glow); color: var(--v2-accent); font-size: .75rem; font-weight: 600; cursor: pointer; font-family: var(--v2-font);"
		>
			+ Neue Liste
		</button>
	</div>
{/if}

<!-- Focus Overlay -->
{#if focusTask}
	<FocusOverlay
		task={focusTask}
		subtasks={focusSubtasks}
		onClose={() => { focusTask = null; }}
		onToggle={handleToggleTask}
		onUpdate={handleEditTask}
		onChangePriority={(id, p) => store.changePriority(id, p)}
		onUpdateNote={(id, note) => store.updateNote(id, note)}
		onUpdateEmoji={(id, emoji) => store.updateEmoji(id, emoji)}
		onToggleSubtask={handleToggleTask}
		onUpdateSubtask={handleEditTask}
		onAddSubtask={(parentId, text) => store.createSubtask(parentId, text)}
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
{#if contextMenu}
	<ContextMenu
		items={contextMenu.items}
		x={contextMenu.x}
		y={contextMenu.y}
		onclose={() => { contextMenu = null; }}
	/>
{/if}

<!-- Toast + Confirm -->
<ToastContainer />
<ConfirmDialog />
