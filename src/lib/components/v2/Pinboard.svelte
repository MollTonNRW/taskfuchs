<script lang="ts">
	import type { Database } from '$lib/types/database';

	type Task = Database['public']['Tables']['tasks']['Row'];
	type List = Database['public']['Tables']['lists']['Row'];

	let {
		tasks,
		lists = [],
		onUnpin,
		onUnpinAll,
		onTaskClick,
		onPin
	}: {
		tasks: Task[];
		lists?: List[];
		onUnpin?: (id: string) => void;
		onUnpinAll?: () => void;
		onTaskClick?: (task: Task) => void;
		onPin?: (id: string) => void;
	} = $props();

	let collapsed = $state(false);
	let dragOver = $state(false);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (!e.dataTransfer || !onPin) return;
		try {
			const raw = e.dataTransfer.getData('text/plain');
			const data = JSON.parse(raw);
			if (data.taskId) {
				onPin(data.taskId);
			}
		} catch {
			// ignore invalid drag data
		}
	}

	let pinnedTasks = $derived(
		tasks.filter((t) => t.pinned && !t.done && t.type !== 'divider')
	);

	function getListName(listId: string | null): string {
		if (!listId || lists.length === 0) return '';
		const list = lists.find((l) => l.id === listId);
		return list ? list.title : '';
	}

	function getPriorityColor(priority: string | null): string {
		switch (priority) {
			case 'low': return 'var(--v2-green)';
			case 'normal': return 'var(--v2-yellow)';
			case 'high': return 'var(--v2-red)';
			case 'asap': return 'var(--v2-red)';
			default: return 'var(--v2-border)';
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="pinboard"
	class:collapsed
	class:drag-over={dragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<!-- Header -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="pinboard-header" onclick={() => (collapsed = !collapsed)}>
		<span class="pin-icon">&#x1F4CC;</span>
		<span>Pinboard</span>
		{#if pinnedTasks.length > 0}
			<span class="pin-count">{pinnedTasks.length}</span>
		{/if}
		{#if onUnpinAll && pinnedTasks.length > 0}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span
				class="pin-clear"
				role="button"
				tabindex="0"
				onclick={(e) => { e.stopPropagation(); onUnpinAll?.(); }}
				onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onUnpinAll?.(); } }}
			>
				Alle loesen
			</span>
		{/if}
	</div>

	{#if !collapsed}
		{#if pinnedTasks.length > 0}
			<div class="pinboard-cards">
				{#each pinnedTasks as task (task.id)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="pin-card v2-glass-card"
						style="--pin-prio-color: {getPriorityColor(task.priority)};"
						onclick={() => onTaskClick?.(task)}
					>
						<div class="pin-card-top">
							{#if task.emoji}
								<span class="pin-card-emoji">{task.emoji}</span>
							{/if}
							{#if onUnpin}
								<span
									class="pin-card-unpin"
									role="button"
									tabindex="0"
									onclick={(e) => { e.stopPropagation(); onUnpin?.(task.id); }}
									onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onUnpin?.(task.id); } }}
									title="Loesen"
								>&#x2715;</span>
							{/if}
						</div>
						<div class="pin-card-text">{task.text}</div>
						{#if getListName(task.list_id)}
							<div class="pin-card-list">{getListName(task.list_id)}</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div class="pinboard-empty">Keine angepinnten Aufgaben</div>
		{/if}
	{/if}
</div>

<style>
	.pinboard {
		padding: 12px 24px;
		border-bottom: 1px dashed var(--v2-border);
		background: var(--v2-surface);
		transition: border 0.15s ease, background 0.15s ease;
	}

	.pinboard.drag-over {
		border: 2px dashed var(--v2-accent);
		background: var(--v2-accent-glow);
	}

	.pinboard-header {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-size: .65rem;
		color: var(--v2-text-muted);
		margin-bottom: 8px;
		user-select: none;
		text-transform: uppercase;
		letter-spacing: 2px;
	}

	.pin-icon {
		font-size: .8rem;
	}

	.pin-count {
		font-size: .5rem;
		background: var(--v2-accent-glow);
		color: var(--v2-accent);
		padding: 1px 6px;
		border-radius: 8px;
		font-weight: 600;
	}

	.pin-clear {
		margin-left: auto;
		font-size: .55rem;
		color: var(--v2-accent);
		cursor: pointer;
		border: 1px dashed var(--v2-accent-dim);
		padding: 2px 8px;
		border-radius: var(--v2-radius);
		transition: all var(--v2-transition);
	}

	.pin-clear:hover {
		background: var(--v2-accent-dim);
		color: #fff;
	}

	.pinboard-cards {
		display: flex;
		gap: 10px;
		overflow-x: auto;
		padding-bottom: 4px;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.pinboard-cards::-webkit-scrollbar {
		display: none;
	}

	.pin-card {
		min-width: 224px;
		max-width: 224px;
		padding: 10px 12px;
		cursor: pointer;
		flex-shrink: 0;
		position: relative;
		animation: pinBounceIn .4s var(--v2-bounce);
	}

	.pin-card:hover {
		border-color: var(--v2-accent-dim);
		box-shadow: 0 0 12px var(--v2-accent-glow);
	}

	.pin-card::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--pin-prio-color, var(--v2-border));
		border-radius: 3px 0 0 3px;
	}

	@keyframes pinBounceIn {
		0% { opacity: 0; transform: scale(.9) translateY(-8px); }
		60% { transform: scale(1.03) translateY(2px); }
		100% { opacity: 1; transform: scale(1) translateY(0); }
	}

	.pin-card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.pin-card-emoji {
		font-size: 1rem;
	}

	.pin-card-unpin {
		font-size: .6rem;
		color: var(--v2-text-muted);
		cursor: pointer;
		padding: 2px;
		border-radius: 3px;
		transition: all var(--v2-transition);
		margin-left: auto;
	}

	.pin-card-unpin:hover {
		color: var(--v2-red);
		background: rgba(247,118,142,.1);
	}

	.pin-card-text {
		font-size: .68rem;
		line-height: 1.3;
		color: var(--v2-text);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.pin-card-list {
		font-size: .48rem;
		color: var(--v2-text-muted);
		margin-top: 4px;
	}

	.pinboard.collapsed .pinboard-cards {
		display: none;
	}

	.pinboard-empty {
		font-size: .6rem;
		color: var(--v2-text-muted);
		font-style: italic;
		padding: 8px 0 4px;
		letter-spacing: .5px;
	}
</style>
