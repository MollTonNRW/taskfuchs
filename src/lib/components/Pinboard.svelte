<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { Database } from '$lib/types/database';
	import { priorityColors, priorityLabels } from '$lib/constants';

	type Task = Database['public']['Tables']['tasks']['Row'];
	type List = Database['public']['Tables']['lists']['Row'];

	let {
		tasks,
		lists,
		onUnpin,
		onScrollToTask,
		onClearAll,
		onPin,
		onTaskClick
	}: {
		tasks: Task[];
		lists: List[];
		onUnpin: (id: string) => void;
		onScrollToTask: (id: string) => void;
		onClearAll?: () => void;
		onPin?: (id: string) => void;
		onTaskClick?: (id: string) => void;
	} = $props();

	let collapsed = $state(false);
	let dragOver = $state(false);

	let pinnedTasks = $derived(tasks.filter((t) => t.pinned && !t.done && t.type !== 'divider'));

	function getListTitle(listId: string): string {
		return lists.find((l) => l.id === listId)?.title ?? '';
	}

	// Long-Press für Focus Mode (700ms ohne Bewegung)
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressStartPos = { x: 0, y: 0 };

	function startLongPress(e: PointerEvent, taskId: string) {
		if (!onTaskClick) return;
		const target = e.target as HTMLElement;
		if (target.closest('button')) return;
		longPressStartPos = { x: e.clientX, y: e.clientY };
		cancelLongPress();
		longPressTimer = setTimeout(() => {
			longPressTimer = null;
			onTaskClick(taskId);
		}, 700);
	}

	function moveLongPress(e: PointerEvent) {
		if (!longPressTimer) return;
		const dx = e.clientX - longPressStartPos.x;
		const dy = e.clientY - longPressStartPos.y;
		if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelLongPress();
	}

	function cancelLongPress() {
		if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
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
			const data = JSON.parse(e.dataTransfer.getData('text/plain'));
			if (data.taskId && !data.fromPinboard) {
				// Only pin if not already pinned
				const task = tasks.find((t) => t.id === data.taskId);
				if (task && !task.pinned) {
					onPin(data.taskId);
				}
			}
		} catch { /* ignore invalid drag data */ }
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="max-w-7xl mx-auto px-5 pt-4"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<button
		onclick={() => (collapsed = !collapsed)}
		class="flex items-center gap-2 text-sm font-semibold tf-text-muted hover:opacity-80 transition-colors mb-2"
	>
		<svg
			class="w-4 h-4 transition-transform duration-300 {collapsed ? '-rotate-90' : ''}"
			fill="none" stroke="currentColor" viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
		</svg>
		Pinnwand
		<span class="text-xs font-normal tf-text-muted">({pinnedTasks.length})</span>
	</button>
	{#if pinnedTasks.length > 1 && onClearAll}
		<button
			onclick={onClearAll}
			class="text-[10px] font-medium px-2 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-red-400 hover:text-red-500 ml-2"
			title="Pinnwand leeren"
		>
			Alle lösen
		</button>
	{/if}

	{#if !collapsed}
		<div transition:slide={{ duration: 300 }}
			class="pinboard-area rounded-2xl border p-4 transition-all duration-300 {dragOver ? 'pinboard-drop-active' : ''}"
			style="background: var(--tf-surface); border-color: {dragOver ? 'var(--tf-accent, #f97316)' : 'var(--tf-border)'};"
		>
			{#if dragOver && pinnedTasks.length === 0}
				<p class="text-sm tf-text-muted italic py-4 text-center">
					Aufgabe hier ablegen zum Anpinnen
				</p>
			{:else if pinnedTasks.length === 0}
				<p class="text-sm tf-text-muted italic py-4 text-center">
					Aufgaben hier anpinnen per Rechtsklick, Pin-Icon oder Drag & Drop
				</p>
			{:else}
				<div class="flex gap-3 overflow-x-auto pb-1">
					{#each pinnedTasks as task (task.id)}
						{@const pColor = priorityColors[task.priority] ?? priorityColors.normal}
						{@const pLabel = priorityLabels[task.priority] ?? priorityLabels.normal}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="pin-card flex-shrink-0 w-56 rounded-xl border p-3.5 cursor-grab hover:shadow-md transition-all duration-200 active:cursor-grabbing"
							style="background: var(--tf-surface); border-color: var(--tf-border);"
							draggable="true"
							onpointerdown={(e) => startLongPress(e, task.id)}
							onpointermove={moveLongPress}
							onpointerup={cancelLongPress}
							onpointercancel={cancelLongPress}
							ondragstart={(e) => { cancelLongPress(); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: task.id, fromPinboard: true })); (e.currentTarget as HTMLElement).classList.add('pin-dragging'); }}}
							ondragend={(e) => { (e.currentTarget as HTMLElement).classList.remove('pin-dragging'); }}
							onclick={() => onScrollToTask(task.id)}
							role="button"
							tabindex="0"
							onkeydown={(e) => { if (e.key === 'Enter') onScrollToTask(task.id); }}
						>
							<div class="flex items-center justify-between mb-2">
								<span
									class="text-[10px] font-medium px-2 py-0.5 rounded-full"
									style="background: {pColor}20; color: {pColor};"
								>
									{pLabel}
								</span>
								<button
									onclick={(e) => { e.stopPropagation(); onUnpin(task.id); }}
									class="w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
									title="Von Pinnwand lösen"
								>
									<svg class="w-3.5 h-3.5 text-orange-500" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
									</svg>
								</button>
							</div>
							<div class="flex items-center gap-1.5 mb-1">
								{#if task.emoji}
									<span class="text-sm">{task.emoji}</span>
								{/if}
								<span class="text-sm font-medium tf-text truncate">{task.text}</span>
							</div>
							<span class="text-[10px] tf-text-muted">{getListTitle(task.list_id)}</span>
							{#if task.note}
								<p class="text-[10px] tf-text-secondary mt-1.5 line-clamp-2">{task.note}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{:else if dragOver}
		<!-- Show drop zone even when collapsed during drag -->
		<div
			class="pinboard-area rounded-2xl border-2 border-dashed p-4 transition-all duration-300 pinboard-drop-active"
			style="border-color: var(--tf-accent, #f97316);"
		>
			<p class="text-sm tf-text-muted italic py-2 text-center">
				Aufgabe hier ablegen zum Anpinnen
			</p>
		</div>
	{/if}
</div>
