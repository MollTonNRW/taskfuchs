<script lang="ts">
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];
	type List = Database['public']['Tables']['lists']['Row'];

	let {
		open,
		query,
		results,
		lists,
		onClose,
		onSelect,
		onQueryChange
	}: {
		open: boolean;
		query: string;
		results: Task[];
		lists: List[];
		onClose: () => void;
		onSelect: (taskId: string) => void;
		onQueryChange: (query: string) => void;
	} = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
		<div class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick={onClose} role="presentation"></div>
		<div class="relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl tf-surface border" style="border-color: var(--tf-border);">
			<div class="flex items-center gap-3 px-4 py-3" style="border-bottom: 1px solid var(--tf-border);">
				<svg class="w-5 h-5 tf-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					value={query}
					oninput={(e) => onQueryChange(e.currentTarget.value)}
					placeholder="Aufgaben suchen..."
					class="flex-1 bg-transparent text-sm tf-text outline-none"
					autofocus
				/>
				<kbd class="text-[10px] font-medium px-1.5 py-0.5 rounded tf-text-muted" style="background: var(--tf-surface-hover);">ESC</kbd>
			</div>
			{#if results.length > 0}
				<div class="max-h-80 overflow-y-auto p-2 space-y-0.5">
					{#each results.slice(0, 20) as result (result.id)}
						{@const resultList = lists.find((l) => l.id === result.list_id)}
						<button
							onclick={() => { onClose(); onSelect(result.id); }}
							class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
						>
							<div class="flex items-center gap-2">
								<span class="text-[10px] font-medium px-1.5 py-0.5 rounded-md" style="background: var(--tf-surface-hover);">{resultList?.icon ?? ''}</span>
								<span class="text-sm font-medium tf-text {result.done ? 'line-through opacity-40' : ''}">{result.text}</span>
							</div>
							{#if result.note}
								<p class="text-xs tf-text-muted mt-0.5 ml-7 truncate">{result.note}</p>
							{/if}
						</button>
					{/each}
				</div>
			{:else if query.trim().length >= 2}
				<div class="p-6 text-center">
					<span class="text-2xl mb-2 block">🔍</span>
					<span class="text-sm tf-text-muted">Keine Ergebnisse für "{query}"</span>
				</div>
			{:else}
				<div class="p-6 text-center">
					<span class="text-xs tf-text-muted">Mindestens 2 Zeichen eingeben</span>
				</div>
			{/if}
		</div>
	</div>
{/if}
