<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * Erledigt-Balken — Spezifikation Abschnitt 5.
	 * Hoehe 44, Oberlinie `--line-2`, rechtsbuendig „Erledigte loeschen";
	 * bei Zaehler 0 entfaellt die Loeschen-Aktion.
	 */
	let {
		anzahl,
		offen,
		mobil = false,
		onToggle,
		onClear
	}: {
		anzahl: number;
		offen: boolean;
		mobil?: boolean;
		onToggle: () => void;
		onClear: () => void;
	} = $props();
</script>

<div class="tf-donebar" class:mobil>
	<button class="auf" onclick={onToggle} aria-expanded={offen}>
		<Icon name={offen ? 'chevron-ab' : 'chevron-erledigt'} size={16} />
		Erledigt<span class="cnt">{anzahl}</span>
	</button>
	{#if anzahl > 0}
		<button class="clr" onclick={onClear}>
			<Icon name="loeschen" size={16} />Erledigte löschen
		</button>
	{/if}
</div>
