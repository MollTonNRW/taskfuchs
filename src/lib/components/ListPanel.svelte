<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { Database } from '$lib/types/database';
	import TaskItem from './TaskItem.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		list,
		tasks,
		onRename,
		onDelete,
		onIconChange,
		onAddTask,
		onToggleTask,
		onUpdateTask,
		onDeleteTask,
		onAddSubtask,
		onToggleSubtask,
		onUpdateSubtask,
		onDeleteSubtask,
		onChangePriority,
		onListContext,
		onTaskContext,
		onNoteClick,
		onReorderTask,
		onReorderList,
		onReorderSubtask,
		onShareClick,
		onTaskClick,
		onEmojiClick,
		onChangeProgress,
		listIndex,
		bulkMode = false,
		selectedTaskIds = new Set<string>(),
		onBulkToggle,
		onSelectAll,
		onMinimize
	}: {
		list: List;
		tasks: Task[];
		onRename: (id: string, title: string) => void;
		onDelete: (id: string) => void;
		onIconChange: (id: string, icon: string) => void;
		onAddTask: (listId: string, text: string) => void;
		onToggleTask: (id: string, done: boolean) => void;
		onUpdateTask: (id: string, text: string) => void;
		onDeleteTask: (id: string) => void;
		onAddSubtask: (parentId: string, text: string) => void;
		onToggleSubtask: (id: string, done: boolean) => void;
		onUpdateSubtask: (id: string, text: string) => void;
		onDeleteSubtask: (id: string) => void;
		onChangePriority: (id: string, priority: 'low' | 'normal' | 'high' | 'asap') => void;
		onListContext?: (e: MouseEvent) => void;
		onTaskContext?: (e: MouseEvent, task: Task) => void;
		onNoteClick?: (taskId: string, x: number, y: number) => void;
		onReorderTask?: (taskId: string, targetListId: string, newPosition: number) => void;
		onReorderList?: (listId: string, newPosition: number) => void;
		onReorderSubtask?: (subtaskId: string, targetParentId: string, newPosition: number) => void;
		onShareClick?: () => void;
		onTaskClick?: (taskId: string) => void;
		onEmojiClick?: (taskId: string, x: number, y: number) => void;
		onChangeProgress?: (id: string, progress: number) => void;
		listIndex?: number;
		bulkMode?: boolean;
		selectedTaskIds?: Set<string>;
		onBulkToggle?: (taskId: string) => void;
		onSelectAll?: (listId: string) => void;
		onMinimize?: () => void;
	} = $props();

	let editingTitle = $state(false);
	let titleText = $state('');
	let menuOpen = $state(false);
	let showDone = $state(false);
	let allCollapsed = $state(false);
	let listCollapsed = $state(false);
	let dragOverIdx = $state<number | null>(null);
	let listDragOver = $state(false);
	let editingDividerId = $state<string | null>(null);
	let dividerEditText = $state('');

	let topLevelTasks = $derived(tasks.filter((t) => !t.parent_id));
	// Reihenfolge kommt vom Parent (filteredTasksForList + sortTasks) — NICHT re-sortieren
	let activeTasks = $derived(
		topLevelTasks.filter((t) => (t.type === 'divider' || !t.done))
	);
	let doneTasks = $derived(topLevelTasks.filter((t) => t.type !== 'divider' && t.done));

	function getSubtasks(parentId: string): Task[] {
		return tasks.filter((t) => t.parent_id === parentId);
	}

	function startRename() {
		titleText = list.title;
		editingTitle = true;
	}

	function saveRename() {
		const trimmed = titleText.trim();
		if (trimmed && trimmed !== list.title) {
			onRename(list.id, trimmed);
		}
		editingTitle = false;
	}

	function handleTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
		if (e.key === 'Escape') { editingTitle = false; }
	}

	const defaultIcons = ['📝', '🏠', '💼', '🛒', '💡', '🎯', '📚', '🔧', '🎨', '🏃', '🎵', '🌱'];
	let iconPickerOpen = $state(false);

	// Task D&D
	function handleTaskDragStart(e: DragEvent, task: Task) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: task.id, sourceListId: list.id }));
		(e.target as HTMLElement).closest('.task-item')?.classList.add('dragging');
	}

	function handleTaskDragEnd(e: DragEvent) {
		(e.target as HTMLElement).closest('.task-item')?.classList.remove('dragging');
		dragOverIdx = null;
	}

	function handleTaskDragOver(e: DragEvent, idx: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		// Oberhalb/unterhalb der Mitte bestimmt ob vor oder nach diesem Element
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const isBelow = e.clientY > rect.top + rect.height / 2;
		dragOverIdx = isBelow ? idx + 1 : idx;
	}

	function handleTaskDrop(e: DragEvent, idx: number) {
		e.preventDefault();
		if (!e.dataTransfer || !onReorderTask) return;
		const dropIdx = dragOverIdx ?? idx;
		dragOverIdx = null;
		try {
			const data = JSON.parse(e.dataTransfer.getData('text/plain'));
			if (data.taskId) {
				onReorderTask(data.taskId, list.id, dropIdx);
			}
		} catch { /* ignore */ }
	}

	function handleEmptyDrop(e: DragEvent) {
		e.preventDefault();
		listDragOver = false;
		if (!e.dataTransfer || !onReorderTask) return;
		try {
			const data = JSON.parse(e.dataTransfer.getData('text/plain'));
			if (data.taskId) {
				onReorderTask(data.taskId, list.id, activeTasks.length);
			}
		} catch { /* ignore */ }
	}

	// List D&D (desktop)
	function handleListDragStart(e: DragEvent) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-list', JSON.stringify({ listId: list.id, listIndex }));
		const panel = (e.target as HTMLElement).closest('.list-panel');
		if (panel) panel.classList.add('list-dragging');
	}

	function handleListDragEnd(e: DragEvent) {
		const panel = (e.target as HTMLElement).closest('.list-panel');
		if (panel) panel.classList.remove('list-dragging');
	}

	function handleListPanelDragOver(e: DragEvent) {
		if (e.dataTransfer?.types.includes('application/x-list')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			const el = (e.currentTarget as HTMLElement);
			el.closest('.list-panel')?.classList.add('list-drag-over');
		}
	}

	function handleListPanelDragLeave(e: DragEvent) {
		(e.currentTarget as HTMLElement).closest('.list-panel')?.classList.remove('list-drag-over');
	}

	function handleListPanelDrop(e: DragEvent) {
		e.preventDefault();
		(e.currentTarget as HTMLElement).closest('.list-panel')?.classList.remove('list-drag-over');
		if (!e.dataTransfer || !onReorderList) return;
		try {
			const data = JSON.parse(e.dataTransfer.getData('application/x-list'));
			if (data.listId && data.listId !== list.id && listIndex !== undefined) {
				onReorderList(data.listId, listIndex);
			}
		} catch { /* ignore */ }
	}
