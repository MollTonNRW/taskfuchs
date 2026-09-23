<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Mitnutzer } from '$lib/utils/mitnutzer';
	import type { Zeigerpunkt } from '$lib/composables/tf/useContextMenus.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { subtasksCollapsedByDefault } from '$lib/stores/filters';
	import { touchDragHandle, touchDropZone } from '$lib/actions/touchDrag';
	import QuickAdd from './QuickAdd.svelte';
	import TaskRow from './TaskRow.svelte';
	import DoneBar from './DoneBar.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	/**
	 * Die mittlere Spalte einer Liste — Spezifikation Abschnitt 5.
	 *
	 * Reihenfolge: Quick-Add, offene Aufgaben (mit Trennern), Erledigt-Balken,
	 * erledigte Aufgaben. Nachfolger von `components/v2/ListPanel.svelte`.
	 */
	let {
		list,
		tasks,
		mobil = false,
		selectedTaskId = null,
		beteiligte = [],
		zusatzProfile = {},
		eigeneId = null,
		istNeu,
		onQuickAdd,
		onToggleTask,
		onEditSubtask,
		onMenu,
		onSubMenu,
		onTaskOpen,
		onReorderTask,
		onReorderSubtask,
		onClearDone,
		bulkMode = false,
		bulkSelectedIds = new Set<string>(),
		onBulkToggle,
		quickAddVorgabe = '',
		menuOffenId = null
	}: {
		list: List;
		/** Alle Aufgaben der Liste, bereits sortiert (Unteraufgaben inbegriffen). */
		tasks: Task[];
		mobil?: boolean;
		selectedTaskId?: string | null;
		/** Beteiligte dieser Liste, fuer Herkunft und „gepinnt von". */
		beteiligte?: Mitnutzer[];
		/** Nachgeladene Profile fuer Personen, die RLS nicht als Beteiligte zeigt. */
		zusatzProfile?: Record<string, Mitnutzer>;
		eigeneId?: string | null;
		/** Kam diese Zeile von aussen herein und wurde noch nicht gesehen? */
		istNeu?: (id: string) => boolean;
		onQuickAdd: (listId: string, text: string) => void;
		onToggleTask: (id: string) => void;
		onEditSubtask: (id: string, text: string) => void;
		onMenu: (e: Zeigerpunkt, task: Task) => void;
		onSubMenu?: (e: Zeigerpunkt, subtask: Task) => void;
		onTaskOpen: (task: Task) => void;
		onReorderTask?: (taskId: string, targetListId: string, newPosition: number) => void;
		onReorderSubtask?: (subtaskId: string, parentId: string, newPosition: number) => void;
		onClearDone: (listId: string) => void;
		bulkMode?: boolean;
		bulkSelectedIds?: Set<string>;
		onBulkToggle?: (id: string) => void;
		/** Quick-Add aktiv mit diesem Text — nur die Vorschau-Route. */
		quickAddVorgabe?: string;
		/** Aufgabe, deren Menue gerade offen steht — ihr ⋮ bleibt sichtbar. */
		menuOffenId?: string | null;
	} = $props();

	// ------------------------------------------------------------------
	// Bestand
	// ------------------------------------------------------------------
	let offene = $derived(tasks.filter((t) => !t.parent_id && !t.done));
	let erledigte = $derived(tasks.filter((t) => !t.parent_id && t.done && t.type !== 'divider'));

	function unteraufgaben(taskId: string): Task[] {
		return tasks.filter((t) => t.parent_id === taskId).sort((a, b) => a.position - b.position);
	}

	let nachId = $derived(new Map(beteiligte.map((m) => [m.id, m])));
	/** Nur fremde Personen — der eigene Name steht nicht an der eigenen Zeile. */
	function fremder(id: string | null): Mitnutzer | null {
		if (!id || id === eigeneId) return null;
		const m = nachId.get(id);
		if (m) return m.ich ? null : m;
		// Bei einer fremden geteilten Liste zeigt `list_shares` nur Besitzer
		// und eigene Zeile. Alles Weitere kommt aus den nachgeladenen Profilen
		// — sonst fiele „gepinnt von Ingo" dort ersatzlos aus.
		return zusatzProfile[id] ?? null;
	}

	// ------------------------------------------------------------------
	// Unteraufgaben auf- und zuklappen
	// ------------------------------------------------------------------
	// Zwei Quellen: die Wahl an der einzelnen Zeile, sonst die Voreinstellung
	// aus den Einstellungen. Eine dritte kam bis T8 aus dem Listenmenue —
	// mit dessen Kuerzung auf sieben Eintraege hat sie keinen Sender mehr.
	const eigeneWahl = new SvelteMap<string, boolean>();
	let standardOffen = $derived(!$subtasksCollapsedByDefault);

	function subsOffen(id: string): boolean {
		return eigeneWahl.get(id) ?? standardOffen;
	}

	function subsUmschalten(id: string) {
		eigeneWahl.set(id, !subsOffen(id));
	}

	/**
	 * Der Erledigt-Bereich startet EINGEKLAPPT — so zeigen ihn alle Frames
	 * des Mockups (Chevron nach rechts, „Erledigt 8"), und so verlangt es
	 * Punkt 8 der Checkliste in kernfunktionen.md. Die offenen Aufgaben
	 * sollen den Schirm tragen, nicht die abgehakten.
	 */
	let erledigtOffen = $state(false);

	// ------------------------------------------------------------------
	// Umsortieren — HTML5-Drag (Zeigergeraet) und touchDrag (Finger)
	// ------------------------------------------------------------------
	let zielIndex: number | null = $state(null);
	let ziehId: string | null = $state(null);

	function ziehStart(e: DragEvent, task: Task) {
		if (!e.dataTransfer) return;
		ziehId = task.id;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: task.id, sourceListId: list.id }));
	}

	function ziehEnde() {
		ziehId = null;
		zielIndex = null;
	}

	function ziehUeber(e: DragEvent, idx: number) {
		if (!onReorderTask) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		zielIndex = e.clientY > rect.top + rect.height / 2 ? idx + 1 : idx;
	}

	function fallen(e: DragEvent, idx: number) {
		e.preventDefault();
		const ziel = zielIndex ?? idx;
		ziehEnde();
		if (!e.dataTransfer || !onReorderTask) return;
		try {
			const daten = JSON.parse(e.dataTransfer.getData('text/plain')) as { taskId?: string };
			if (daten.taskId) onReorderTask(daten.taskId, list.id, ziel);
		} catch {
			/* unbrauchbare Zugdaten */
		}
	}

	function endeUeber(e: DragEvent) {
		if (!onReorderTask) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		zielIndex = offene.length;
	}

	function endeFallen(e: DragEvent) {
		fallen(e, offene.length);
	}

	/** Einfuegestelle aus einer Bildschirmhoehe bestimmen (Finger-Variante). */
	function stelleAus(behaelter: Element, y: number): number {
		const zeilen = behaelter.querySelectorAll('.tf-rowwrap, .tf-divider');
		for (let i = 0; i < zeilen.length; i++) {
			const rect = zeilen[i].getBoundingClientRect();
			if (y < rect.top + rect.height / 2) return i;
		}
		return offene.length;
	}

	function fingerUeber(el: HTMLElement, _x: number, y: number) {
		zielIndex = stelleAus(el, y);
	}

	function fingerRaus() {
		zielIndex = null;
	}

	function fingerFallen(daten: unknown, el: HTMLElement, _x: number, y: number) {
		zielIndex = null;
		ziehId = null;
		if (!onReorderTask || !daten) return;
		const { taskId } = daten as { taskId?: string };
		if (!taskId) return;
		onReorderTask(taskId, list.id, stelleAus(el, y));
	}
