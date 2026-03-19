<script lang="ts">
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		task,
		subtaskCount = 0,
		subtaskDoneCount = 0,
		allSubtasksDone = false,
		ontoggle,
		onedit,
		oncontextmenu,
		ondblclick,
		ondragstart,
		ondragend
	}: {
		task: Task;
		subtaskCount?: number;
		subtaskDoneCount?: number;
		allSubtasksDone?: boolean;
		ontoggle: (id: string) => void;
		onedit: (id: string, text: string) => void;
		oncontextmenu?: (e: MouseEvent, task: Task) => void;
		ondblclick?: (task: Task) => void;
		ondragstart?: (e: DragEvent) => void;
		ondragend?: (e: DragEvent) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let editInput: HTMLInputElement | undefined = $state();

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

	let progressPercent = $derived(
		task.progress === 1 ? 33 : task.progress === 2 ? 66 : task.progress === 3 ? 100 : 0
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="v2-glass-card v2-task-card"
	data-priority={task.priority}
	style={task.highlighted ? 'animation: v2-highlight-pulse 2s ease-in-out infinite;' : ''}
	oncontextmenu={handleContext}
	ondblclick={handleDblClick}
	draggable={!editing ? 'true' : 'false'}
	ondragstart={ondragstart}
	ondragend={ondragend}
>
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

	<!-- Emoji -->
	{#if task.emoji}
		<span style="font-size: .85rem;">{task.emoji}</span>
	{/if}

	<!-- Subtask counter -->
	{#if subtaskCount > 0}
		<span class="v2-subtask-counter">{subtaskDoneCount}/{subtaskCount}</span>
	{/if}

	<!-- Progress -->
	{#if task.progress && task.progress > 0}
		<div class="v2-progress" style="width: 40px;">
			<div
				class="v2-progress-fill"
				class:shimmer={task.progress === 3}
				data-level={task.progress}
				style="width: {progressPercent}%;"
			></div>
		</div>
	{/if}

	<!-- Note indicator -->
	{#if task.note}
		<span style="font-size: .6rem; color: var(--v2-text-muted);" title={task.note}>&#x1F4AC;</span>
	{/if}

	<!-- Due date -->
	{#if task.due_date}
		<span style="font-size: .55rem; color: var(--v2-accent); border: 1px dashed var(--v2-accent-dim); border-radius: 3px; padding: 1px 4px;">
			{task.due_date}
		</span>
	{/if}
</div>
