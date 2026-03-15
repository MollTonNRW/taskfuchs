<script lang="ts">
	import { slide } from 'svelte/transition';
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';
	import SubtaskItem from './SubtaskItem.svelte';
	import PriorityPicker from './PriorityPicker.svelte';
	import { profileMap, getInitials } from '$lib/stores/profiles';
	import { priorityColors, priorityBadgeBg, priorityLabels, priorityOrder, progressLabels } from '$lib/constants';
	import { touchDragHandle } from '$lib/actions/touchDrag';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		task,
		subtasks = [],
		allTasks = [],
		onToggle,
		onUpdate,
		onDelete,
		onAddSubtask,
		onToggleSubtask,
		onUpdateSubtask,
		onDeleteSubtask,
		onChangePriority,
		onContext,
		onNoteClick,
		onDragStart,
		onDragEnd,
		touchDragData,
		touchDragType = 'task',
		onTaskClick,
		onEmojiClick,
		onChangeProgress,
		onReorderSubtask,
		forceCollapse = false
	}: {
		task: Task;
		subtasks: Task[];
		allTasks: Task[];
		onToggle: (id: string, done: boolean) => void;
		onUpdate: (id: string, text: string) => void;
		onDelete: (id: string) => void;
		onAddSubtask: (parentId: string, text: string) => void;
		onToggleSubtask: (id: string, done: boolean) => void;
		onUpdateSubtask: (id: string, text: string) => void;
		onDeleteSubtask: (id: string) => void;
		onChangePriority: (id: string, priority: 'low' | 'normal' | 'high' | 'asap') => void;
		onContext?: (e: MouseEvent) => void;
		onNoteClick?: (taskId: string, x: number, y: number) => void;
		onDragStart?: (e: DragEvent) => void;
		onDragEnd?: (e: DragEvent) => void;
		touchDragData?: unknown;
		touchDragType?: string;
		onTaskClick?: (taskId: string) => void;
		onEmojiClick?: (taskId: string, x: number, y: number) => void;
		onChangeProgress?: (id: string, progress: number) => void;
		onReorderSubtask?: (subtaskId: string, targetParentId: string, newPosition: number) => void;
		forceCollapse?: boolean;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let subtasksOpen = $state(true);
	let addingSubtask = $state(false);
	let newSubtaskText = $state('');
	let animating = $state(false);
	let animClass = $state('');
	let showFixedToast = $state(false);
	let subtasksContainer: HTMLDivElement | undefined = $state();

	// Click-Handler: Einfacher Klick → Focus, Doppelklick → Inline-Edit
	let clickTimer: ReturnType<typeof setTimeout> | null = null;

	function handleSingleClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('button') || target.closest('input') || target.closest('label') || target.closest('.priority-bar') || target.closest('.more-menu-btn') || target.closest('.task-badges') || target.closest('.add-subtask-inline')) return;

		if (clickTimer) {
			// Doppelklick erkannt → Inline-Edit
			clearTimeout(clickTimer);
			clickTimer = null;
			startEdit();
			return;
		}

		// Timer starten: wenn kein zweiter Klick → Focus
		clickTimer = setTimeout(() => {
			clickTimer = null;
			onTaskClick?.(task.id);
		}, 300);
	}

	// Picker popovers
	type PickerState = { show: boolean; x: number; y: number };
	let priorityPicker = $state<PickerState>({ show: false, x: 0, y: 0 });

	function openPriorityPicker(e: MouseEvent) {
		e.stopPropagation();
		priorityPicker = { show: true, x: e.clientX, y: e.clientY };
	}

	// All constants imported from $lib/constants

	function cyclePriority() {
		const currentIdx = priorityOrder.indexOf(task.priority);
		const nextIdx = (currentIdx + 1) % priorityOrder.length;
		onChangePriority(task.id, priorityOrder[nextIdx]);
	}

	let subtaskCount = $derived(subtasks.length);
	let subtasksDone = $derived(subtasks.filter((s) => s.done).length);

	// Build parent→children index once per allTasks change
	let childrenByParent = $derived.by(() => {
		const map = new Map<string, typeof allTasks>();
		for (const t of allTasks) {
			if (t.parent_id) {
				const arr = map.get(t.parent_id);
				if (arr) arr.push(t); else map.set(t.parent_id, [t]);
			}
		}
		return map;
	});

	// Count ALL descendants (recursive) for auto-progress
	function countDescendants(parentId: string): { total: number; done: number } {
		const children = childrenByParent.get(parentId) ?? [];
		let total = children.length;
		let done = children.filter((c) => c.done).length;
		for (const child of children) {
			const sub = countDescendants(child.id);
			total += sub.total;
			done += sub.done;
		}
		return { total, done };
	}

	let descendantStats = $derived(countDescendants(task.id));
	// Auto-progress: percentage from subtask completion
	let autoProgress = $derived(
		descendantStats.total > 0
			? Math.round((descendantStats.done / descendantStats.total) * 100)
			: -1 // -1 means no subtasks, use manual progress
	);
	// Manual progress: 0=0%, 1=33%, 2=66%, 3=100%
	const manualProgressPercent = [0, 33, 66, 100] as const;
	let displayPercent = $derived(autoProgress >= 0 ? autoProgress : manualProgressPercent[task.progress ?? 0]);
	// For backwards compat with glow effects
	let displayProgress = $derived(
		displayPercent === 100 ? 3 : displayPercent >= 50 ? 2 : displayPercent > 0 ? 1 : 0
	);
	// Alle Unteraufgaben erledigt, aber Hauptaufgabe noch offen → Checkbox-Animation
	let allSubtasksDone = $derived(descendantStats.total > 0 && descendantStats.done === descendantStats.total && !task.done);

	function startEdit() {
		editText = task.text;
		editing = true;
	}

	function saveEdit() {
		const trimmed = editText.trim();
		if (trimmed && trimmed !== task.text) {
			onUpdate(task.id, trimmed);
		}
		editing = false;
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
		if (e.key === 'Escape') { editing = false; }
	}

	let completingText = $state(false);

	function handleToggle() {
		const willBeDone = !task.done;
		animClass = 'task-check';
		animating = true;
		if (willBeDone) {
			completingText = true;
			setTimeout(() => { completingText = false; }, 400);
		}
		onToggle(task.id, willBeDone);
		setTimeout(() => { animating = false; animClass = ''; }, 400);
	}

	function handleDelete() {
		animClass = 'task-exit';
		animating = true;
		setTimeout(() => { onDelete(task.id); }, 300);
	}

	async function handleAddSubtask() {
		const trimmed = newSubtaskText.trim();
		if (!trimmed) return;
		onAddSubtask(task.id, trimmed);
		newSubtaskText = '';
		addingSubtask = false;
		await tick();
		if (subtasksContainer) {
			const lastChild = subtasksContainer.querySelector('.subtask-item:last-of-type');
			lastChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	function handleSubtaskKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); }
		if (e.key === 'Escape') { addingSubtask = false; newSubtaskText = ''; }
	}

	function formatDate(dateStr: string): string {
		try {
			const d = new Date(dateStr);
			return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
		} catch { return dateStr; }
	}
