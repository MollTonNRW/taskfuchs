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
	 * Smart-Ansichten „Angepinnt" und „Dringend", nach Liste gruppiert.
	 *
	 * Die Zeilen sind dieselben wie in der Liste (Spezifikation Abschnitt 5),
	 * nur ohne ⋮ — auf der Pinnwand traegt keine Zeile ein Menue. Den
	 * endgueltigen Feinschliff der Pinnwand (Gruppenkopf, Sektionen) baut
	 * Task 10.
	 */
	let {
		aufgaben,
		lists,
		subtasksFor,
		mitnutzer = {},
		eigeneId = null,
		mobil = false,
		onToggle,
		onOpen,
		onContextMenu,
		leerText
	}: {
		aufgaben: Task[];
		lists: List[];
		subtasksFor: (taskId: string) => Task[];
		mitnutzer?: Record<string, Mitnutzer[]>;
		eigeneId?: string | null;
		mobil?: boolean;
		onToggle: (id: string) => void;
		onOpen: (task: Task) => void;
		onContextMenu: (e: Zeigerpunkt, task: Task) => void;
		leerText: string;
	} = $props();

	let gruppen = $derived.by(() => {
		const nachListe: Record<string, Task[]> = {};
		for (const t of aufgaben) {
			(nachListe[t.list_id] ??= []).push(t);
		}
		return lists
			.filter((l) => nachListe[l.id])
			.map((l) => ({ list: l, tasks: nachListe[l.id] }));
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

{#if gruppen.length === 0}
	<div class="tf-leer">
		<p>{leerText}</p>
	</div>
{:else}
	{#each gruppen as gruppe (gruppe.list.id)}
		<div class="tf-gruppe">
			<span class="em">{gruppe.list.icon}</span>
			{gruppe.list.title}
		</div>
		{#each gruppe.tasks as task (task.id)}
			<TaskRow
				{task}
				subtasks={subtasksFor(task.id)}
				subsOpen={subsOffen(task.id)}
				{mobil}
				ohneMenue
				herkunft={fremder(gruppe.list.id, task.user_id)}
				pinner={task.pinned ? fremder(gruppe.list.id, task.pinned_by) : null}
				{onToggle}
				onSelect={onOpen}
				onMenu={onContextMenu}
				onToggleSubs={() => subsUmschalten(task.id)}
				onToggleSubtask={onToggle}
			/>
		{/each}
	{/each}
{/if}
