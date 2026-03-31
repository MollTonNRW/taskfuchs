<script lang="ts">
	import { onMount } from 'svelte';
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];
	type List = Database['public']['Tables']['lists']['Row'];

	let {
		tasks,
		lists,
		onSelect,
		onClose
	}: {
		tasks: Task[];
		lists: List[];
		onSelect: (taskId: string) => void;
		onClose: () => void;
	} = $props();

	let query = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	let results = $derived(
		query.trim().length >= 2
			? tasks.filter((t) => {
					const q = query.toLowerCase();
					return (
						t.text.toLowerCase().includes(q) ||
						(t.note && t.note.toLowerCase().includes(q))
					);
				}).slice(0, 20)
			: []
	);

	function getListIcon(listId: string): string {
		return lists.find((l) => l.id === listId)?.icon ?? '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
		}
	}

	onMount(() => {
		inputEl?.focus();
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Overlay -->
<div class="v2-search-overlay">
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div style="position: fixed; inset: 0; z-index: -1;" onclick={onClose}></div>

	<!-- Search Box -->
	<div class="v2-search-box">
		<input
			bind:this={inputEl}
			bind:value={query}
			class="v2-search-input"
			placeholder="Aufgaben suchen..."
		/>

		{#if results.length > 0}
			<div style="margin-top: 12px; display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto;">
				{#each results as result (result.id)}
					<button
						class="v2-search-result"
						onclick={() => { onSelect(result.id); onClose(); }}
					>
						<span style="font-size: .6rem; background: var(--v2-bg); padding: 1px 6px; border-radius: 4px;">{getListIcon(result.list_id)}</span>
						<span class:done={result.done} style={result.done ? 'text-decoration: line-through; color: var(--v2-text-muted);' : ''}>
							{result.text}
						</span>
					</button>
				{/each}
			</div>
		{:else if query.trim().length >= 2}
			<div style="padding: 24px; text-align: center;">
				<span style="font-size: .72rem; color: var(--v2-text-muted);">Keine Ergebnisse</span>
			</div>
		{:else}
			<div style="padding: 16px; text-align: center;">
				<span style="font-size: .6rem; color: var(--v2-text-muted);">Mindestens 2 Zeichen eingeben</span>
			</div>
		{/if}

		<div style="display: flex; justify-content: flex-end; margin-top: 8px;">
			<span style="font-size: .5rem; color: var(--v2-text-muted); background: var(--v2-bg); padding: 2px 8px; border-radius: 4px;">ESC</span>
		</div>
	</div>
</div>
