<script lang="ts">
	import { toasts } from '$lib/stores/toast';
	import { DOCK_HOEHE, dockUnten, tastatur } from '$lib/stores/tf/tastatur.svelte';

	/**
	 * Toast — dunkle Flaeche, helle Schrift, „Rueckgaengig" in --toast-undo.
	 * Derselbe Knopf traegt das eigene Label eines `toasts.aktion`
	 * (z. B. „Aendern").
	 *
	 * Die Positionierung steckt in src/tf.css (.tf-toasts): Desktop mittig auf
	 * bottom 20, mobil zwischen die Raender gespannt und um die Hoehe der
	 * Tab-Leiste plus Safe-Area angehoben. Vorher stand hier fest bottom:80px —
	 * auf einem iPhone reicht die Leiste bis 87 px, der Toast lag dahinter.
	 *
	 * Steht mobil das angedockte Quick-Add-Feld, rueckt der Stapel darueber —
	 * sonst deckte der Einsortier-Toast („Milch → Kühlabteilung") genau die
	 * Eingabe ab, in die schon der naechste Artikel getippt wird. Die Leiste
	 * „Einkauf fertig" hebt ihn per CSS (`:has(.tf-ek-fertig)`).
	 */
	let ueberDock = $derived(
		tastatur.angedockt ? `calc(${dockUnten()} + ${DOCK_HOEHE + 8}px)` : null
	);
</script>

{#if $toasts.length > 0}
	<div class="tf-toasts" role="status" aria-live="polite" style:bottom={ueberDock}>
		{#each $toasts as toast (toast.id)}
			<div
				class="tf-toast"
				class:fehler={toast.type === 'error'}
				class:erfolg={toast.type === 'success'}
				role={toast.type === 'error' ? 'alert' : 'status'}
			>
				<span class="txt">{toast.message}</span>
				{#if toast.onUndo}
					<button
						class="undo"
						onclick={() => {
							toast.onUndo?.();
							toasts.dismiss(toast.id);
						}}
					>
						{toast.aktionLabel ?? 'Rückgängig'}
					</button>
				{:else}
					<button class="zu" onclick={() => toasts.dismiss(toast.id)} aria-label="Schlie&szlig;en">
						&#x2715;
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}
