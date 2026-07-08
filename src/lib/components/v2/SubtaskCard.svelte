<script lang="ts">
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		subtask,
		ontoggle,
		onedit,
		oncontextmenu,
		ondragstart,
		ondragend
	}: {
		subtask: Task;
		ontoggle: (id: string) => void;
		onedit: (id: string, text: string) => void;
		oncontextmenu?: (e: MouseEvent, subtask: Task) => void;
		ondragstart?: (e: DragEvent) => void;
		ondragend?: (e: DragEvent) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let editInput: HTMLInputElement | undefined = $state();

	function startEdit(e: MouseEvent) {
		e.stopPropagation();
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

	// Natives Long-Press-Kontextmenü (Android) unterdrücken — Menü nur via ⋮/Rechtsklick
	let lastTouchTs = 0;
	function handleTouchStart() {
		lastTouchTs = Date.now();
	}

	function handleContext(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (Date.now() - lastTouchTs < 700) return;
		oncontextmenu?.(e, subtask);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class="v2-subtask"
	class:done={subtask.done}
	onclick={(e) => e.stopPropagation()}
	oncontextmenu={handleContext}
	ontouchstart={handleTouchStart}
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
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<span class="v2-subtask-text" onclick={startEdit}>{subtask.text}</span>
	{/if}

	{#if oncontextmenu}
		<button
			class="v2-subtask-menu-btn"
			onclick={(e) => { e.stopPropagation(); oncontextmenu?.(e, subtask); }}
			aria-label="Menü"
		>&#x22EE;</button>
	{/if}
</div>