</script>

<div
	class="list-panel w-full md:w-full md:flex-shrink-0 flex flex-col max-h-[calc(100vh-120px)]"
	ondragover={handleListPanelDragOver}
	ondragleave={handleListPanelDragLeave}
	ondrop={handleListPanelDrop}
	role="list"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="rounded-2xl tf-surface border shadow-sm flex-1 flex flex-col transition-colors duration-500 min-h-0"
		style="border-color: var(--tf-border);"
		oncontextmenu={(e) => onListContext?.(e)}
	>
		<!-- Header -->
		<div class="px-5 pt-5 pb-3 flex items-center justify-between">
			<div class="flex items-center gap-2.5 flex-1 min-w-0">
				<!-- List Drag Handle (desktop only) -->
				<div
					class="list-drag-handle hidden md:flex items-center"
					draggable="true"
					ondragstart={handleListDragStart}
					ondragend={handleListDragEnd}
					role="button"
					tabindex="-1"
					aria-label="Liste verschieben"
				>
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style="color: var(--tf-text-muted);">
						<circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
						<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
						<circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
					</svg>
				</div>

				<!-- Icon Picker -->
				<div class="relative">
					<button
						class="text-xl hover:scale-110 transition-transform cursor-pointer"
						onclick={() => (iconPickerOpen = !iconPickerOpen)}
					>
						{list.icon}
					</button>
					{#if iconPickerOpen}
						<div class="fixed inset-0 z-40" onclick={() => (iconPickerOpen = false)} role="presentation"></div>
						<div class="absolute left-0 top-8 z-50 rounded-xl p-2 grid grid-cols-6 gap-1 w-52 animate-in tf-popover-bg" style="border: 1px solid var(--tf-border); box-shadow: 0 12px 40px rgba(0,0,0,.15);">
							{#each defaultIcons as icon}
								<button
									onclick={() => { onIconChange(list.id, icon); iconPickerOpen = false; }}
									class="w-8 h-8 flex items-center justify-center rounded-lg text-lg hover:scale-110 hover:bg-black/5 dark:hover:bg-white/10 transition-all"
								>
									{icon}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Title -->
				{#if editingTitle}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={titleText}
						onblur={saveRename}
						onkeydown={handleTitleKeydown}
						class="inline-edit-title text-lg font-semibold flex-1"
						maxlength="100"
						autofocus
					/>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<h2
						class="text-lg font-semibold tracking-tight truncate cursor-pointer tf-text"
						ondblclick={startRename}
						title="Doppelklick zum Bearbeiten"
					>
						{list.title}
					</h2>
				{/if}

				<span class="list-count text-xs font-medium px-2 py-0.5 rounded-full tf-text-muted" style="background: var(--tf-surface-hover);">
					{activeTasks.filter(t => t.type !== 'divider').length}
				</span>
				{#if bulkMode && onSelectAll}
					<button
						onclick={() => onSelectAll(list.id)}
						class="text-[10px] font-medium px-2 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						style="color: var(--tf-accent);"
						title="Alle auswählen"
					>
						Alle
					</button>
				{/if}
			</div>

			<!-- Minimize List (Desktop) -->
			{#if onMinimize}
				<button
					onclick={onMinimize}
					class="hidden md:flex w-8 h-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors tf-text-muted"
					title="Liste minimieren"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
				</button>
			{/if}

			<!-- Collapse List -->
			<button
				onclick={() => (listCollapsed = !listCollapsed)}
				class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors tf-text-muted"
				title={listCollapsed ? 'Liste aufklappen' : 'Liste zuklappen'}
			>
				<svg class="w-4 h-4 transition-transform duration-300 {listCollapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
				</svg>
			</button>

			<!-- List Menu -->
			<div class="relative">
				<button
					onclick={() => (menuOpen = !menuOpen)}
					class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors tf-text-muted"
					aria-label="Listen-Optionen"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01" />
					</svg>
				</button>

				{#if menuOpen}
					<div class="fixed inset-0 z-40" onclick={() => (menuOpen = false)} role="presentation"></div>
					<div class="absolute right-0 top-8 z-50 w-48 rounded-xl p-1.5 animate-in tf-popover-bg" style="border: 1px solid var(--tf-border); box-shadow: 0 12px 40px rgba(0,0,0,.15);">
						<button
							onclick={() => { startRename(); menuOpen = false; }}
							class="context-menu-item w-full"
						>
							<svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
							<span class="tf-text">Umbenennen</span>
						</button>
						{#if onShareClick}
						<button
							onclick={() => { onShareClick(); menuOpen = false; }}
							class="context-menu-item w-full"
						>
							<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
							<span class="tf-text">Teilen</span>
						</button>
						{/if}
						<button
							onclick={() => { onDelete(list.id); menuOpen = false; }}
							class="context-menu-item w-full text-red-500 hover:!bg-red-50 dark:hover:!bg-red-900/20"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
							<span>Liste löschen</span>
						</button>
					</div>
				{/if}
			</div>
		</div>

		{#if !listCollapsed}
		<!-- Tasks -->
		<div class="flex-1 min-h-0 px-3 pb-2 space-y-1 overflow-y-auto task-list-scroll">
			{#each activeTasks as task, idx (task.id)}
				{#if task.type === 'divider'}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="section-divider group {dragOverIdx === idx ? 'drag-over' : ''}"
						draggable="true"
						ondragstart={(e) => handleTaskDragStart(e, task)}
						ondragend={handleTaskDragEnd}
						ondragover={(e) => handleTaskDragOver(e, idx)}
						ondrop={(e) => handleTaskDrop(e, idx)}
						oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); onTaskContext?.(e, task); }}
					>
						<div class="divider-line" style="background: var(--tf-border);"></div>
						{#if editingDividerId === task.id}
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								bind:value={dividerEditText}
								onblur={() => { const t = dividerEditText.trim(); if (t) onUpdateTask(task.id, t); editingDividerId = null; }}
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = dividerEditText.trim(); if (t) onUpdateTask(task.id, t); editingDividerId = null; } if (e.key === 'Escape') editingDividerId = null; }}
								class="text-xs font-semibold uppercase tracking-wider tf-text-muted bg-transparent border-b-2 outline-none text-center min-w-[60px]"
								style="border-color: var(--tf-accent);"
								maxlength="100"
								autofocus
								onclick={(e) => e.stopPropagation()}
							/>
						{:else}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								class="text-xs font-semibold uppercase tracking-wider tf-text-muted cursor-pointer hover:opacity-70 transition-opacity"
								onclick={(e) => { e.stopPropagation(); editingDividerId = task.id; dividerEditText = task.divider_label || task.text; }}
								title="Klick zum Umbenennen"
							>{task.divider_label || task.text}</span>
						{/if}
						<div class="divider-line" style="background: var(--tf-border);"></div>
					</div>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						transition:slide|global={{ duration: 250 }}
						class="flex items-start gap-1 {dragOverIdx === idx ? 'drag-over' : ''}"
						ondragover={(e) => handleTaskDragOver(e, idx)}
						ondrop={(e) => handleTaskDrop(e, idx)}
					>
						{#if bulkMode && onBulkToggle}
							<label class="flex-shrink-0 mt-3 ml-1 cursor-pointer" onclick={(e) => e.stopPropagation()}>
								<input
									type="checkbox"
									checked={selectedTaskIds.has(task.id)}
									onchange={() => onBulkToggle(task.id)}
									class="accent-orange-500 w-4 h-4"
								/>
							</label>
						{/if}
						<div class="flex-1 min-w-0">
						<TaskItem
							{task}
							subtasks={getSubtasks(task.id)}
							allTasks={tasks}
							onToggle={onToggleTask}
							onUpdate={onUpdateTask}
							onDelete={onDeleteTask}
							{onAddSubtask}
							{onToggleSubtask}
							{onUpdateSubtask}
							{onDeleteSubtask}
							{onChangePriority}
							{onEmojiClick}
							{onChangeProgress}
							{onReorderSubtask}
							onContext={(e) => onTaskContext?.(e, task)}
							{onNoteClick}
							onDragStart={(e) => handleTaskDragStart(e, task)}
							onDragEnd={handleTaskDragEnd}
							{onTaskClick}
							forceCollapse={allCollapsed}
						/>
						</div>
					</div>
				{/if}
			{/each}

			{#if activeTasks.filter(t => t.type !== 'divider').length === 0}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex flex-col items-center justify-center py-10 {listDragOver ? 'ring-2 ring-dashed ring-orange-400 rounded-xl' : ''}"
					ondragover={(e) => { e.preventDefault(); listDragOver = true; }}
					ondragleave={() => { listDragOver = false; }}
					ondrop={handleEmptyDrop}
				>
					{#if listDragOver}
						<span class="text-sm tf-text-muted font-medium">Hier ablegen</span>
					{:else if doneTasks.length > 0}
						<span class="text-2xl mb-2">🎉</span>
						<span class="text-sm tf-text-muted font-medium">Alles erledigt!</span>
					{:else}
						<span class="text-2xl mb-2">✅</span>
						<span class="text-sm tf-text-muted font-medium">Top! Alles erledigt!</span>
						<span class="text-xs tf-text-muted mt-1">Weiter so! 💪</span>
					{/if}
				</div>
			{:else}
				<!-- Bottom drop zone (ans Ende der Liste ziehen) -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="h-6 -mt-1 rounded-b-lg transition-colors {dragOverIdx === activeTasks.length ? 'border-t-2 border-blue-500' : ''}"
					ondragover={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; dragOverIdx = activeTasks.length; }}
					ondragleave={() => { if (dragOverIdx === activeTasks.length) dragOverIdx = null; }}
					ondrop={(e) => handleTaskDrop(e, activeTasks.length)}
				></div>
			{/if}

			<!-- Done Section -->
			{#if doneTasks.length > 0}
				<button
					onclick={() => (showDone = !showDone)}
					class="flex items-center gap-2 w-full text-xs tf-text-muted hover:opacity-80 transition-colors py-2"
				>
					<div class="flex-1 h-px" style="background: var(--tf-border);"></div>
					<svg class="w-4 h-4 transition-transform duration-300 {showDone ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
					</svg>
					<span>Erledigt ({doneTasks.length})</span>
					<div class="flex-1 h-px" style="background: var(--tf-border);"></div>
				</button>

				{#if showDone}
					<div transition:slide|global={{ duration: 300 }} class="space-y-1 opacity-50">
						{#each doneTasks as task (task.id)}
							<div transition:slide|global={{ duration: 250 }} class="group/done relative">
								<TaskItem
									{task}
									subtasks={getSubtasks(task.id)}
									allTasks={tasks}
									onToggle={onToggleTask}
									onUpdate={onUpdateTask}
									onDelete={onDeleteTask}
									{onAddSubtask}
									{onToggleSubtask}
									{onUpdateSubtask}
									{onDeleteSubtask}
									{onChangePriority}
									{onReorderSubtask}
									onContext={(e) => onTaskContext?.(e, task)}
									{onNoteClick}
									{onTaskClick}
									forceCollapse={allCollapsed}
								/>
								<button
									onclick={() => onToggleTask(task.id, false)}
									class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/done:opacity-100 px-2 py-1 text-xs font-medium rounded-lg transition-all hover:bg-orange-100 dark:hover:bg-orange-900/30 tf-accent"
									title="Rückgängig"
								>
									<svg class="w-3.5 h-3.5 inline-block mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4"/></svg>
									Undo
								</button>
							</div>
						{/each}
					</div>
				{/if}
			{/if}

			<!-- + Button unter Erledigt -->
			<div class="flex justify-center py-2">
				<button
					onclick={() => onAddTask(list.id, 'Neue Aufgabe')}
					class="w-8 h-8 flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
					style="background: var(--tf-accent-gradient, var(--tf-accent)); color: white; box-shadow: 0 2px 8px rgba(0,0,0,.1);"
					title="Neue Aufgabe erstellen"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
				</button>
			</div>
		</div>

	{/if}
	</div>
</div>
