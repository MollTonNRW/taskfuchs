<script lang="ts">
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';
	import SubtaskCard from './SubtaskCard.svelte';
	import {
		priorityLabels,
		priorityOrder,
		timeframeLabels,
		timeframeOrder
	} from '$lib/constants';

	type Task = Database['public']['Tables']['tasks']['Row'];

	let {
		task,
		subtasks = [],
		eingebettet = false,
		onClose,
		onToggle,
		onUpdate,
		onChangePriority,
		onChangeTimeframe,
		onUpdateNote,
		onOpenEmojiPicker,
		onToggleSubtask,
		onUpdateSubtask,
		onAddSubtask
	}: {
		task: Task;
		subtasks: Task[];
		/**
		 * `true` = Inhalt fuer die Detail-SPALTE (Desktop): ohne Scrim, ohne
		 * position:fixed, ohne Klick-daneben und ohne eigenes Escape. Sonst
		 * wuerde auf dem Desktop jeder Klick neben der Spalte das Detail
		 * schliessen. `false` = die bisherige Huelle (mobiles Overlay).
		 * Die endgueltige Trennung in TaskDetail/DetailSheet macht Task 7.
		 */
		eingebettet?: boolean;
		onClose: () => void;
		onToggle: (id: string) => void;
		onUpdate: (id: string, text: string) => void;
		onChangePriority: (id: string, priority: 'low' | 'normal' | 'high' | 'asap') => void;
		onChangeTimeframe: (id: string, timeframe: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null) => void;
		onUpdateNote: (id: string, note: string) => void;
		onOpenEmojiPicker: (taskId: string, x: number, y: number) => void;
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
		// In der Spalte gehoert Escape der Seite (sie hebt die Auswahl auf).
		if (eingebettet) return;
		if (e.key === 'Escape') {
			e.stopPropagation();
			onClose();
		}
	}

	function handleBackdropClick() {
		saveNote();
		onClose();
	}

	// Beim Wechsel der Auswahl wird diese Instanz zerstoert (die Spalte steht
	// unter {#key}). Eine noch nicht gespeicherte Notiz darf dabei nicht
	// verloren gehen — blur allein greift nicht, wenn der Fokus woanders liegt.
	$effect(() => {
		return () => {
			if (noteText !== (task.note ?? '')) onUpdateNote(task.id, noteText);
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!--
	Inhalt des Details. Er wird zweimal gerendert: eingebettet in die
	Detail-Spalte (Desktop) und in der bisherigen Overlay-Huelle (Mobile).
-->
{#snippet inhalt()}
		<!-- Emoji + Title -->
		<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
			<button
				onclick={(e) => onOpenEmojiPicker(task.id, e.clientX, e.clientY)}
				style="font-size: 1.5rem; background: none; border: 1px solid var(--line); border-radius: var(--v2-radius); padding: 4px 8px; cursor: pointer;"
				title="Emoji ändern"
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
				<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
				<h2
					style="font-size: .9rem; font-weight: 700; color: var(--ink); cursor: pointer; flex: 1;"
					onclick={startEdit}
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
					style="cursor: pointer; border: 1px solid {task.priority === p ? 'var(--accent)' : 'var(--line)'}; background: {task.priority === p ? 'var(--accent-glow)' : 'transparent'}; color: {task.priority === p ? 'var(--accent)' : 'var(--ink-3)'};"
					onclick={() => onChangePriority(task.id, p)}
				>
					{priorityLabels[p]}
				</button>
			{/each}
		</div>

		<!-- Timeframe Selector -->
		<div style="margin-bottom: 16px;">
			<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--ink-3); margin-bottom: 6px;">Zeitrahmen</div>
			<div style="display: flex; gap: 6px; flex-wrap: wrap;">
				<button
					class="v2-badge"
					style="cursor: pointer; border: 1px solid {!task.timeframe ? 'var(--accent)' : 'var(--line)'}; background: {!task.timeframe ? 'var(--accent-glow)' : 'transparent'}; color: {!task.timeframe ? 'var(--accent)' : 'var(--ink-3)'};"
					onclick={() => onChangeTimeframe(task.id, null)}
				>
					Keiner
				</button>
				{#each timeframeOrder as tf}
					<button
						class="v2-badge"
						style="cursor: pointer; border: 1px solid {task.timeframe === tf ? 'var(--accent)' : 'var(--line)'}; background: {task.timeframe === tf ? 'var(--accent-glow)' : 'transparent'}; color: {task.timeframe === tf ? 'var(--accent)' : 'var(--ink-3)'};"
						onclick={() => onChangeTimeframe(task.id, tf)}
					>
						{timeframeLabels[tf]}
					</button>
				{/each}
			</div>
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
			<span style="font-size: .72rem; color: var(--ink-2);">
				{task.done ? 'Erledigt' : 'Offen'}
			</span>
		</div>

		<!-- Note -->
		<div style="margin-bottom: 16px;">
			<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--ink-3); margin-bottom: 6px;">Notiz</div>
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
			<div style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--ink-3); margin-bottom: 8px;">
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
					style="font-size: .65rem; color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--v2-radius); padding: 4px 10px; cursor: pointer;"
				>
					+ Unteraufgabe
				</button>
			{/if}
		</div>
{/snippet}

{#if eingebettet}
	<!-- Detail-SPALTE: kein Scrim, kein position:fixed, kein Klick daneben. -->
	<div class="tf-detail-body">
		{@render inhalt()}
	</div>
{:else}
	<div class="v2-focus-overlay" role="dialog" aria-label="Aufgabe bearbeiten">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div style="position: absolute; inset: 0; z-index: -1;" onclick={handleBackdropClick}></div>

		<div class="v2-glass-card v2-focus-card">
			<button
				onclick={() => { saveNote(); onClose(); }}
				style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--ink-3); font-size: .8rem; cursor: pointer;"
				aria-label="Schließen"
			>
				&#x2715;
			</button>
			{@render inhalt()}
		</div>
	</div>
{/if}
