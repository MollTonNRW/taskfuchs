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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="v2-subtask"
	class:done={subtask.done}
	ondblclick={startEdit}
	draggable={!editing ? 'true' : 'false'}
	{ondragstart}
	{ondragend}
>
	<!-- Mini checkbox (13x13, like v6) -->
	<button
		class="v2-mini-check"
		class:checked={subtask.done}
		onclick={() => ontoggle(subtask.id)}
		aria-label="Unteraufgabe abhaken"
	></button>

	<!-- Text / Edit -->
	{#if editing}
		<input
			bind:this={editInput}
			bind:value={editText}
			class="v2-task-input v2-subtask-input"
			onblur={saveEdit}
			onkeydown={handleKeydown}
			maxlength="500"
		/>
	{:else}
		<span class="v2-subtask-text">{subtask.text}</span>
	{/if}
</div>
