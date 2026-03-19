<script lang="ts">
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		tasks,
		onUnpin,
		onUnpinAll,
		onTaskClick
	}: {
		tasks: Task[];
		onUnpin?: (id: string) => void;
		onUnpinAll?: () => void;
		onTaskClick?: (task: Task) => void;
	} = $props();

	let collapsed = $state(false);

	let pinnedTasks = $derived(
		tasks.filter((t) => t.pinned && !t.done && t.type !== 'divider')
	);
</script>

{#if pinnedTasks.length > 0}
	<div style="margin-bottom: 16px;">
		<!-- Header -->
		<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span
				style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); cursor: pointer; user-select: none;"
				onclick={() => (collapsed = !collapsed)}
			>
				&#x1F4CC; Pinnwand
			</span>
			<span style="font-size: .5rem; color: var(--v2-text-muted);">({pinnedTasks.length})</span>
			{#if onUnpinAll}
				<button
					onclick={onUnpinAll}
					style="margin-left: auto; font-size: .5rem; color: var(--v2-text-muted); background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); padding: 2px 8px; cursor: pointer;"
				>
					Alle loesen
				</button>
			{/if}
		</div>

		{#if !collapsed}
			<div class="v2-pinboard">
				{#each pinnedTasks as task (task.id)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="v2-glass-card v2-pin-card"
						onclick={() => onTaskClick?.(task)}
						style="cursor: pointer;"
					>
						{#if task.emoji}
							<div class="emoji">{task.emoji}</div>
						{/if}
						<div class="text">{task.text}</div>
						{#if onUnpin}
							<button
								onclick={(e) => { e.stopPropagation(); onUnpin(task.id); }}
								style="position: absolute; top: 4px; right: 4px; font-size: .5rem; color: var(--v2-text-muted); background: none; border: none; cursor: pointer; padding: 2px;"
								title="Loesen"
							>
								&#x2715;
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
