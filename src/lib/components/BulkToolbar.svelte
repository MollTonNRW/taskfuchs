<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Priority } from '$lib/constants';

	type List = Database['public']['Tables']['lists']['Row'];

	let {
		active,
		selectedCount,
		lists,
		onToggleDone,
		onChangePriority,
		onDelete,
		onMoveToList,
		onCancel
	}: {
		active: boolean;
		selectedCount: number;
		lists: List[];
		onToggleDone: (done: boolean) => void;
		onChangePriority: (p: Priority) => void;
		onDelete: () => void;
		onMoveToList: (listId: string) => void;
		onCancel: () => void;
	} = $props();

	let bulkPrioOpen = $state(false);
	let bulkMoveOpen = $state(false);
</script>

{#if active && selectedCount > 0}
	<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border tf-surface" style="border-color: var(--tf-border);">
		<span class="text-sm font-medium tf-text">{selectedCount} ausgewählt</span>
		<div class="w-px h-5" style="background: var(--tf-border);"></div>
		<button onclick={() => onToggleDone(true)} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 transition-colors" title="Erledigt markieren">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
		</button>
		<div class="relative">
			<button onclick={() => { bulkPrioOpen = !bulkPrioOpen; bulkMoveOpen = false; }} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 transition-colors" title="Priorität ändern">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/></svg>
			</button>
			{#if bulkPrioOpen}
				<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col gap-1 p-2 rounded-xl shadow-lg tf-surface border" style="border-color: var(--tf-border);">
					<button onclick={() => { onChangePriority('low'); bulkPrioOpen = false; }} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">Niedrig</button>
					<button onclick={() => { onChangePriority('normal'); bulkPrioOpen = false; }} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">Normal</button>
					<button onclick={() => { onChangePriority('high'); bulkPrioOpen = false; }} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">Hoch</button>
					<button onclick={() => { onChangePriority('asap'); bulkPrioOpen = false; }} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">ASAP!</button>
				</div>
			{/if}
		</div>
		{#if lists.length > 1}
			<div class="relative">
				<button onclick={() => { bulkMoveOpen = !bulkMoveOpen; bulkPrioOpen = false; }} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 transition-colors" title="Verschieben">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
				</button>
				{#if bulkMoveOpen}
					<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col gap-1 p-2 rounded-xl shadow-lg tf-surface border" style="border-color: var(--tf-border);">
						{#each lists as l (l.id)}
							<button onclick={() => { onMoveToList(l.id); bulkMoveOpen = false; }} class="text-xs px-3 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 tf-text whitespace-nowrap">{l.icon} {l.title}</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
		<button onclick={onDelete} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors" title="Löschen">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
		</button>
		<div class="w-px h-5" style="background: var(--tf-border);"></div>
		<button onclick={onCancel} class="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/10 tf-text-muted transition-colors">
			Abbrechen
		</button>
	</div>
{/if}