</script>

<QuickAdd listId={list.id} {mobil} vorgabe={quickAddVorgabe} onAdd={onQuickAdd} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="tf-rows"
	data-list-drop={list.id}
	use:touchDropZone={{
		type: 'task',
		onDragOver: fingerUeber,
		onDragLeave: fingerRaus,
		onDrop: fingerFallen
	}}
>
	{#each offene as task, idx (task.id)}
		{#if task.type === 'divider'}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="tf-divider"
				class:ziel-oben={zielIndex === idx}
				class:ziel-unten={zielIndex === idx + 1}
				ondragover={(e) => ziehUeber(e, idx)}
				ondrop={(e) => fallen(e, idx)}
			>
				<span class="li"></span>
				<span class="lbl">{task.text}</span>
				<span class="li"></span>
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="tf-rowwrap"
				class:zieht={ziehId === task.id}
				class:ziel-oben={zielIndex === idx}
				class:ziel-unten={zielIndex === idx + 1}
				draggable={onReorderTask ? 'true' : 'false'}
				ondragstart={(e) => ziehStart(e, task)}
				ondragend={ziehEnde}
				ondragover={(e) => ziehUeber(e, idx)}
				ondrop={(e) => fallen(e, idx)}
				use:touchDragHandle={{
					data: { taskId: task.id, sourceListId: list.id },
					type: 'task',
					onStart: () => (ziehId = task.id),
					onEnd: ziehEnde
				}}
			>
				<TaskRow
					{task}
					subtasks={unteraufgaben(task.id)}
					selected={selectedTaskId === task.id}
					neu={istNeu?.(task.id) ?? false}
					subsOpen={subsOffen(task.id)}
					menuOffen={menuOffenId === task.id}
					{mobil}
					{bulkMode}
					bulkSelected={bulkSelectedIds.has(task.id)}
					herkunft={fremder(task.user_id)}
					pinner={task.pinned ? fremder(task.pinned_by) : null}
					onToggle={onToggleTask}
					onSelect={onTaskOpen}
					{onMenu}
					onToggleSubs={() => subsUmschalten(task.id)}
					onToggleSubtask={onToggleTask}
					{onEditSubtask}
					{onSubMenu}
					{onReorderSubtask}
					{onBulkToggle}
				/>
			</div>
		{/if}
	{/each}

	<!-- Ablage am Ende der Liste -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="tf-dropend"
		class:an={zielIndex === offene.length}
		ondragover={endeUeber}
		ondragleave={() => {
			if (zielIndex === offene.length) zielIndex = null;
		}}
		ondrop={endeFallen}
	></div>
</div>

<DoneBar
	anzahl={erledigte.length}
	offen={erledigtOffen}
	{mobil}
	onToggle={() => (erledigtOffen = !erledigtOffen)}
	onClear={() => onClearDone(list.id)}
/>

{#if erledigtOffen}
	{#each erledigte as task (task.id)}
		<TaskRow
			{task}
			subtasks={unteraufgaben(task.id)}
			selected={selectedTaskId === task.id}
			subsOpen={subsOffen(task.id)}
			menuOffen={menuOffenId === task.id}
			{mobil}
			{bulkMode}
			bulkSelected={bulkSelectedIds.has(task.id)}
			herkunft={fremder(task.user_id)}
			onToggle={onToggleTask}
			onSelect={onTaskOpen}
			{onMenu}
			onToggleSubs={() => subsUmschalten(task.id)}
			onToggleSubtask={onToggleTask}
			{onEditSubtask}
			{onSubMenu}
			{onBulkToggle}
		/>
	{/each}
{/if}
