<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Priority } from '$lib/constants';

	type List = Database['public']['Tables']['lists']['Row'];

	let {
		selectedCount,
		lists = [],
		onToggleDone,
		onChangePriority,
		onDelete,
		onMoveToList,
		onCancel
	}: {
		selectedCount: number;
		lists?: List[];
		onToggleDone: (done: boolean) => void;
		onChangePriority: (p: Priority) => void;
		onDelete: () => void;
		onMoveToList: (listId: string) => void;
		onCancel: () => void;
	} = $props();

	let prioOpen = $state(false);
	let moveOpen = $state(false);
</script>

{#if selectedCount > 0}
	<div class="v2-bulk-toolbar">
		<span style="font-size: .65rem; color: var(--v2-text);">{selectedCount} ausgewaehlt</span>

		<button class="v2-bulk-btn" onclick={() => onToggleDone(true)} title="Erledigt">&#x2713;</button>

		<div style="position: relative;">
			<button class="v2-bulk-btn" onclick={() => { prioOpen = !prioOpen; moveOpen = false; }} title="Prioritaet">&#x2691;</button>
			{#if prioOpen}
				<div class="v2-context-menu" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px;">
					<button class="v2-context-menu-item" style="width: 100%;" onclick={() => { onChangePriority('low'); prioOpen = false; }}>Niedrig</button>
					<button class="v2-context-menu-item" style="width: 100%;" onclick={() => { onChangePriority('normal'); prioOpen = false; }}>Normal</button>
					<button class="v2-context-menu-item" style="width: 100%;" onclick={() => { onChangePriority('high'); prioOpen = false; }}>Hoch</button>
					<button class="v2-context-menu-item" style="width: 100%;" onclick={() => { onChangePriority('asap'); prioOpen = false; }}>ASAP!</button>
				</div>
			{/if}
		</div>

		{#if lists.length > 1}
			<div style="position: relative;">
				<button class="v2-bulk-btn" onclick={() => { moveOpen = !moveOpen; prioOpen = false; }} title="Verschieben">&#x21C4;</button>
				{#if moveOpen}
					<div class="v2-context-menu" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px;">
						{#each lists as l (l.id)}
							<button class="v2-context-menu-item" style="width: 100%;" onclick={() => { onMoveToList(l.id); moveOpen = false; }}>{l.icon} {l.title}</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<button class="v2-bulk-btn" style="color: var(--v2-red);" onclick={onDelete} title="Loeschen">&#x2715;</button>
		<button class="v2-bulk-btn" onclick={onCancel}>Abbrechen</button>
	</div>
{/if}
