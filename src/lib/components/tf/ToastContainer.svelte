<script lang="ts">
	import { toasts } from '$lib/stores/toast';

	/**
	 * Toast — dunkle Flaeche, helle Schrift, „Rueckgaengig" in --toast-undo.
	 *
	 * Die Positionierung steckt in src/tf.css (.tf-toasts): Desktop mittig auf
	 * bottom 20, mobil zwischen die Raender gespannt und um die Hoehe der
	 * Tab-Leiste plus Safe-Area angehoben. Vorher stand hier fest bottom:80px —
	 * auf einem iPhone reicht die Leiste bis 87 px, der Toast lag dahinter.
	 */
</script>

{#if $toasts.length > 0}
	<div class="tf-toasts" role="status" aria-live="polite">
		{#each $toasts as toast (toast.id)}
			<div
				class="tf-toast"
				class:fehler={toast.type === 'error'}
				class:erfolg={toast.type === 'success'}
				role={toast.type === 'error' ? 'alert' : 'status'}
			>
				<span class="txt">{toast.message}</span>
				{#if toast.type === 'undo' && toast.onUndo}
					<button
						class="undo"
						onclick={() => {
							toast.onUndo?.();
							toasts.dismiss(toast.id);
						}}
					>
						R&uuml;ckg&auml;ngig
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
