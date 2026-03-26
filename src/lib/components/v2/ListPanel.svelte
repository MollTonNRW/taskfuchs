<script lang="ts">
	import type { Database } from '$lib/types/database';
	import TaskCard from './TaskCard.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		list,
		tasks,
		colIndex = 0,
		isActive = true,
		onQuickAdd,
		onToggleTask,
		onEditTask,
		onToggleSubtask,
		onEditSubtask,
		onContextMenu,
		onTaskDblClick,
		onListMenuClick,
		onReorderTask,
		bulkMode = false,
		bulkSelectedIds = new Set<string>(),
		onBulkToggle
	}: {
		list: List;
		tasks: Task[];
		colIndex?: number;
		isActive?: boolean;
		onQuickAdd: (listId: string, text: string) => void;
		onToggleTask: (id: string) => void;
		onEditTask: (id: string, text: string) => void;
		onToggleSubtask: (id: string) => void;
		onEditSubtask: (id: string, text: string) => void;
		onContextMenu?: (e: MouseEvent, task: Task) => void;
		onTaskDblClick?: (task: Task) => void;
		onListMenuClick?: (listId: string) => void;
		onReorderTask?: (taskId: string, targetListId: string, newPosition: number) => void;
		bulkMode?: boolean;
		bulkSelectedIds?: Set<string>;
		onBulkToggle?: (id: string) => void;
	} = $props();

	let quickAddText = $state('');
	let doneCollapsed = $state(false);

	// ---- Drag & Drop state ----
	let dragOverIdx: number | null = $state(null);
	let draggingTaskId: string | null = $state(null);

	// Top-level items (tasks + dividers, not done) in position order
	let allTopLevel = $derived(
		tasks.filter((t: Task) => t.list_id === list.id && !t.parent_id && !t.done)
			.sort((a: Task, b: Task) => a.position - b.position)
	);

	// Active tasks count (excluding dividers)
	let activeTaskCount = $derived(
		allTopLevel.filter((t: Task) => t.type !== 'divider').length
	);

	// Done tasks
	let doneTasks = $derived(
		tasks.filter((t: Task) => t.list_id === list.id && !t.parent_id && t.done)
			.sort((a: Task, b: Task) => a.position - b.position)
	);

	// Subtasks for a given task
	function subtasksFor(taskId: string): Task[] {
		return tasks.filter((t: Task) => t.parent_id === taskId).sort((a: Task, b: Task) => a.position - b.position);
	}

	function handleQuickAdd() {
		const text = quickAddText.trim();
		if (!text) return;
		quickAddText = '';
		onQuickAdd(list.id, text);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleQuickAdd();
	}

	// ---- Drag & Drop handlers ----
	function handleTaskDragStart(e: DragEvent, task: Task) {
		if (!e.dataTransfer) return;
		draggingTaskId = task.id;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: task.id, sourceListId: list.id }));
		// Fade the dragged element after paint
		const el = e.currentTarget as HTMLElement;
		requestAnimationFrame(() => { el.style.opacity = '0.4'; });
	}

	function handleTaskDragEnd(e: DragEvent) {
		draggingTaskId = null;
		dragOverIdx = null;
		const el = e.currentTarget as HTMLElement;
		el.style.opacity = '';
	}

	function handleTaskDragOver(e: DragEvent, idx: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		// Above/below midpoint determines insert position
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const isBelow = e.clientY > rect.top + rect.height / 2;
		dragOverIdx = isBelow ? idx + 1 : idx;
	}

	function handleTaskDrop(e: DragEvent, idx: number) {
		e.preventDefault();
		if (!e.dataTransfer || !onReorderTask) return;
		const dropIdx = dragOverIdx ?? idx;
		dragOverIdx = null;
		draggingTaskId = null;
		try {
			const data = JSON.parse(e.dataTransfer.getData('text/plain'));
			if (data.taskId) {
				onReorderTask(data.taskId, list.id, dropIdx);
			}
		} catch { /* ignore invalid drag data */ }
	}

	function handleBottomDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverIdx = allTopLevel.length;
	}

	function handleBottomDrop(e: DragEvent) {
		e.preventDefault();
		if (!e.dataTransfer || !onReorderTask) return;
		dragOverIdx = null;
		draggingTaskId = null;
		try {
			const data = JSON.parse(e.dataTransfer.getData('text/plain'));
			if (data.taskId) {
				onReorderTask(data.taskId, list.id, allTopLevel.length);
			}
		} catch { /* ignore */ }
	}
</script>