</script>

<div
	class="task-enter group/task {animClass} {task.priority === 'asap' ? 'asap-blink' : ''} {task.highlighted ? 'highlighted' : ''}"
	id="task-{task.id}"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="task-item rounded-xl px-3 py-2.5 tf-surface tf-surface-interactive border transition-all duration-200 group relative {task.highlighted ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}"
		style="border-color: var(--tf-border);"
		draggable={!task.highlighted}
		onclick={(e) => {
			if (task.highlighted && !showFixedToast) {
				const target = e.target as HTMLElement;
				if (target.closest('button') || target.closest('input') || target.closest('label') || target.closest('.task-content') || target.closest('.more-menu-btn') || target.closest('.priority-bar') || target.closest('.task-badges')) return;
				showFixedToast = true; setTimeout(() => showFixedToast = false, 1500);
			}
			handleSingleClick(e);
		}}
		ondragstart={(e) => {
			cancelLongPress();
			if (task.highlighted) { e.preventDefault(); return; }
			const target = e.target as HTMLElement;
			if (target.closest('input') || target.closest('textarea')) { e.preventDefault(); return; }
			onDragStart?.(e);
		}}
		ondragend={(e) => onDragEnd?.(e)}
		oncontextmenu={(e) => { if (onContext) { e.preventDefault(); e.stopPropagation(); onContext(e); } }}
	>
		<div class="task-row">
			<!-- Touch Drag Handle (mobile) -->
			{#if touchDragData && !task.highlighted}
				<div
					class="task-touch-drag-handle md:hidden flex items-center cursor-grab active:cursor-grabbing touch-action-none"
					style="color: var(--tf-text-muted);"
					use:touchDragHandle={{ data: touchDragData, type: touchDragType }}
					role="button"
					tabindex="-1"
					aria-label="Aufgabe verschieben"
				>
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
				</div>
			{/if}

			<!-- Priority Bar -->
			<div
				class="priority-bar badge-clickable"
				style="background: {priorityColors[task.priority]}; align-self: stretch;"
				onclick={openPriorityPicker}
				role="button"
				tabindex="-1"
				title="Priorität ändern"
			></div>

			<!-- Checkbox -->
			<label class="custom-checkbox {allSubtasksDone ? 'subtasks-complete-pulse' : ''}" onclick={(e) => e.stopPropagation()}>
				<input type="checkbox" checked={task.done} onchange={handleToggle} />
				<span class="checkmark"></span>
			</label>

			<!-- Content -->
			<div class="task-content">
				{#if task.emoji}
					<span
						class="text-sm cursor-pointer hover:scale-110 transition-transform flex-shrink-0"
						onclick={(e) => { e.stopPropagation(); onEmojiClick?.(task.id, e.clientX, e.clientY); }}
						title="Symbol ändern"
					>{task.emoji}</span>
				{/if}

				{#if editing}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={editText}
						onblur={saveEdit}
						onkeydown={handleEditKeydown}
						class="inline-edit-task text-sm font-medium flex-1"
						maxlength="500"
						autofocus
					/>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<span
						class="task-text text-sm font-medium cursor-pointer {task.done ? 'line-through opacity-40' : ''} {completingText ? 'task-text-completing' : ''}"
						style="color: var(--tf-text);"
					>
						{task.text}
					</span>
				{/if}

				{#if task.highlighted}
					<span class="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap" style="color: #f97316; background: rgba(251,146,60,.15);" title="Fixiert — nicht verschiebbar">
						<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
						Fixiert
					</span>
				{/if}

				<!-- Badges -->
				<div class="task-badges" onclick={(e) => e.stopPropagation()}>
					{#if task.priority === 'asap'}
						<span class="badge-clickable text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500 text-white animate-pulse whitespace-nowrap cursor-pointer" onclick={openPriorityPicker}>ASAP!</span>
					{:else if task.priority !== 'normal'}
						<span class="badge-clickable text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap cursor-pointer {priorityBadgeBg[task.priority]}" onclick={openPriorityPicker}>
							{priorityLabels[task.priority]}
						</span>
					{/if}
					{#if task.due_date}
						<span class="text-[10px] flex items-center gap-1 whitespace-nowrap tf-text-muted">
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
							{formatDate(task.due_date)}
						</span>
					{/if}
					<!-- Assignee Avatar -->
					{#if task.assigned_to}
						{@const profile = $profileMap.get(task.assigned_to)}
						<span
							class="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
							style="background: var(--tf-accent);"
							title={profile?.display_name || profile?.username || task.assigned_to}
						>
							{getInitials(profile, task.assigned_to)}
						</span>
					{/if}
					{#if task.note}
						<button
							class="text-blue-400 text-[10px] cursor-pointer hover:scale-110 transition-transform"
							title={task.note}
							onclick={(e) => { e.stopPropagation(); if (onNoteClick) onNoteClick(task.id, e.clientX, e.clientY); }}
						>💬</button>
					{:else}
						<button
							class="text-gray-300 text-[10px] cursor-pointer hover:text-blue-400 transition-colors note-icon"
							title="Notiz hinzufügen"
							onclick={(e) => { e.stopPropagation(); if (onNoteClick) onNoteClick(task.id, e.clientX, e.clientY); }}
						>💬</button>
					{/if}
				</div>
			</div>

			<!-- Add Subtask Button (inline) -->
			<button
				onclick={(e) => { e.stopPropagation(); subtasksOpen = true; addingSubtask = true; }}
				class="add-subtask-inline w-6 h-6 flex items-center justify-center rounded-full border opacity-0 group-hover/task:opacity-40 hover:!opacity-100 transition-all tf-text-muted flex-shrink-0"
				style="border-color: currentColor;"
				title="Unteraufgabe hinzufügen"
			>
				<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
			</button>

			<!-- More Menu -->
			<button
				class="more-menu-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all flex-shrink-0"
				onclick={(e) => { e.stopPropagation(); onContext?.(e); }}
				aria-label="Mehr Optionen"
			>
				<svg class="w-4 h-4 tf-text-muted" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
			</button>
		</div>

		<!-- Progress Bar (dünne Linie unter der Aufgabe, rein visuell) -->
		{#if displayPercent > 0 || descendantStats.total > 0}
			<div
				class="w-full px-2 pb-1 pt-0.5 flex items-center gap-1.5"
				title={autoProgress >= 0 ? `${descendantStats.done}/${descendantStats.total} erledigt (${displayPercent}%)` : `${displayPercent}%`}
			>
				<div class="flex-1 h-[8px] rounded-full overflow-hidden" style="background: var(--tf-border);">
					<div
						class="h-full rounded-full transition-all duration-500 ease-out progress-fill-{displayProgress} {displayPercent === 100 ? 'progress-complete' : ''}"
						style="width: {displayPercent}%"
					></div>
				</div>
				<span class="text-[9px] tf-text-muted tabular-nums flex-shrink-0">
					{#if autoProgress >= 0}
						{descendantStats.done}/{descendantStats.total}
					{:else}
						{displayPercent}%
					{/if}
				</span>
			</div>
		{/if}

		<!-- Fixed Toast -->
		{#if showFixedToast}
			<div class="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none z-10" style="background: rgba(0,0,0,.45); backdrop-filter: blur(2px);">
				<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style="background: rgba(251,146,60,.9);">
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
					Aufgabe ist fixiert
				</div>
			</div>
		{/if}

		<!-- Subtasks Toggle -->
		{#if subtaskCount > 0}
		<div class="mt-1 flex items-center gap-1">
			<button
				onclick={() => (subtasksOpen = !subtasksOpen)}
				class="flex items-center gap-1 text-[11px] tf-text-muted hover:opacity-80 transition-colors"
			>
				<svg class="w-3 h-3 transition-transform duration-300 {subtasksOpen ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
				</svg>
				Unteraufgaben <span class="text-[10px] tf-text-muted">{subtasksDone}/{subtaskCount}</span>
			</button>
		</div>
		{/if}

		<!-- Subtasks List -->
		{#if subtasksOpen && !forceCollapse && subtaskCount > 0}
			<div bind:this={subtasksContainer} transition:slide|global={{ duration: 200 }} class="mt-2 space-y-0.5">
				{#each subtasks as sub (sub.id)}
					<SubtaskItem
						subtask={sub}
						{allTasks}
						depth={1}
						onToggle={onToggleSubtask}
						onUpdate={onUpdateSubtask}
						onDelete={onDeleteSubtask}
						onAddSubtask={onAddSubtask}
						{onReorderSubtask}
					/>
				{/each}
			</div>
		{/if}

		<!-- Add Subtask Input -->
		{#if addingSubtask}
			<div transition:slide|global={{ duration: 200 }} class="mt-2">
				<div class="flex gap-1.5">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={newSubtaskText}
						placeholder="Unteraufgabe..."
						class="tf-input flex-1 px-3 py-1.5 text-xs rounded-lg border"
						maxlength="500"
						onkeydown={handleSubtaskKeydown}
						autofocus
					/>
					<button
						onclick={handleAddSubtask}
						class="px-2.5 py-1.5 text-white text-xs rounded-lg transition-all"
						style="background: var(--tf-accent);"
						disabled={!newSubtaskText.trim()}
						aria-label="Unteraufgabe hinzufügen"
					>
						<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
					</button>
					<button
						onclick={() => { addingSubtask = false; newSubtaskText = ''; }}
						class="px-2.5 py-1.5 text-xs rounded-lg transition-all tf-text-muted hover:bg-black/5 dark:hover:bg-white/10"
						style="border: 1px solid var(--tf-border);"
						aria-label="Abbrechen"
					>
						<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>
			</div>
		{/if}
	</div>

</div>

<!-- Pickers outside task-enter to avoid transform/stacking issues -->
{#if priorityPicker.show}
	<PriorityPicker
		x={priorityPicker.x}
		y={priorityPicker.y}
		current={task.priority}
		onSelect={(p) => onChangePriority(task.id, p)}
		onClose={() => (priorityPicker = { ...priorityPicker, show: false })}
	/>
{/if}

