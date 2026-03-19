<script lang="ts">
	import type { Database } from '$lib/types/database';
	import TaskCard from './TaskCard.svelte';
	import SubtaskCard from './SubtaskCard.svelte';

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
		onListMenuClick
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
	} = $props();

	let quickAddText = $state('');
	let doneCollapsed = $state(false);

	// Top-level tasks (no parent, not dividers, not done)
	let activeTasks = $derived(
		tasks.filter((t: Task) => t.list_id === list.id && !t.parent_id && !t.done && t.type !== 'divider')
			.sort((a: Task, b: Task) => a.position - b.position)
	);

	// Dividers
	let allTopLevel = $derived(
		tasks.filter((t: Task) => t.list_id === list.id && !t.parent_id && !t.done)
			.sort((a: Task, b: Task) => a.position - b.position)
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
</script>

<div
	class="v2-list-panel"
	class:active={isActive}
	data-col={colIndex % 5}
>
	<!-- List Header -->
	<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
		<span style="font-size: 1.1rem;">{list.icon}</span>
		<h2 style="font-size: .85rem; font-weight: 700; color: var(--v2-text); flex: 1;">{list.title}</h2>
		<span style="font-size: .55rem; color: var(--v2-text-muted);">
			{activeTasks.length} offen
		</span>
		<button
			onclick={() => onListMenuClick?.(list.id)}
			style="background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); color: var(--v2-text-muted); font-size: .6rem; padding: 3px 8px; cursor: pointer;"
			title="Kontextmenu"
		>
			&#x22EF;
		</button>
	</div>

	<!-- Quick Add -->
	<div class="v2-quick-add">
		<input
			type="text"
			placeholder="+ Neue Aufgabe..."
			bind:value={quickAddText}
			onkeydown={handleKeydown}
			maxlength="500"
		/>
	</div>

	<!-- Active Tasks (including dividers, in position order) -->
	<div style="display: flex; flex-direction: column; gap: 6px;">
		{#each allTopLevel as task (task.id)}
			{#if task.type === 'divider'}
				<!-- Divider -->
				<div style="display: flex; align-items: center; gap: 8px; padding: 6px 0;">
					<div style="flex: 1; height: 1px; background: var(--v2-border);"></div>
					<span style="font-size: .6rem; color: var(--v2-text-muted); text-transform: uppercase; letter-spacing: 1px;">{task.text}</span>
					<div style="flex: 1; height: 1px; background: var(--v2-border);"></div>
				</div>
			{:else}
				{@const subs = subtasksFor(task.id)}
				{@const subsDone = subs.filter((s) => s.done).length}
				<TaskCard
					{task}
					subtaskCount={subs.length}
					subtaskDoneCount={subsDone}
					allSubtasksDone={subs.length > 0 && subsDone === subs.length}
					ontoggle={onToggleTask}
					onedit={onEditTask}
					oncontextmenu={onContextMenu}
					ondblclick={onTaskDblClick}
				/>

				<!-- Subtasks -->
				{#if subs.length > 0}
					<div style="margin-left: 28px; display: flex; flex-direction: column; gap: 4px;">
						{#each subs as sub (sub.id)}
							<SubtaskCard
								subtask={sub}
								ontoggle={onToggleSubtask}
								onedit={onEditSubtask}
							/>
						{/each}
					</div>
				{/if}
			{/if}
		{/each}
	</div>

	<!-- Done Section -->
	{#if doneTasks.length > 0}
		<button class="v2-done-separator" onclick={() => (doneCollapsed = !doneCollapsed)}>
			<div class="line"></div>
			<span class="label">Erledigt ({doneTasks.length})</span>
			<span class="toggle" class:collapsed={doneCollapsed}>&#x25BC;</span>
			<div class="line"></div>
		</button>

		{#if !doneCollapsed}
			<div style="display: flex; flex-direction: column; gap: 4px; opacity: .6;">
				{#each doneTasks as task (task.id)}
					<TaskCard
						{task}
						ontoggle={onToggleTask}
						onedit={onEditTask}
						oncontextmenu={onContextMenu}
						ondblclick={onTaskDblClick}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>
