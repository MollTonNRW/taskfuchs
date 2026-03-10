<script lang="ts">
	import type { Database } from '$lib/types/database';
	import SubtaskItem from './SubtaskItem.svelte';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		task,
		subtasks = [],
		onToggle,
		onUpdate,
		onDelete,
		onAddSubtask,
		onToggleSubtask,
		onUpdateSubtask,
		onDeleteSubtask
	}: {
		task: Task;
		subtasks: Task[];
		onToggle: (id: string, done: boolean) => void;
		onUpdate: (id: string, text: string) => void;
		onDelete: (id: string) => void;
		onAddSubtask: (parentId: string, text: string) => void;
		onToggleSubtask: (id: string, done: boolean) => void;
		onUpdateSubtask: (id: string, text: string) => void;
		onDeleteSubtask: (id: string) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let subtasksOpen = $state(false);
	let addingSubtask = $state(false);
	let newSubtaskText = $state('');
	let menuOpen = $state(false);
	let animating = $state(false);
	let animClass = $state('');

	const priorityColors: Record<string, string> = {
		low: 'bg-base-content/20',
		normal: 'bg-info',
		high: 'bg-warning',
		asap: 'bg-error'
	};

	let subtaskCount = $derived(subtasks.length);
	let subtasksDone = $derived(subtasks.filter((s) => s.done).length);

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
		if (e.key === 'Enter') {
			e.preventDefault();
			saveEdit();
		}
		if (e.key === 'Escape') {
			editing = false;
		}
	}

	function handleToggle() {
		animClass = 'task-check';
		animating = true;
		onToggle(task.id, !task.done);
		setTimeout(() => {
			animating = false;
			animClass = '';
		}, 400);
	}

	function handleDelete() {
		animClass = 'task-exit';
		animating = true;
		setTimeout(() => {
			onDelete(task.id);
		}, 300);
	}

	function handleAddSubtask() {
		const trimmed = newSubtaskText.trim();
		if (!trimmed) return;
		onAddSubtask(task.id, trimmed);
		newSubtaskText = '';
		addingSubtask = false;
	}

	function handleSubtaskKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddSubtask();
		}
		if (e.key === 'Escape') {
			addingSubtask = false;
			newSubtaskText = '';
		}
	}
</script>

<div
	class="task-enter {animClass} {task.priority === 'asap' ? 'asap-blink' : ''} {task.highlighted ? 'highlighted' : ''}"
>
	<div class="flex items-start gap-2 p-3 rounded-xl bg-base-200/50 border border-base-300/50 hover:bg-base-200 transition-all group">
		<!-- Priority Bar -->
		<div class="w-1 self-stretch rounded-full {priorityColors[task.priority]} flex-shrink-0"></div>

		<!-- Checkbox -->
		<input
			type="checkbox"
			class="checkbox checkbox-sm checkbox-primary mt-0.5"
			checked={task.done}
			onchange={handleToggle}
		/>

		<!-- Content -->
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2">
				{#if task.emoji}
					<span class="text-sm">{task.emoji}</span>
				{/if}

				{#if editing}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={editText}
						onblur={saveEdit}
						onkeydown={handleEditKeydown}
						class="input input-sm input-ghost flex-1 px-1"
						autofocus
					/>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<span
						class="text-sm flex-1 cursor-default {task.done ? 'line-through text-base-content/40' : ''}"
						ondblclick={startEdit}
					>
						{task.text}
					</span>
				{/if}
			</div>

			<!-- Badges -->
			{#if task.timeframe || task.due_date}
				<div class="flex items-center gap-1.5 mt-1">
					{#if task.timeframe}
						<span class="badge badge-xs badge-outline">{task.timeframe}</span>
					{/if}
					{#if task.due_date}
						<span class="badge badge-xs badge-ghost">
							<svg class="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							{task.due_date}
						</span>
					{/if}
				</div>
			{/if}

			<!-- Subtasks Toggle -->
			{#if subtaskCount > 0}
				<button
					onclick={() => (subtasksOpen = !subtasksOpen)}
					class="flex items-center gap-1 mt-1.5 text-xs text-base-content/50 hover:text-base-content/70 transition-colors"
				>
					<svg class="w-3 h-3 transition-transform {subtasksOpen ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
					{subtasksDone}/{subtaskCount} Unteraufgaben
				</button>
			{/if}

			<!-- Subtasks List -->
			{#if subtasksOpen && subtaskCount > 0}
				<div class="mt-2 ml-1 pl-3 border-l-2 border-base-300 space-y-0.5">
					{#each subtasks as sub (sub.id)}
						<SubtaskItem
							subtask={sub}
							onToggle={onToggleSubtask}
							onUpdate={onUpdateSubtask}
							onDelete={onDeleteSubtask}
						/>
					{/each}
				</div>
			{/if}

			<!-- Add Subtask Input -->
			{#if addingSubtask}
				<div class="mt-2 ml-1 pl-3 border-l-2 border-base-300">
					<div class="flex gap-1.5">
						<!-- svelte-ignore a11y_autofocus -->
						<input
							type="text"
							bind:value={newSubtaskText}
							placeholder="Unteraufgabe..."
							class="input input-xs input-bordered flex-1"
							onkeydown={handleSubtaskKeydown}
							onblur={() => { if (!newSubtaskText.trim()) addingSubtask = false; }}
							autofocus
						/>
						<button onclick={handleAddSubtask} class="btn btn-xs btn-primary" disabled={!newSubtaskText.trim()} aria-label="Unteraufgabe hinzufuegen">
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- More Menu -->
		<div class="relative">
			<button
				onclick={() => (menuOpen = !menuOpen)}
				class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
				aria-label="Mehr Optionen"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01" />
				</svg>
			</button>

			{#if menuOpen}
				<!-- Backdrop -->
				<div class="fixed inset-0 z-40" onclick={() => (menuOpen = false)} role="presentation"></div>
				<!-- Menu -->
				<div class="absolute right-0 top-8 z-50 w-48 bg-base-100 rounded-xl shadow-xl border border-base-300 p-1.5 animate-in">
					<button
						onclick={() => { startEdit(); menuOpen = false; }}
						class="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-base-200 transition-colors"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
						Bearbeiten
					</button>
					<button
						onclick={() => { addingSubtask = true; subtasksOpen = true; menuOpen = false; }}
						class="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-base-200 transition-colors"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
						Unteraufgabe
					</button>
					<div class="divider my-1 h-px"></div>
					<button
						onclick={() => { handleDelete(); menuOpen = false; }}
						class="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-error/10 text-error transition-colors"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						Loeschen
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
