<script lang="ts">
	import { tick } from 'svelte';
	import { confirmStore, resolveConfirm } from '$lib/stores/toast';

	/**
	 * Bestaetigungsdialog nach A-klar-spec.md, Abschnitt 6 — und NUR dort, wo
	 * es kein Rueckgaengig gibt. Eine einzelne Aufgabe loeschen und
	 * „Erledigte loeschen" bekommen stattdessen einen Undo-Toast; hier landet
	 * praktisch nur „Liste loeschen".
	 *
	 * Enter bestaetigt ausschliesslich, wenn der Fokus im Dialog liegt. Die
	 * alte Fassung horchte global: in einer Oberflaeche mit Dauer-Eingabefeldern
	 * (Titel, Notiz, Quick-Add) haette ein Enter im Textfeld die Liste geloescht.
	 */

	let dialogEl: HTMLDivElement | undefined = $state();
	let bestaetigenEl: HTMLButtonElement | undefined = $state();

	// Fokus in den Dialog holen: das macht Enter erst sinnvoll und gibt der
	// Tastaturbedienung einen Anfang.
	$effect(() => {
		if (!$confirmStore.show) return;
		tick().then(() => bestaetigenEl?.focus());
	});

	function imDialog(ziel: EventTarget | null): boolean {
		return !!dialogEl && ziel instanceof Node && dialogEl.contains(ziel);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!$confirmStore.show) return;
		if (e.key === 'Escape') {
			e.stopPropagation();
			resolveConfirm(false);
			return;
		}
		if (e.key === 'Enter' && imDialog(e.target)) {
			e.preventDefault();
			e.stopPropagation();
			resolveConfirm(true);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $confirmStore.show}
	<div class="tf-dialog-scrim" onclick={() => resolveConfirm(false)} role="presentation"></div>

	<div bind:this={dialogEl} class="tf-dialog" role="alertdialog" aria-modal="true" aria-label={$confirmStore.titel}>
		<h4>{$confirmStore.titel}</h4>
		{#if $confirmStore.text}
			<p>{$confirmStore.text}</p>
		{/if}
		<div class="acts">
			<button class="tf-btn" onclick={() => resolveConfirm(false)}>Abbrechen</button>
			<button
				bind:this={bestaetigenEl}
				class="tf-btn"
				class:destr={$confirmStore.destruktiv}
				class:primary={!$confirmStore.destruktiv}
				onclick={() => resolveConfirm(true)}
			>
				{$confirmStore.knopf}
			</button>
		</div>
	</div>
{/if}
