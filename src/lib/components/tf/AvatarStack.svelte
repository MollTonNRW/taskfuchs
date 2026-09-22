<script lang="ts">
	import type { Mitnutzer } from '$lib/utils/mitnutzer';

	/**
	 * Ueberlappende 20-px-Avatare der Mitnutzer — Spezifikation Abschnitt 3.
	 *
	 * Genutzt in der Navigationszeile, in der mobilen Listenuebersicht und in
	 * der Geteilt-Pille des Listen-Headers. Im Titel steht der Klartextname,
	 * niemals die Benutzer-ID; `Mitnutzer.name` ist dafuer bereits aufgeloest
	 * (Anzeigename, sonst E-Mail, sonst „Mitnutzer").
	 */
	let {
		leute,
		max = 3
	}: {
		leute: Mitnutzer[];
		/** Mehr Avatare als das werden zu „+n" zusammengefasst. */
		max?: number;
	} = $props();

	let sichtbar = $derived(leute.length > max ? leute.slice(0, max - 1) : leute);
	let rest = $derived(leute.length - sichtbar.length);
	let titel = $derived(leute.map((m) => m.name).join(', '));
</script>

{#if leute.length > 0}
	<span class="tf-avatars" title={titel}>
		{#each sichtbar as m (m.id)}
			<span class="tf-avatar" style="background:{m.farbe}">{m.initialen}</span>
		{/each}
		{#if rest > 0}
			<span class="tf-avatar" style="background:var(--surface-2);color:var(--ink-2)">+{rest}</span>
		{/if}
	</span>
{/if}
