<script lang="ts">
	import { slide } from 'svelte/transition';
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';
	import { touchDragHandle, touchDropZone } from '$lib/actions/touchDrag';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		subtask,
		allTasks = [],
		depth = 1,
		onToggle,
		onUpdate,
		onDelete,
		onAddSubtask,
		onReorderSubtask
	}: {
		subtask: Task;
		allTasks: Task[];
		depth?: number;
		onToggle: (id: string, done: boolean) => void;
		onUpdate: (id: string, text: string) => void;
		onDelete: (id: string) => void;
		onAddSubtask?: (parentId: string, text: string) => void;
		onReorderSubtask?: (subtaskId: string, targetParentId: string, newPosition: number) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let childrenOpen = $state(true);
	let addingChild = $state(false);
	let newChildText = $state('');
	let childrenContainer: HTMLDivElement | undefined = $state();

	let dragOverThis = $state(false);
	let dragOverPosition = $state<'above' | 'below'>('below');

	let children = $derived(allTasks.filter((t) => t.parent_id === subtask.id));
	let childrenDone = $derived(children.filter((c) => c.done).length);
	let canNest = $derived(depth < 2 && !!onAddSubtask);

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
		if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
		if (e.key === 'Escape') { editing = false; }
	}

	async function handleAddChild() {
		const trimmed = newChildText.trim();
		if (!trimmed || !onAddSubtask) return;
		onAddSubtask(subtask.id, trimmed);
		newChildText = '';
		addingChild = false;
		await tick();
		if (childrenContainer) {
			const lastChild = childrenContainer.querySelector('.subtask-item:last-of-type');
			lastChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	function handleChildKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); handleAddChild(); }
		if (e.key === 'Escape') { addingChild = false; newChildText = ''; }
	}

	// Subtask Drag & Drop
	function handleSubtaskDragStart(e: DragEvent) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-subtask', JSON.stringify({
			subtaskId: subtask.id,
			sourceParentId: subtask.parent_id
		}));
		(e.target as HTMLElement).closest('.subtask-item')?.classList.add('dragging');
	}

	function handleSubtaskDragEnd(e: DragEvent) {
		(e.target as HTMLElement).closest('.subtask-item')?.classList.remove('dragging');
	}

	function handleSubtaskDragOver(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('application/x-subtask')) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dragOverPosition = e.clientY > rect.top + rect.height / 2 ? 'below' : 'above';
		dragOverThis = true;
	}

	function handleSubtaskDragLeave() {
		dragOverThis = false;
	}

	function handleSubtaskDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragOverThis = false;
		if (!e.dataTransfer || !onReorderSubtask) return;
		try {
			const data = JSON.parse(e.dataTransfer.getData('application/x-subtask'));
			if (data.subtaskId && data.subtaskId !== subtask.id && subtask.parent_id) {
				const siblings = allTasks
					.filter((t) => t.parent_id === subtask.parent_id)
					.sort((a, b) => a.position - b.position);
				const targetIdx = siblings.findIndex((s) => s.id === subtask.id);
				const newPos = dragOverPosition === 'below' ? targetIdx + 1 : targetIdx;
				onReorderSubtask(data.subtaskId, subtask.parent_id, newPos);
			}
		} catch { /* ignore */ }
	}

	// Touch D&D: compute drop position from touch coordinates
	function handleTouchSubtaskDrop(data: unknown, el: HTMLElement, _x: number, y: number) {
		if (!onReorderSubtask) return;
		const d = data as { subtaskId: string; sourceParentId: string };
		if (!d.subtaskId || d.subtaskId === subtask.id || !subtask.parent_id) return;
		const rect = el.getBoundingClientRect();
		const pos = y > rect.top + rect.height / 2 ? 'below' : 'above';
		const siblings = allTasks
			.filter((t) => t.parent_id === subtask.parent_id)
			.sort((a, b) => a.position - b.position);
		const targetIdx = siblings.findIndex((s) => s.id === subtask.id);
		const newPos = pos === 'below' ? targetIdx + 1 : targetIdx;
		onReorderSubtask(d.subtaskId, subtask.parent_id, newPos);
	}

	function handleTouchSubtaskOver(_el: HTMLElement, _x: number, y: number) {
		const rect = _el.getBoundingClientRect();
		dragOverPosition = y > rect.top + rect.height / 2 ? 'below' : 'above';
		dragOverThis = true;
	}

	function handleTouchSubtaskLeave() {
		dragOverThis = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="subtask-item flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 group transition-all duration-200 {dragOverThis ? (dragOverPosition === 'above' ? 'subtask-drag-over-above' : 'subtask-drag-over-below') : ''}"
	ondragover={handleSubtaskDragOver}
	ondragleave={handleSubtaskDragLeave}
	ondrop={handleSubtaskDrop}
	use:touchDropZone={{ type: 'subtask', onDragOver: handleTouchSubtaskOver, onDragLeave: handleTouchSubtaskLeave, onDrop: handleTouchSubtaskDrop }}
>
	<!-- Drag Handle -->
	<div
		class="subtask-drag-handle flex items-center cursor-grab active:cursor-grabbing"
		style="color: var(--tf-text-muted);"
		draggable="true"
		ondragstart={handleSubtaskDragStart}
		ondragend={handleSubtaskDragEnd}
		use:touchDragHandle={{ data: { subtaskId: subtask.id, sourceParentId: subtask.parent_id }, type: 'subtask' }}
		role="button"
		tabindex="-1"
		aria-label="Unteraufgabe verschieben"
	>
		<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="8" r="1.5"/><circle cx="15" cy="8" r="1.5"/><circle cx="9" cy="16" r="1.5"/><circle cx="15" cy="16" r="1.5"/></svg>
	</div>

	<!-- Checkbox -->
	<label class="custom-checkbox" style="width: 16px; height: 16px;">
		<input type="checkbox" checked={subtask.done} onchange={() => onToggle(subtask.id, !subtask.done)} />
		<span class="checkmark" style="border-radius: 4px; border-width: 1.5px;"></span>
	</label>

	{#if editing}
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="text"
			bind:value={editText}
			onblur={saveEdit}
			onkeydown={handleEditKeydown}
			class="inline-edit-task text-xs flex-1"
			maxlength="500"
			autofocus
		/>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="text-xs flex-1 cursor-text tf-text {subtask.done ? 'line-through opacity-40' : ''} transition-all duration-300"
			style="word-break: break-word;"
			onclick={startEdit}
			title="Klick zum Bearbeiten"
		>
			{subtask.text}
		</span>
	{/if}

	<!-- Children count badge -->
	{#if children.length > 0}
		<button
			onclick={() => (childrenOpen = !childrenOpen)}
			class="text-[9px] tf-text-muted hover:opacity-80 px-1 py-0.5 rounded"
			title="Unteraufgaben anzeigen"
		>
			{childrenDone}/{children.length}
		</button>
	{/if}

	<!-- Add child button (only if nesting allowed) -->
	{#if canNest}
		<button
			onclick={() => { addingChild = true; childrenOpen = true; }}
			class="w-5 h-5 flex items-center justify-center rounded-full border opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-all tf-text-muted"
			style="border-color: currentColor;"
			title="Unter-Unteraufgabe"
		>
			<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
		</button>
	{/if}

	<button
		onclick={() => onDelete(subtask.id)}
		class="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:text-red-500 transition-all"
		aria-label="Unteraufgabe löschen"
	>
		<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
		</svg>
	</button>
</div>

<!-- Nested children (level 2) -->
{#if childrenOpen && children.length > 0}
	<div bind:this={childrenContainer} transition:slide|global={{ duration: 200 }} class="ml-6 pl-3 space-y-0.5" style="border-left: 1.5px solid var(--tf-border);">
		{#each children as child (child.id)}
			<svelte:self
				subtask={child}
				{allTasks}
				depth={depth + 1}
				{onToggle}
				{onUpdate}
				{onDelete}
				{onAddSubtask}
				{onReorderSubtask}
			/>
		{/each}
	</div>
{/if}

<!-- Add child input -->
{#if addingChild && canNest}
	<div transition:slide|global={{ duration: 200 }} class="ml-6 pl-3" style="border-left: 1.5px solid var(--tf-border);">
		<div class="flex gap-1.5 py-1">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				bind:value={newChildText}
				placeholder="Unter-Unteraufgabe..."
				class="tf-input flex-1 px-2 py-1 text-[11px] rounded-lg border"
				maxlength="500"
				onkeydown={handleChildKeydown}
				autofocus
			/>
			<button
				onclick={handleAddChild}
				class="px-2 py-1 text-white text-[10px] rounded-lg"
				style="background: var(--tf-accent);"
				disabled={!newChildText.trim()}
			>
				<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
			</button>
			<button
				onclick={() => { addingChild = false; newChildText = ''; }}
				class="px-2 py-1 text-[10px] rounded-lg transition-all tf-text-muted hover:bg-black/5 dark:hover:bg-white/10"
				style="border: 1px solid var(--tf-border);"
				aria-label="Abbrechen"
			>
				<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
			</button>
		</div>
	</div>
{/if}
