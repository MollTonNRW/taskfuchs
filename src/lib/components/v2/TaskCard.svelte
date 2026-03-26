<script lang="ts">
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';
	import SubtaskCard from './SubtaskCard.svelte';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		task,
		subtasks = [],
		subtaskCount = 0,
		subtaskDoneCount = 0,
		allSubtasksDone = false,
		ontoggle,
		onedit,
		oncontextmenu,
		ondblclick,
		ontogglesubtask,
		oneditsubtask,
		ondragstart,
		ondragend,
		bulkMode = false,
		bulkSelected = false,
		onBulkToggle
	}: {
		task: Task;
		subtasks?: Task[];
		subtaskCount?: number;
		subtaskDoneCount?: number;
		allSubtasksDone?: boolean;
		ontoggle: (id: string) => void;
		onedit: (id: string, text: string) => void;
		oncontextmenu?: (e: MouseEvent, task: Task) => void;
		ondblclick?: (task: Task) => void;
		ontogglesubtask?: (id: string) => void;
		oneditsubtask?: (id: string, text: string) => void;
		ondragstart?: (e: DragEvent) => void;
		ondragend?: (e: DragEvent) => void;
		bulkMode?: boolean;
		bulkSelected?: boolean;
		onBulkToggle?: (id: string) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let editInput: HTMLInputElement | undefined = $state();
	let subtasksOpen = $state(false);

	function startEdit() {
		editText = task.text;
		editing = true;
		tick().then(() => editInput?.focus());
	}

	function saveEdit() {
		const trimmed = editText.trim();
		if (trimmed && trimmed !== task.text) {
			onedit(task.id, trimmed);
		}
		editing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
		if (e.key === 'Escape') { editing = false; }
	}

	function handleDblClick() {
		if (ondblclick) {
			ondblclick(task);
		} else {
			startEdit();
		}
	}

	function handleContext(e: MouseEvent) {
		e.preventDefault();
		oncontextmenu?.(e, task);
	}

	function toggleSubtasksOpen(e: MouseEvent) {
		e.stopPropagation();
		subtasksOpen = !subtasksOpen;
	}

	const priorityTagLabel: Record<string, string> = {
		low: 'LOW',
		normal: 'NORMAL',
		high: 'HIGH',
		asap: 'ASAP'
	};

	// Auto-calculate progress from subtasks (like v6), fallback to manual progress
	let progressPercent = $derived(
		subtaskCount > 0
			? Math.round((subtaskDoneCount / subtaskCount) * 100)
			: task.progress === 1 ? 33 : task.progress === 2 ? 66 : task.progress === 3 ? 100 : 0
	);

	// Auto-determine progress color class (blue < 50%, yellow 50-99%, green 100%)
	let progressColorClass = $derived(
		subtaskCount > 0
			? (progressPercent === 100 ? 'green' : progressPercent >= 50 ? 'yellow' : 'blue')
			: (task.progress === 3 ? 'green' : task.progress === 2 ? 'yellow' : 'blue')
	);

	let progressFull = $derived(progressPercent === 100);

	let hasProgress = $derived(subtaskCount > 0 || (task.progress != null && task.progress > 0));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="v2-glass-card v2-task-card"
	class:v2-highlighted={task.highlighted}
	class:v2-bulk-selected={bulkSelected}
	data-priority={task.priority}
	oncontextmenu={handleContext}
	ondblclick={handleDblClick}
	draggable={!editing ? 'true' : 'false'}
	ondragstart={ondragstart}
	ondragend={ondragend}
>
	<!-- Bulk Checkbox -->
	{#if bulkMode}
		<button
			class="v2-bulk-checkbox"
			class:checked={bulkSelected}
			onclick={(e) => { e.stopPropagation(); onBulkToggle?.(task.id); }}
			aria-label={bulkSelected ? 'Abwaehlen' : 'Auswaehlen'}
		>
			{bulkSelected ? '\u2713' : ''}
		</button>
	{/if}

	<!-- Emoji (before checkbox, like v6) -->
	{#if task.emoji}
		<span class="v2-task-emoji">{task.emoji}</span>
	{/if}

	<!-- Checkbox -->
	<button
		class="v2-checkbox"
		class:checked={task.done}
		class:invite={allSubtasksDone && subtaskCount > 0 && !task.done}
		onclick={() => ontoggle(task.id)}
		aria-label={task.done ? 'Aufgabe wieder oeffnen' : 'Aufgabe abhaken'}
	>
		{task.done ? '\u2713' : ''}
	</button>

	<!-- Task body (text + meta + progress + subtasks — all inside like v6) -->
	<div class="v2-task-body">
		<!-- Text / Inline Edit -->
		{#if editing}
			<input
				bind:this={editInput}
				bind:value={editText}
				class="v2-task-input"
				onblur={saveEdit}
				onkeydown={handleKeydown}
				maxlength="500"
			/>
		{:else}
			<span class="v2-task-text" class:done={task.done}>{task.text}</span>
		{/if}

		<!-- Meta row (tags) — order matches v6: prio, due, subtask-toggle, note -->
		<div class="v2-task-meta">
			{#if task.priority}
				<span class="v2-tag v2-tag-{task.priority}">{priorityTagLabel[task.priority] ?? task.priority}</span>
			{/if}
			{#if task.due_date}
				<span class="v2-tag v2-tag-due">&#x1F4C5; {task.due_date}</span>
			{/if}
			{#if subtaskCount > 0}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span class="v2-subtask-toggle" onclick={toggleSubtasksOpen}>[{subtaskDoneCount}/{subtaskCount}]</span>
			{/if}
			{#if task.note}
				<span class="v2-task-note-badge" title={task.note}>&#x1F4DD;</span>
			{/if}
		</div>

		<!-- Progress bar (under meta, inside body — auto from subtasks or manual) -->
		{#if hasProgress && progressPercent > 0}
			<div class="v2-task-progress-bar">
				<div
					class="v2-task-progress-fill {progressColorClass}"
					class:full={progressFull}
					style="width: {progressPercent}%;"
				></div>
			</div>
			{#if subtaskCount > 0}
				<div class="v2-progress-text">{subtaskDoneCount}/{subtaskCount}</div>
			{/if}
		{/if}

		<!-- Subtasks (inside task-body, collapsible, like v6) -->
		{#if subtasks.length > 0}
			<div class="v2-subtasks" class:collapsed={!subtasksOpen}>
				{#each subtasks as sub (sub.id)}
					<SubtaskCard
						subtask={sub}
						ontoggle={ontogglesubtask ?? (() => {})}
						onedit={oneditsubtask ?? (() => {})}
					/>
				{/each}
			</div>
		{/if}
	</div>

	<!-- 3-dot menu (visible on hover / always on mobile) -->
	<button
		class="v2-task-menu-btn"
		onclick={(e) => { e.stopPropagation(); oncontextmenu?.(e, task); }}
		aria-label="Menu"
	>&#x22EE;</button>
</div>
