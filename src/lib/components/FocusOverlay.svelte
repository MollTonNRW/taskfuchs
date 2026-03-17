<script lang="ts">
	import type { Database } from '$lib/types/database';
	import SubtaskItem from './SubtaskItem.svelte';
	import EmojiPicker from './EmojiPicker.svelte';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		task,
		allTasks = [],
		onClose,
		onToggle,
		onUpdate,
		onDelete,
		onChangePriority,
		onToggleHighlight,
		onTogglePin,
		onUpdateNote,
		onUpdateEmoji,
		onToggleSubtask,
		onUpdateSubtask,
		onDeleteSubtask,
		onAddSubtask,
		onTaskContext
	}: {
		task: Task;
		allTasks: Task[];
		onClose: () => void;
		onToggle: (id: string, done: boolean) => void;
		onUpdate: (id: string, text: string) => void;
		onDelete: (id: string) => void;
		onChangePriority: (id: string, priority: 'low' | 'normal' | 'high' | 'asap') => void;
		onToggleHighlight: (id: string) => void;
		onTogglePin: (id: string) => void;
		onUpdateNote: (id: string, note: string) => void;
		onUpdateEmoji: (id: string, emoji: string) => void;
		onToggleSubtask: (id: string, done: boolean) => void;
		onUpdateSubtask: (id: string, text: string) => void;
		onDeleteSubtask: (id: string) => void;
		onAddSubtask: (parentId: string, text: string) => void;
		onTaskContext?: (e: MouseEvent, task: Task) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let noteText = $state(task.note ?? '');
	let addingSubtask = $state(false);
	let newSubtaskText = $state('');

	let subtasks = $derived(allTasks.filter((t) => t.parent_id === task.id));

	const priorityLabels: Record<string, string> = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', asap: 'ASAP!' };
	const priorityColors: Record<string, string> = { low: '#22c55e', normal: '#eab308', high: '#ef4444', asap: '#dc2626' };
	const priorityOrder: ('low' | 'normal' | 'high' | 'asap')[] = ['low', 'normal', 'high', 'asap'];

	function startEdit() {
		editText = task.text;
		editing = true;
	}

	function saveEdit() {
		const trimmed = editText.trim();
		if (trimmed && trimmed !== task.text) onUpdate(task.id, trimmed);
		editing = false;
	}

	function saveNote() {
		onUpdateNote(task.id, noteText);
	}

	function handleAddSubtask() {
		const trimmed = newSubtaskText.trim();
		if (!trimmed) return;
		onAddSubtask(task.id, trimmed);
		newSubtaskText = '';
	}

	// Emoji Picker
	let emojiPickerState = $state<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });

	function openEmojiPicker(e: MouseEvent) {
		emojiPickerState = { show: true, x: e.clientX, y: e.clientY };
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (emojiPickerState.show) { emojiPickerState = { ...emojiPickerState, show: false }; return; }
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Overlay -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="focus-overlay"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
	<!-- Card -->
	<div
		class="focus-card rounded-2xl p-6 tf-surface border"
		style="border-color: var(--tf-border); box-shadow: 0 25px 80px rgba(0,0,0,.2);"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-3">
				<div class="w-3 rounded-full" style="background: {priorityColors[task.priority]}; height: 32px;"></div>
				{#if task.emoji}
					<span class="text-2xl">{task.emoji}</span>
				{/if}
			</div>
			<div class="flex items-center gap-1">
				{#if onTaskContext}
					<button
						onclick={(e) => onTaskContext(e, task)}
						class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors tf-text-muted"
						aria-label="Kontextmenü öffnen"
					>
						<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
					</button>
				{/if}
				<button
					onclick={onClose}
					class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors tf-text-muted"
					aria-label="Schliessen"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</div>
		</div>

		<!-- Title (Single-Click to edit) -->
		{#if editing}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				bind:value={editText}
				onblur={saveEdit}
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') { editing = false; } }}
				class="inline-edit-title text-xl font-semibold w-full mb-4"
				style="border-bottom: 2px solid var(--tf-accent, #f97316); padding-bottom: 4px;"
				maxlength="500"
				autofocus
			/>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<h2
				class="focus-overlay-title text-xl font-semibold tf-text mb-4 {task.done ? 'line-through opacity-40' : ''}"
				onclick={startEdit}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(); } }}
				role="button"
				tabindex="0"
				title="Klicken zum Bearbeiten"
			>
				<span>{task.text}</span>
				<svg class="focus-overlay-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
			</h2>
		{/if}

		<!-- Meta Row -->
		<div class="flex flex-wrap items-center gap-2 mb-5">
			<!-- Checkbox -->
			<label class="custom-checkbox" style="width: 20px; height: 20px;">
				<input type="checkbox" checked={task.done} onchange={() => onToggle(task.id, !task.done)} />
				<span class="checkmark"></span>
			</label>
			<span class="text-sm tf-text-muted">{task.done ? 'Erledigt' : 'Offen'}</span>

			<div class="w-px h-4 mx-1" style="background: var(--tf-border);"></div>

			<!-- Priority -->
			<div class="flex gap-1">
				{#each priorityOrder as p}
					<button
						onclick={() => onChangePriority(task.id, p)}
						class="text-[10px] font-medium px-2 py-0.5 rounded-md transition-all cursor-pointer"
						style={task.priority === p ? `background: ${priorityColors[p]}; color: white;` : `color: ${priorityColors[p]}; opacity: 0.5;`}
					>
						{priorityLabels[p]}
					</button>
				{/each}
			</div>

			</div>

		<!-- Quick Actions -->
		<div class="flex gap-2 mb-5">
			<button
				onclick={() => onToggleHighlight(task.id)}
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
				style={task.highlighted ? 'background: rgba(251,146,60,.15); color: #f97316;' : 'background: var(--tf-surface-hover);'}
			>
				<svg class="w-3.5 h-3.5" fill={task.highlighted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
				{task.highlighted ? 'Fixiert' : 'Fixieren'}
			</button>
			<button
				onclick={() => onTogglePin(task.id)}
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
				style={task.pinned ? 'background: rgba(251,146,60,.15); color: #f97316;' : 'background: var(--tf-surface-hover);'}
			>
				<svg class="w-3.5 h-3.5" fill={task.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
				{task.pinned ? 'Angepinnt' : 'Anpinnen'}
			</button>
			<button
				onclick={openEmojiPicker}
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
				style={task.emoji ? 'background: rgba(251,146,60,.15); color: #f97316;' : 'background: var(--tf-surface-hover);'}
			>
				<span class="text-sm">{task.emoji || '😊'}</span>
				{task.emoji ? 'Symbol ändern' : 'Symbol'}
			</button>
			<button
				onclick={() => { onDelete(task.id); onClose(); }}
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 transition-colors ml-auto"
				style="background: var(--tf-surface-hover);"
			>
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
				Löschen
			</button>
		</div>

		<!-- Due Date -->
		{#if task.due_date}
			<div class="flex items-center gap-2 mb-4 text-sm tf-text-muted">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
				Fällig: {task.due_date}
			</div>
		{/if}

		<!-- Note -->
		<div class="mb-5">
			<h3 class="text-xs font-semibold uppercase tracking-wider tf-text-muted mb-2">Notiz</h3>
			<textarea
				bind:value={noteText}
				onblur={saveNote}
				placeholder="Notiz hinzufügen..."
				class="tf-input w-full px-3 py-2 text-sm rounded-xl border resize-none"
				rows="3"
			></textarea>
		</div>

		<!-- Subtasks -->
		<div>
			<div class="flex items-center justify-between mb-2">
				<h3 class="text-xs font-semibold uppercase tracking-wider tf-text-muted">
					Unteraufgaben ({subtasks.filter(s => s.done).length}/{subtasks.length})
				</h3>
				<button
					onclick={() => (addingSubtask = true)}
					class="text-xs font-medium px-2 py-0.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
					style="color: var(--tf-accent);"
				>
					+ Hinzufügen
				</button>
			</div>

			{#if subtasks.length > 0}
				<div class="space-y-0.5 pl-1" style="border-left: 2px solid var(--tf-border);">
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

			{#if addingSubtask}
				<div class="flex gap-1.5 mt-2 pl-3" style="border-left: 2px solid var(--tf-border);">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						bind:value={newSubtaskText}
						placeholder="Neue Unteraufgabe..."
						class="tf-input flex-1 px-3 py-1.5 text-xs rounded-lg border"
						maxlength="500"
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } if (e.key === 'Escape') { addingSubtask = false; newSubtaskText = ''; } }}
						onblur={() => { if (!newSubtaskText.trim()) addingSubtask = false; }}
						autofocus
					/>
					<button
						onclick={handleAddSubtask}
						class="px-2.5 py-1.5 text-white text-xs rounded-lg"
						style="background: var(--tf-accent);"
						disabled={!newSubtaskText.trim()}
					>
						<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
					</button>
				</div>
			{/if}
		</div>
	</div>

	{#if emojiPickerState.show}
		<EmojiPicker
			x={emojiPickerState.x}
			y={emojiPickerState.y}
			onSelect={(emoji) => onUpdateEmoji(task.id, emoji)}
			onClose={() => (emojiPickerState = { ...emojiPickerState, show: false })}
		/>
	{/if}
</div>
