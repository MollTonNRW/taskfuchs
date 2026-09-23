<script lang="ts">
	import { tick } from 'svelte';
	import { inputDialogStore, resolveInput } from '$lib/stores/toast';

	/**
	 * Einzeiliger Eingabedialog — praktisch nur noch „Umbenennen"
	 * (Listenmenue) und der Restbestand „Trenner umbenennen".
	 *
	 * Nachfolger von `components/v2/InputDialog.svelte`: der trug einen
	 * Versalien-Titel in Akzentfarbe, 6-px-Radien und einen Knopf mit
	 * Akzent-Glow — sechs der sieben Listenmenue-Eintraege fuehrten in die
	 * neue Oberflaeche, dieser eine in die alte. Jetzt derselbe Rahmen wie
	 * der Bestaetigungsdialog (`.tf-dialog`, Spezifikation Abschnitt 6):
	 * Flaeche `--surface`, Radius 16, zwei Knoepfe der Hoehe 44.
	 */
	let feld: HTMLInputElement | undefined = $state();
	let wert = $state('');

	$effect(() => {
		if (!$inputDialogStore.show) return;
		const vorgabe = $inputDialogStore.defaultValue;
		wert = vorgabe;
		tick().then(() => {
			feld?.focus();
			feld?.select();
		});
	});

	function uebernehmen() {
		resolveInput(wert.trim() || null);
	}

	function abbrechen() {
		resolveInput(null);
	}

	function tasten(e: KeyboardEvent) {
		if (!$inputDialogStore.show) return;
		if (e.key !== 'Escape' && e.key !== 'Enter') return;
		// stopImmediatePropagation, nicht stopPropagation: der globale
		// Tastenhoerer der Seite haengt am SELBEN Ziel (window). Dort haelt
		// stopPropagation nichts auf — Escape schloesse sonst den Dialog UND
		// hoebe die Aufgabenauswahl dahinter auf.
		e.preventDefault();
		e.stopImmediatePropagation();
		if (e.key === 'Escape') abbrechen();
		else uebernehmen();
	}
</script>

<svelte:window onkeydown={tasten} />

{#if $inputDialogStore.show}
	<div class="tf-dialog-scrim" onclick={abbrechen} role="presentation"></div>

	<div class="tf-dialog" role="dialog" aria-modal="true" aria-label={$inputDialogStore.title}>
		<h4>{$inputDialogStore.title}</h4>
		{#if $inputDialogStore.message}
			<p>{$inputDialogStore.message}</p>
		{/if}
		<div class="fld">
			<input
				bind:this={feld}
				bind:value={wert}
				placeholder={$inputDialogStore.placeholder}
				aria-label={$inputDialogStore.placeholder || $inputDialogStore.title}
				maxlength="100"
			/>
		</div>
		<div class="acts">
			<button class="tf-btn" onclick={abbrechen}>Abbrechen</button>
			<button class="tf-btn primary" onclick={uebernehmen}>&Uuml;bernehmen</button>
		</div>
	</div>
{/if}
