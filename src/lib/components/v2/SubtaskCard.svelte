<script lang="ts">
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		subtask,
		ontoggle,
		onedit,
		ondragstart,
		ondragend
	}: {
		subtask: Task;
		ontoggle: (id: string) => void;
		onedit: (id: string, text: string) => void;
		ondragstart?: (e: DragEvent) => void;
		ondragend?: (e: DragEvent) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let editInput: HTMLInputElement | undefined = $state();

	function startEdit() {
		editText = subtask.text;
		editing = true;
		tick().then(() => editInput?.focus());
	}

	function saveEdit() {
		const trimmed = editText.trim();
		if (trimmed && trimmed !== subtask.text) {
			onedit(subtask.id, trimmed);
		}
		editing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
		if (e.key === 'Escape') { editing = false; }
	}

	const priorityColor: Record<string, string> = {
		low: 'var(--v2-green)',
		normal: 'var(--v2-yellow)',
		high: 'var(--v2-red)',
		asap: 'var(--v2-red)'
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="v2-glass-card"
	style="padding: 6px 10px; display: flex; align-items: center; gap: 8px; font-size: .72rem;"
	draggable="true"
	ondragstart={ondragstart}
	ondragend={ondragend}
	ondblclick={startEdit}
>
	<!-- D&D Handle -->
	<span style="cursor: grab; color: var(--v2-text-muted); font-size: .55rem; flex-shrink: 0;">::</span>

	<!-- Checkbox -->
	<button
		class="v2-checkbox"
		class:checked={subtask.done}
		onclick={() => ontoggle(subtask.id)}
		style="width: 15px; height: 15px; font-size: .5rem;"
		aria-label="Unteraufgabe abhaken"
	>
		{subtask.done ? '\u2713' : ''}
	</button>

	<!-- Text / Edit -->
	{#if editing}
		<input
			bind:this={editInput}
			bind:value={editText}
			class="v2-task-input"
			style="font-size: .72rem; padding: 2px 6px;"
			onblur={saveEdit}
			onkeydown={handleKeydown}
			maxlength="500"
		/>
	{:else}
		<span class="v2-task-text" class:done={subtask.done}>{subtask.text}</span>
	{/if}

	<!-- Priority Badge -->
	{#if subtask.priority !== 'normal'}
		<span
			class="v2-badge"
			style="color: {priorityColor[subtask.priority]}; border: 1px solid {priorityColor[subtask.priority]}; background: transparent;"
		>
			{subtask.priority === 'low' ? 'LOW' : subtask.priority === 'high' ? 'HIGH' : 'ASAP'}
		</span>
	{/if}
</div>
