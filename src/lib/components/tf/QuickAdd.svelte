<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { beobachteTastatur, tastatur } from '$lib/stores/tf/tastatur.svelte';

	/**
	 * Quick-Add — Spezifikation Abschnitt 5: die ERSTE Zeile jeder Liste,
	 * nie im Menue versteckt. Hoehe 48, Plus-Ziel 44 x 44 mit 22-px-Kreis in
	 * `--accent`. Aktiv: Flaeche `--surface` und `inset 0 0 0 1.5px --accent`.
	 * Kein gestrichelter Rahmen (Abschnitt 5, ausdruecklich verboten).
	 *
	 * Mobil bei offener Tastatur zeigt die Zeile in der Liste nur noch den
	 * Platzhalter (`opacity:.4`); getippt wird im angedockten Feld direkt
	 * ueber der Tastatur (Abschnitt 4, Screen „mobile-quickadd").
	 */
	let {
		listId,
		mobil = false,
		vorgabe = '',
		platzhalter = 'Aufgabe hinzufügen …',
		onAdd
	}: {
		listId: string;
		mobil?: boolean;
		/**
		 * Startet das Feld aktiv mit diesem Text. Nur die Vorschau-Route
		 * setzt das — sie muss den Zustand „wird gerade getippt" ohne
		 * Tastatur herstellen koennen (Frame `mobile-quickadd`).
		 */
		vorgabe?: string;
		/** Text im leeren Feld — die Einkaufsliste sagt „Artikel hinzufuegen …". */
		platzhalter?: string;
		onAdd: (listId: string, text: string) => void;
	} = $props();

	let aktiv = $state(untrack(() => !!vorgabe));
	let text = $state(untrack(() => vorgabe));
	let feld = $state<HTMLInputElement | undefined>(undefined);

	// Die Tastaturhoehe wird nur beobachtet, solange mobil getippt wird.
	$effect(() => {
		if (!mobil || !aktiv) return;
		return beobachteTastatur();
	});

	// Listenwechsel raeumt einen angefangenen Eintrag ab. Der ERSTE Durchlauf
	// zaehlt nicht als Wechsel — sonst loeschte er die Vorgabe gleich wieder.
	let letzteListe = untrack(() => listId);
	$effect(() => {
		const jetzt = listId;
		untrack(() => {
			if (jetzt === letzteListe) return;
			letzteListe = jetzt;
			aktiv = false;
			text = '';
		});
	});

	/** Angedockt wird nur mobil und nur, solange wirklich getippt wird. */
	let angedockt = $derived(mobil && aktiv);
	let dockUnten = $derived(
		tastatur.offen
			? `${tastatur.hoehe}px`
			: 'calc(var(--tf-tabbar) + env(safe-area-inset-bottom))'
	);

	async function oeffnen() {
		if (aktiv) return;
		aktiv = true;
		await tick();
		feld?.focus();
	}

	function tasteAufZeile(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			oeffnen();
		}
	}

	function senden() {
		const wert = text.trim();
		if (!wert) return;
		text = '';
		onAdd(listId, wert);
		// Das Feld bleibt offen: mehrere Aufgaben hintereinander sind der
		// Normalfall. Auf dem Mobilgeraet haelt das auch die Tastatur oben.
		feld?.focus();
	}

	function taste(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			senden();
		}
		if (e.key === 'Escape') {
			e.stopPropagation();
			text = '';
			aktiv = false;
			feld?.blur();
		}
	}

	function verlassen() {
		// Mit Text bleibt das Feld stehen — sonst waere das Getippte weg,
		// sobald der Finger daneben landet.
		if (!text.trim()) aktiv = false;
	}
</script>

<div
	class="tf-qa"
	class:active={aktiv && !angedockt}
	class:ghost={angedockt}
	role="button"
	tabindex={aktiv ? -1 : 0}
	onclick={oeffnen}
	onkeydown={tasteAufZeile}
>
	<span class="plus">
		<span><Icon name="plus" size={16} /></span>
	</span>
	{#if aktiv && !angedockt}
		<input
			bind:this={feld}
			bind:value={text}
			class="in"
			type="text"
			autocomplete="off"
			enterkeyhint="done"
			placeholder={platzhalter}
			onkeydown={taste}
			onblur={verlassen}
			maxlength="500"
		/>
	{:else}
		<span class="in">{platzhalter}</span>
	{/if}
</div>

{#if angedockt}
	<div class="tf-qa-sticky" style="bottom:{dockUnten}">
		<div class="tf-qa active">
			<span class="plus">
				<span><Icon name="plus" size={16} /></span>
			</span>
			<input
				bind:this={feld}
				bind:value={text}
				class="in"
				type="text"
				autocomplete="off"
				enterkeyhint="done"
				placeholder={platzhalter}
				onkeydown={taste}
				onblur={verlassen}
				maxlength="500"
			/>
			<button
				class="send"
				onmousedown={(e) => e.preventDefault()}
				onclick={senden}
				aria-label="Aufgabe hinzufügen"
			>
				<Icon name="haken" size={16} />
			</button>
		</div>
	</div>
{/if}