<div
	class="v2-list-panel"
	class:active={isActive}
	data-col={colIndex % 5}
>
	<!-- Quick Add -->
	<div class="v2-add-task-row">
		<input type="text" placeholder="> neue aufgabe..." bind:value={quickAddText} onkeydown={handleKeydown} maxlength="500" />
		<button class="v2-add-task-btn" onclick={handleQuickAdd}>+ add</button>
	</div>

	<!-- Section Title (v6-style with box-drawing prefix) -->
	<div class="v2-section-title">&#x250C;&#x2500; offen ({activeTaskCount})</div>

	<!-- Active Tasks (including dividers, in position order) -->
	<div class="v2-task-list">
		{#each allTopLevel as task, idx (task.id)}
			{#if task.type === 'divider'}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="v2-task-divider"
					ondragover={(e) => handleTaskDragOver(e, idx)}
					ondrop={(e) => handleTaskDrop(e, idx)}
				>
					<div class="v2-task-divider-line"></div>
					<span class="v2-task-divider-label">{task.text}</span>
					<div class="v2-task-divider-line"></div>
				</div>
			{:else}
				{@const subs = subtasksFor(task.id)}
				{@const subsDone = subs.filter((s) => s.done).length}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="v2-task-drop-wrapper"
					class:drag-over-above={dragOverIdx === idx}
					class:drag-over-below={dragOverIdx === idx + 1}
					ondragover={(e) => handleTaskDragOver(e, idx)}
					ondrop={(e) => handleTaskDrop(e, idx)}
				>
					<TaskCard
						{task}
						subtasks={subs}
						subtaskCount={subs.length}
						subtaskDoneCount={subsDone}
						allSubtasksDone={subs.length > 0 && subsDone === subs.length}
						ontoggle={onToggleTask}
						onedit={onEditTask}
						ontogglesubtask={onToggleSubtask}
						oneditsubtask={onEditSubtask}
						oncontextmenu={onContextMenu}
						ondblclick={onTaskDblClick}
						ondragstart={(e) => handleTaskDragStart(e, task)}
						ondragend={handleTaskDragEnd}
						{bulkMode}
						bulkSelected={bulkSelectedIds.has(task.id)}
						{onBulkToggle}
					/>
				</div>
			{/if}
		{/each}

		<!-- Bottom drop zone (drop at end of list) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="v2-bottom-drop-zone"
			class:drag-active={dragOverIdx === allTopLevel.length}
			ondragover={handleBottomDragOver}
			ondragleave={() => { if (dragOverIdx === allTopLevel.length) dragOverIdx = null; }}
			ondrop={handleBottomDrop}
		></div>
	</div>

	<!-- Done Section -->
	{#if doneTasks.length > 0}
		<button class="v2-section-title v2-done-toggle" onclick={() => (doneCollapsed = !doneCollapsed)}>
			&#x250C;&#x2500; erledigt ({doneTasks.length})
			<span class="v2-done-toggle-icon" class:collapsed={doneCollapsed}>&#x25BC;</span>
		</button>

		{#if !doneCollapsed}
			<div class="v2-done-section">
				{#each doneTasks as task (task.id)}
					<TaskCard
						{task}
						ontoggle={onToggleTask}
						onedit={onEditTask}
						oncontextmenu={onContextMenu}
						ondblclick={onTaskDblClick}
						{bulkMode}
						bulkSelected={bulkSelectedIds.has(task.id)}
						{onBulkToggle}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.v2-task-drop-wrapper {
		position: relative;
		transition: transform 0.15s ease;
	}
	.v2-task-drop-wrapper.drag-over-above::before {
		content: '';
		position: absolute;
		top: -2px;
		left: 0;
		right: 0;
		height: 3px;
		background: var(--v2-accent, #f7a072);
		border-radius: 2px;
		z-index: 5;
	}
	.v2-task-drop-wrapper.drag-over-below::after {
		content: '';
		position: absolute;
		bottom: -2px;
		left: 0;
		right: 0;
		height: 3px;
		background: var(--v2-accent, #f7a072);
		border-radius: 2px;
		z-index: 5;
	}
	.v2-bottom-drop-zone {
		min-height: 24px;
		border-radius: 0 0 var(--v2-radius, 6px) var(--v2-radius, 6px);
		transition: all 0.15s ease;
	}
	.v2-bottom-drop-zone.drag-active {
		min-height: 40px;
		border-top: 3px solid var(--v2-accent, #f7a072);
		background: rgba(247, 160, 114, 0.05);
	}
</style>
