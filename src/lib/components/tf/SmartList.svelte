<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Mitnutzer } from '$lib/utils/mitnutzer';
	import type { Zeigerpunkt } from '$lib/composables/v2/useContextMenus.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { subtasksCollapsedByDefault } from '$lib/stores/filters';
	import TaskRow from './TaskRow.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	/**
	 * Pinnwand und Dringend — A-klar-spec.md, Abschnitt 6 („Pinnwand").
	 *
	 * Beide Smart-Ansichten teilen sich diese Darstellung: nach Liste
	 * gruppiert, Gruppenkopf `.tf-pinh` mit Listen-Emoji und Namen, darunter
	 * die normalen Aufgabenzeilen aus Abschnitt 5 — mit Prioritaetsbalken,
	 * Pin-Icon im Titel und Chip „gepinnt von …" bei fremden Pins.
	 *
	 * Zwei Unterschiede zur Liste, beide aus der Spezifikation:
	 * - **Kein ⋮ in den Zeilen.** Am Zeiger bleibt der Rechtsklick, am Finger
	 *   das lange Tippen — die Zeile traegt nur keinen sichtbaren Knopf.
	 * - **Kein Quick-Add, kein Erledigt-Balken.** Beides gehoert zu genau
	 *   einer Liste; die Pinnwand steht quer ueber allen.
	 *
	 * Die Gruppen folgen der Reihenfolge der Navigationsspalte, die Zeilen
	 * innerhalb einer Gruppe der Reihenfolge ihrer Liste (`position`) — nicht
	 * der Zufallsreihenfolge des Bestands, in der sie bis T9 standen.
	 */
	let {
		aufgaben,
		lists,
		subtasksFor,
		mitnutzer = {},
		eigeneId = null,
		mobil = false,
		selectedTaskId = null,
		bulkMode = false,
		bulkSelectedIds = new Set<string>(),
		onToggle,
		onOpen,
		onContextMenu,
		onBulkToggle,
		leerText
	}: {
		aufgaben: Task[];
		lists: List[];
		subtasksFor: (taskId: string) => Task[];
		mitnutzer?: Record<string, Mitnutzer[]>;
		eigeneId?: string | null;
		mobil?: boolean;
		/** Offenes Detail: die Zeile traegt `.sel` wie in der Liste. */
		selectedTaskId?: string | null;
		bulkMode?: boolean;
		bulkSelectedIds?: Set<string>;
		onToggle: (id: string) => void;
		onOpen: (task: Task) => void;
		onContextMenu: (e: Zeigerpunkt, task: Task) => void;
		onBulkToggle?: (id: string) => void;
		leerText: string;
	} = $props();

	let gruppen = $derived.by(() => {
		const nachListe: Record<string, Task[]> = {};
		for (const t of aufgaben) {
			(nachListe[t.list_id] ??= []).push(t);
		}
		return lists
			.filter((l) => nachListe[l.id])
			.map((l) => ({
				list: l,
				tasks: [...nachListe[l.id]].sort((a, b) => a.position - b.position)
			}));
	});

	const eigeneWahl = new SvelteMap<string, boolean>();
	let standardOffen = $derived(!$subtasksCollapsedByDefault);

	function subsOffen(id: string): boolean {
		return eigeneWahl.get(id) ?? standardOffen;
	}

	function subsUmschalten(id: string) {
		eigeneWahl.set(id, !subsOffen(id));
	}

	/** „gepinnt von" und die Herkunft zeigen nur fremde Personen. */
	function fremder(listId: string, id: string | null): Mitnutzer | null {
		if (!id || id === eigeneId) return null;
		const m = (mitnutzer[listId] ?? []).find((p) => p.id === id);
		return m && !m.ich ? m : null;
	}
</script>

<div class="tf-pinnwand">
	{#if gruppen.length === 0}
		<div class="tf-leer">
			<p>{leerText}</p>
		</div>
	{:else}
		{#each gruppen as gruppe (gruppe.list.id)}
			<div class="tf-pinh">
				<span class="em">{gruppe.list.icon}</span>
				{gruppe.list.title}
			</div>
			{#each gruppe.tasks as task (task.id)}
				<TaskRow
					{task}
					subtasks={subtasksFor(task.id)}
					selected={selectedTaskId === task.id}
					subsOpen={subsOffen(task.id)}
					{mobil}
					ohneMenue
					{bulkMode}
					bulkSelected={bulkSelectedIds.has(task.id)}
					herkunft={fremder(gruppe.list.id, task.user_id)}
					pinner={task.pinned ? fremder(gruppe.list.id, task.pinned_by) : null}
					{onToggle}
					onSelect={onOpen}
					onMenu={onContextMenu}
					onToggleSubs={() => subsUmschalten(task.id)}
					onToggleSubtask={onToggle}
					{onBulkToggle}
				/>
			{/each}
		{/each}
	{/if}
</div>
