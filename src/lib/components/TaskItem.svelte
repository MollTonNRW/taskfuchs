<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { Database } from '$lib/types/database';
	import SubtaskItem from './SubtaskItem.svelte';
	import PriorityPicker from './PriorityPicker.svelte';
	import TimeframePicker from './TimeframePicker.svelte';
	import { profileMap, getInitials } from '$lib/stores/profiles';
	import { priorityColors, priorityBadgeBg, priorityLabels, priorityOrder, timeframeClasses, timeframeLabels, progressLabels } from '$lib/constants';

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
		onTaskClick,
		onChangeTimeframe,
		onEmojiClick,
		onChangeProgress,
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
		onTaskClick?: (taskId: string) => void;
		onChangeTimeframe?: (id: string, timeframe: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null) => void;
		onEmojiClick?: (taskId: string, x: number, y: number) => void;
		onChangeProgress?: (id: string, progress: number) => void;
		forceCollapse?: boolean;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let subtasksOpen = $state(false);
	let addingSubtask = $state(false);
	let newSubtaskText = $state('');
	let animating = $state(false);
	let animClass = $state('');

	// Double-tap für Focus Mode
	function handleDoubleTap(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('button') || target.closest('input') || target.closest('label') || target.closest('.task-content') || target.closest('.priority-bar') || target.closest('.drag-handle') || target.closest('.more-menu-btn')) return;
		e.preventDefault();
		onTaskClick?.(task.id);
	}

	// Picker popovers
	type PickerState = { show: boolean; x: number; y: number };
	let priorityPicker = $state<PickerState>({ show: false, x: 0, y: 0 });
	let timeframePicker = $state<PickerState>({ show: false, x: 0, y: 0 });

	function openPriorityPicker(e: MouseEvent) {
		e.stopPropagation();
		priorityPicker = { show: true, x: e.clientX, y: e.clientY };
	}

	function openTimeframePicker(e: MouseEvent) {
		e.stopPropagation();
		timeframePicker = { show: true, x: e.clientX, y: e.clientY };
	}

	// All constants imported from $lib/constants

	function cyclePriority() {
		const currentIdx = priorityOrder.indexOf(task.priority);
		const nextIdx = (currentIdx + 1) % priorityOrder.length;
		onChangePriority(task.id, priorityOrder[nextIdx]);
	}

	let subtaskCount = $derived(subtasks.length);
	let subtasksDone = $derived(subtasks.filter((s) => s.done).length);

	// Count ALL descendants (recursive) for auto-progress
	function countDescendants(parentId: string): { total: number; done: number } {
		const children = allTasks.filter((t) => t.parent_id === parentId);
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
	// Auto-progress: 0-3 scale from subtask completion ratio
	let autoProgress = $derived(
		descendantStats.total > 0
			? Math.round((descendantStats.done / descendantStats.total) * 3)
			: -1 // -1 means no subtasks, use manual progress
	);
	let displayProgress = $derived(autoProgress >= 0 ? autoProgress : task.progress);

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

	function handleToggle() {
		animClass = 'task-check';
		animating = true;
		onToggle(task.id, !task.done);
		setTimeout(() => { animating = false; animClass = ''; }, 400);
	}

	function handleDelete() {
		animClass = 'task-exit';
		animating = true;
		setTimeout(() => { onDelete(task.id); }, 300);
	}

	function handleAddSubtask() {
		const trimmed = newSubtaskText.trim();
		if (!trimmed) return;
		onAddSubtask(task.id, trimmed);
		newSubtaskText = '';
		addingSubtask = false;
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
	class="task-enter {animClass} {task.priority === 'asap' ? 'asap-blink' : ''} {task.highlighted ? 'highlighted' : ''}"
	id="task-{task.id}"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="task-item rounded-xl px-3 py-2.5 tf-surface tf-surface-interactive border transition-all duration-200 group relative cursor-grab active:cursor-grabbing"
		style="border-color: var(--tf-border);"
		draggable="true"
		ondragstart={(e) => {
			const target = e.target as HTMLElement;
			if (target.closest('input') || target.closest('textarea')) { e.preventDefault(); return; }
			onDragStart?.(e);
		}}
		ondragend={(e) => onDragEnd?.(e)}
		oncontextmenu={(e) => { if (onContext) { e.preventDefault(); e.stopPropagation(); onContext(e); } }}
		ondblclick={handleDoubleTap}
	>
		<div class="task-row">
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
			<label class="custom-checkbox" onclick={(e) => e.stopPropagation()}>
				<input type="checkbox" checked={task.done} onchange={handleToggle} />
				<span class="checkmark"></span>
			</label>

			<!-- Content -->
			<div class="task-content" onclick={(e) => e.stopPropagation()}>
				{#if task.emoji}
					<span
						class="text-sm cursor-pointer hover:scale-110 transition-transform flex-shrink-0"
						onclick={(e) => { e.stopPropagation(); onEmojiClick?.(task.id, e.clientX, e.clientY); }}
						title="Symbol ändern"
					>{task.emoji}</span>
				{:else}
					<button
						class="emoji-add-btn w-5 h-5 flex items-center justify-center text-sm rounded flex-shrink-0"
						title="Symbol vergeben"
						onclick={(e) => { e.stopPropagation(); onEmojiClick?.(task.id, e.clientX, e.clientY); }}
					>😊</button>
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
						class="task-text text-sm font-medium cursor-text {task.done ? 'line-through opacity-40' : ''}"
						style="color: var(--tf-text);"
						onclick={startEdit}
					>
						{task.text}
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
					{#if task.timeframe}
						<span class="text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap cursor-pointer {timeframeClasses[task.timeframe]}" onclick={openTimeframePicker}>
							{timeframeLabels[task.timeframe]}
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
					<!-- Progress Bar (always visible, clickable to cycle) -->
					<button
						type="button"
						class="progress-bar progress-bar-lg cursor-pointer p-0 border-0 bg-transparent"
						title={autoProgress >= 0 ? `${descendantStats.done}/${descendantStats.total} erledigt` : progressLabels[task.progress]}
						onclick={(e) => { e.stopPropagation(); if (autoProgress < 0 && onChangeProgress) onChangeProgress(task.id, ((task.progress || 0) + 1) % 4); }}
					>
						{#each [0,1,2,3] as i}
							<div class="progress-segment {(displayProgress === 3 ? true : i < displayProgress) ? `active-${displayProgress}` : ''}"></div>
						{/each}
					</button>
					{#if autoProgress >= 0}
						<span class="text-[9px] tf-text-muted">{descendantStats.done}/{descendantStats.total}</span>
					{/if}
				</div>
			</div>

			<!-- More Menu -->
			<button
				class="more-menu-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all flex-shrink-0"
				onclick={(e) => { e.stopPropagation(); onContext?.(e); }}
				aria-label="Mehr Optionen"
			>
				<svg class="w-4 h-4 tf-text-muted" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
			</button>
		</div>

			<!-- Subtasks Toggle -->
		{#if subtaskCount > 0}
			<div class="mt-1 ml-10">
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
			<div transition:slide|global={{ duration: 200 }} class="mt-2 ml-10 pl-3 space-y-0.5" style="border-left: 2px solid var(--tf-border);">
				{#each subtasks as sub (sub.id)}
					<SubtaskItem
						subtask={sub}
						{allTasks}
						depth={1}
						onToggle={onToggleSubtask}
						onUpdate={onUpdateSubtask}
						onDelete={onDeleteSubtask}
						onAddSubtask={onAddSubtask}
					/>
				{/each}
			</div>
		{/if}

		<!-- Add Subtask Input -->
		{#if addingSubtask}
			<div transition:slide|global={{ duration: 200 }} class="mt-2 ml-10 pl-3" style="border-left: 2px solid var(--tf-border);">
				<div class="flex gap-1.5">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={newSubtaskText}
						placeholder="Unteraufgabe..."
						class="tf-input flex-1 px-3 py-1.5 text-xs rounded-lg border"
						maxlength="500"
						onkeydown={handleSubtaskKeydown}
						onblur={() => { if (!newSubtaskText.trim()) addingSubtask = false; }}
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

{#if timeframePicker.show}
	<TimeframePicker
		x={timeframePicker.x}
		y={timeframePicker.y}
		current={task.timeframe}
		onSelect={(tf) => onChangeTimeframe?.(task.id, tf)}
		onClose={() => (timeframePicker = { ...timeframePicker, show: false })}
	/>
{/if}
