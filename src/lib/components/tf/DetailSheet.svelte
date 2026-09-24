<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Priority, Timeframe } from '$lib/constants';
	import type { Zeigerpunkt } from '$lib/composables/tf/useContextMenus.svelte';
	import TaskDetail from './TaskDetail.svelte';
	import type { VerlaufAnbindung } from './TaskHistory.svelte';

	type Task = Database['public']['Tables']['tasks']['Row'];
	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Mobile Huelle des Aufgabendetails — Spezifikation Abschnitt 4,
	 * „Bottom-Sheet (Detail)": Scrim ueber dem ganzen Schirm, darueber das
	 * Sheet mit festem Rand oben (die Liste bleibt sichtbar), Radius 22 oben,
	 * Griff 36 x 5. Den Inhalt macht `TaskDetail`.
	 *
	 * Der Scrim schliesst das Sheet — anders als in der Detail-SPALTE, wo
	 * ein Klick daneben nichts tut.
	 */
	let {
		task,
		subtasks = [],
		liste = null,
		listen = [],
		onSchliessen,
		onToggle,
		onUmbenennen,
		onPrioritaet,
		onZeitrahmen,
		onFaellig,
		onNotiz,
		onPin,
		onVerschieben,
		onLoeschen,
		onUnterToggle,
		onUnterUmbenennen,
		onUnterLoeschen,
		onUnterNeu,
		onMenue,
		verlauf = null
	}: {
		task: Task;
		subtasks?: Task[];
		liste?: List | null;
		listen?: List[];
		onSchliessen: () => void;
		onToggle: (id: string) => void;
		onUmbenennen: (id: string, text: string) => void;
		onPrioritaet: (id: string, p: Priority) => void;
		onZeitrahmen: (id: string, tf: Timeframe | null) => void;
		onFaellig: (id: string, wert: string | null) => void;
		onNotiz: (id: string, note: string) => void;
		onPin: (id: string) => void;
		onVerschieben: (id: string, listId: string) => void;
		onLoeschen: (id: string) => void;
		onUnterToggle: (id: string) => void;
		onUnterUmbenennen: (id: string, text: string) => void;
		onUnterLoeschen: (id: string) => void;
		onUnterNeu: (parentId: string, text: string) => void;
		onMenue?: (e: Zeigerpunkt, task: Task) => void;
		verlauf?: VerlaufAnbindung | null;
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="tf-scrim" onclick={onSchliessen}></div>

<div class="tf-sheet" role="dialog" aria-modal="true" aria-label="Aufgabendetail">
	<span class="tf-handle"></span>
	<TaskDetail
		variante="sheet"
		{task}
		{subtasks}
		{liste}
		{listen}
		{onSchliessen}
		{onToggle}
		{onUmbenennen}
		{onPrioritaet}
		{onZeitrahmen}
		{onFaellig}
		{onNotiz}
		{onPin}
		{onVerschieben}
		{onLoeschen}
		{onUnterToggle}
		{onUnterUmbenennen}
		{onUnterLoeschen}
		{onUnterNeu}
		{onMenue}
		{verlauf}
	/>
</div>
