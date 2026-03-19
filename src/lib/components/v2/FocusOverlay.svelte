<script lang="ts">
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';
	import SubtaskCard from './SubtaskCard.svelte';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		task,
		subtasks = [],
		onClose,
		onToggle,
		onUpdate,
		onChangePriority,
		onUpdateNote,
		onUpdateEmoji,
		onToggleSubtask,
		onUpdateSubtask,
		onAddSubtask
	}: {
		task: Task;
		subtasks: Task[];
		onClose: () => void;
		onToggle: (id: string) => void;
		onUpdate: (id: string, text: string) => void;
		onChangePriority: (id: string, priority: 'low' | 'normal' | 'high' | 'asap') => void;
		onUpdateNote: (id: string, note: string) => void;
		onUpdateEmoji: (id: string, emoji: string) => void;
		onToggleSubtask: (id: string) => void;
		onUpdateSubtask: (id: string, text: string) => void;
		onAddSubtask: (parentId: string, text: string) => void;
	} = $props();

	let editing = $state(false);
	let editText = $state('');
	let noteText = $state(task.note ?? '');
	let addingSubtask = $state(false);
	let newSubtaskText = $state('');
	let editInput: HTMLInputElement | undefined = $state();

	const priorityLabels: Record<string, string> = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', asap: 'ASAP!' };
	const priorityOrder: ('low' | 'normal' | 'high' | 'asap')[] = ['low', 'normal', 'high', 'asap'];

	function startEdit() {
		editText = task.text;
		editing = true;
		tick().then(() => editInput?.focus());
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function handleBackdropClick() {
		saveNote();
		onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Overlay -->
<div class="v2-focus-overlay" role="dialog" aria-label="Aufgabe bearbeiten">
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		style="position: absolute; inset: 0; z-index: -1;"
		onclick={handleBackdropClick}
	></div>

	<!-- Card -->
	<div class="v2-glass-card v2-focus-card">
		<!-- Close -->
		<button
			onclick={() => { saveNote(); onClose(); }}
			style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--v2-text-muted); font-size: .8rem; cursor: pointer;"
			aria-label="Schliessen"
		>
			&#x2715;
		</button>

		<!-- Emoji + Title -->
		<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
			<button
				onclick={() => onUpdateEmoji(task.id, '')}
				style="font-size: 1.5rem; background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); padding: 4px 8px; cursor: pointer;"
				title="Emoji aendern"
			>
				{task.emoji || '...'}
			</button>

			{#if editing}
				<input
					bind:this={editInput}
					bind:value={editText}
					class="v2-task-input"
					style="font-size: .9rem; font-weight: 700;"
					onblur={saveEdit}
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') editing = false; }}
					maxlength="500"
				/>
			{:else}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<h2
					style="font-size: .9rem; font-weight: 700; color: var(--v2-text); cursor: pointer; flex: 1;"
					ondblclick={startEdit}
				>
					{task.text}
				</h2>
			{/if}
		</div>

		<!-- Priority Selector -->
		<div style="display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap;">
			{#each priorityOrder as p}
				<button
					class="v2-badge"
					style="cursor: pointer; border: 1px dashed {task.priority === p ? 'var(--v2-accent)' : 'var(--v2-border)'}; background: {task.priority === p ? 'var(--v2-accent-glow)' : 'transparent'}; color: {task.priority === p ? 'var(--v2-accent)' : 'var(--v2-text-muted)'};"
					onclick={() => onChangePriority(task.id, p)}
				>
					{priorityLabels[p]}
				</button>
			{/each}
		</div>

		<!-- Checkbox -->
		<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
			<button
				class="v2-checkbox"
				class:checked={task.done}
				onclick={() => onToggle(task.id)}
			>
				{task.done ? '\u2713' : ''}
			</button>
			<span style="font-size: .72rem; color: var(--v2-text-secondary);">
				{task.done ? 'Erledigt' : 'Offen'}
			</span>
		</div>

		<!-- Note -->
		<div style="margin-bottom: 16px;">
			<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 6px;">Notiz</div>
			<textarea
				bind:value={noteText}
				onblur={saveNote}
				class="v2-task-input"
				style="width: 100%; min-height: 60px; resize: vertical; font-size: .72rem;"
				placeholder="Notiz eingeben..."
			></textarea>
		</div>

		<!-- Subtasks -->
		<div>
			<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 8px;">
				Unteraufgaben ({subtasks.length})
			</div>
			<div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;">
				{#each subtasks as sub (sub.id)}
					<SubtaskCard
						subtask={sub}
						ontoggle={onToggleSubtask}
						onedit={onUpdateSubtask}
					/>
				{/each}
			</div>

			<!-- Add subtask -->
			{#if addingSubtask}
				<div class="v2-quick-add">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						placeholder="Unteraufgabe..."
						bind:value={newSubtaskText}
						onkeydown={(e) => { if (e.key === 'Enter') handleAddSubtask(); if (e.key === 'Escape') addingSubtask = false; }}
						maxlength="500"
						autofocus
					/>
				</div>
			{:else}
				<button
					onclick={() => (addingSubtask = true)}
					style="font-size: .65rem; color: var(--v2-accent); background: none; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius); padding: 4px 10px; cursor: pointer;"
				>
					+ Unteraufgabe
				</button>
			{/if}
		</div>
	</div>
</div>
