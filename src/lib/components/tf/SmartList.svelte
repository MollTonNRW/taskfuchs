<script lang="ts">
	import type { Database } from '$lib/types/database';
	import TaskCard from '$lib/components/v2/TaskCard.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	/**
	 * Smart-Ansichten „Angepinnt" und „Dringend", nach Liste gruppiert.
	 *
	 * UEBERGANG: Die endgueltige Fassung (Gruppenkopf, „gepinnt von"-Chip,
	 * Zeilen nach Spezifikation Abschnitt 5) baut Task 10 als `PinnedView`.
	 * Hier steht nur so viel, dass die beiden Eintraege der Navigationsspalte
	 * ab sofort etwas Sinnvolles zeigen — bisher war ein Pin auf dem Desktop
	 * nur ueber die alte Pinnwand erreichbar, und die ist mit der Shell weg.
	 */
	let {
		aufgaben,
		lists,
		subtasksFor,
		onToggle,
		onOpen,
		onContextMenu,
		leerText
	}: {
		aufgaben: Task[];
		lists: List[];
		subtasksFor: (taskId: string) => Task[];
		onToggle: (id: string) => void;
		onOpen: (task: Task) => void;
		onContextMenu: (e: MouseEvent, task: Task) => void;
		leerText: string;
	} = $props();

	let gruppen = $derived.by(() => {
		const nachListe = new Map<string, Task[]>();
		for (const t of aufgaben) {
			const bestand = nachListe.get(t.list_id);
			if (bestand) bestand.push(t);
			else nachListe.set(t.list_id, [t]);
		}
		return lists
			.filter((l) => nachListe.has(l.id))
			.map((l) => ({ list: l, tasks: nachListe.get(l.id)! }));
	});
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
			{@const subs = subtasksFor(task.id)}
			<TaskCard
				{task}
				subtasks={subs}
				subtaskCount={subs.length}
				subtaskDoneCount={subs.filter((s) => s.done).length}
				ontoggle={onToggle}
				ontogglesubtask={onToggle}
				onopen={onOpen}
				oncontextmenu={onContextMenu}
			/>
		{/each}
	{/each}
{/if}
