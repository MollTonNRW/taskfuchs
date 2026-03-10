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
	let menuOpen = $state(false);
	let menuPos = $state({ x: 0, y: 0 });
	let animating = $state(false);
	let animClass = $state('');

	// Long-press für Focus Mode (1.5s)
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressFired = $state(false);

	function handleLongPressStart(e: MouseEvent | TouchEvent) {
		// Nicht starten wenn auf interaktiven Elementen
		const target = e.target as HTMLElement;
		if (target.closest('button') || target.closest('input') || target.closest('label') || target.closest('.task-content') || target.closest('.priority-bar') || target.closest('.drag-handle') || target.closest('.more-menu-btn')) return;
		longPressFired = false;
		longPressTimer = setTimeout(() => {
			longPressFired = true;
			onTaskClick?.(task.id);
		}, 1500);
	}

	function handleLongPressEnd() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
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
			handleLongPressEnd();
			const target = e.target as HTMLElement;
			if (target.closest('input') || target.closest('textarea')) { e.preventDefault(); return; }
			onDragStart?.(e);
		}}
		ondragend={(e) => onDragEnd?.(e)}
		oncontextmenu={(e) => { handleLongPressEnd(); if (onContext) { e.preventDefault(); e.stopPropagation(); onContext(e); } }}
		onmousedown={handleLongPressStart}
		onmouseup={handleLongPressEnd}
		onmouseleave={handleLongPressEnd}
		ontouchstart={handleLongPressStart}
		ontouchend={handleLongPressEnd}
		ontouchcancel={handleLongPressEnd}
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
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="progress-bar progress-bar-lg cursor-pointer"
						title={autoProgress >= 0 ? `${descendantStats.done}/${descendantStats.total} erledigt` : progressLabels[task.progress]}
						onclick={(e) => { e.stopPropagation(); if (autoProgress < 0 && onChangeProgress) onChangeProgress(task.id, ((task.progress || 0) + 1) % 4); }}
					>
						{#each [0,1,2,3] as i}
							<div class="progress-segment {i < displayProgress ? `active-${displayProgress}` : ''}"></div>
						{/each}
					</div>
					{#if autoProgress >= 0}
						<span class="text-[9px] tf-text-muted">{descendantStats.done}/{descendantStats.total}</span>
					{/if}
				</div>
			</div>

			<!-- More Menu -->
			<button
				class="more-menu-btn w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-all flex-shrink-0"
				onclick={(e) => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); menuPos = { x: rect.right - 208, y: rect.bottom + 4 }; menuOpen = !menuOpen; }}
				aria-label="Mehr Optionen"
			>
				<svg class="w-4 h-4 tf-text-muted" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
			</button>
		</div>

		{#if menuOpen}
			<!-- Backdrop -->
			<div class="fixed inset-0 z-[79]" onclick={() => (menuOpen = false)} role="presentation"></div>
			<!-- Menu -->
			<div class="fixed z-[80] w-52 rounded-xl p-1.5 animate-in" style="left: {menuPos.x}px; top: {menuPos.y}px; background: var(--tf-surface); border: 1px solid var(--tf-border); box-shadow: 0 12px 40px rgba(0,0,0,.15);">
				<button
					onclick={() => { startEdit(); menuOpen = false; }}
					class="context-menu-item w-full"
				>
					<svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
					<span class="tf-text">Bearbeiten</span>
				</button>
				<button
					onclick={() => { addingSubtask = true; subtasksOpen = true; menuOpen = false; }}
					class="context-menu-item w-full"
				>
					<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
					<span class="tf-text">Unteraufgabe</span>
				</button>
				<div class="px-3 py-1.5">
					<span class="text-xs tf-text-muted">Priorität</span>
					<div class="flex gap-1 mt-1">
						{#each priorityOrder as p}
							<button
								onclick={() => { onChangePriority(task.id, p); menuOpen = false; }}
								class="text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-opacity {priorityBadgeBg[p]} {task.priority === p ? 'ring-2 ring-current/30' : 'opacity-50'} cursor-pointer hover:opacity-100"
								title={priorityLabels[p]}
							>
								{priorityLabels[p]}
							</button>
						{/each}
					</div>
				</div>
				<div class="context-menu-divider"></div>
				<button
					onclick={() => { handleDelete(); menuOpen = false; }}
					class="context-menu-item w-full text-red-500 hover:!bg-red-50 dark:hover:!bg-red-900/20"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
					<span>Löschen</span>
				</button>
			</div>
		{/if}

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

	<!-- Priority Picker Popover -->
	{#if priorityPicker.show}
		<PriorityPicker
			x={priorityPicker.x}
			y={priorityPicker.y}
			current={task.priority}
			onSelect={(p) => onChangePriority(task.id, p)}
			onClose={() => (priorityPicker = { ...priorityPicker, show: false })}
		/>
	{/if}

	<!-- Timeframe Picker Popover -->
	{#if timeframePicker.show}
		<TimeframePicker
			x={timeframePicker.x}
			y={timeframePicker.y}
			current={task.timeframe}
			onSelect={(tf) => onChangeTimeframe?.(task.id, tf)}
			onClose={() => (timeframePicker = { ...timeframePicker, show: false })}
		/>
	{/if}
</div>
