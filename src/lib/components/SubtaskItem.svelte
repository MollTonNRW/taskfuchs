<script lang="ts">
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		subtask,
		onToggle,
		onUpdate,
		onDelete
	}: {
		subtask: Task;
		onToggle: (id: string, done: boolean) => void;
		onUpdate: (id: string, text: string) => void;
		onDelete: (id: string) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');

	function startEdit() {
		editText = subtask.text;
		editing = true;
	}

	function saveEdit() {
		const trimmed = editText.trim();
		if (trimmed && trimmed !== subtask.text) {
			onUpdate(subtask.id, trimmed);
		}
		editing = false;
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveEdit();
		}
		if (e.key === 'Escape') {
			editing = false;
		}
	}
</script>

<div class="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-base-200/50 group transition-colors">
	<input
		type="checkbox"
		class="checkbox checkbox-xs checkbox-primary"
		checked={subtask.done}
		onchange={() => onToggle(subtask.id, !subtask.done)}
	/>

	{#if editing}
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="text"
			bind:value={editText}
			onblur={saveEdit}
			onkeydown={handleEditKeydown}
			class="input input-xs input-ghost flex-1 px-1"
			autofocus
		/>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="text-sm flex-1 cursor-default {subtask.done ? 'line-through text-base-content/40' : ''}"
			ondblclick={startEdit}
		>
			{subtask.text}
		</span>
	{/if}

	<button
		onclick={() => onDelete(subtask.id)}
		class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-error transition-opacity"
		aria-label="Unteraufgabe loeschen"
	>
		<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
		</svg>
	</button>
</div>
