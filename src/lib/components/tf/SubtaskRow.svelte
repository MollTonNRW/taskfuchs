<script lang="ts">
	import { tick } from 'svelte';
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import type { Zeigerpunkt } from '$lib/composables/tf/useContextMenus.svelte';

	type Task = Database['public']['Tables']['tasks']['Row'];

	/**
	 * Unteraufgabe — Spezifikation Abschnitt 5, Block `.subs`.
	 * Hoehe 36 (mobil 44), Kreis 18 px, Rand 1.5 px. Genau eine Ebene.
	 */
	let {
		subtask,
		mobil = false,
		onToggle,
		onEdit,
		onMenu,
		onBearbeitet
	}: {
		subtask: Task;
		mobil?: boolean;
		onToggle: (id: string) => void;
		/** Gesetzt: der Text laesst sich an Ort und Stelle umbenennen. */
		onEdit?: (id: string, text: string) => void;
		onMenu?: (e: Zeigerpunkt, subtask: Task) => void;
		/** Meldet das Umbenennen — der Aufrufer schaltet solange das Ziehen ab. */
		onBearbeitet?: (aktiv: boolean) => void;
	} = $props();

	let bearbeitet = $state(false);
	let entwurf = $state('');
	let feld = $state<HTMLInputElement | undefined>(undefined);

	function melden(aktiv: boolean) {
		bearbeitet = aktiv;
		onBearbeitet?.(aktiv);
	}

	async function bearbeiten(e: MouseEvent) {
		if (!onEdit) return;
		e.stopPropagation();
		entwurf = subtask.text;
		melden(true);
		await tick();
		feld?.focus();
		feld?.select();
	}

	function sichern() {
		const text = entwurf.trim();
		if (text && text !== subtask.text) onEdit?.(subtask.id, text);
		melden(false);
	}

	function taste(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			sichern();
		}
		if (e.key === 'Escape') {
			e.stopPropagation();
			melden(false);
		}
	}

	function abhaken(e: MouseEvent) {
		e.stopPropagation();
		onToggle(subtask.id);
	}

	/** Natives Menue nach einer Beruehrung unterdruecken (Android). */
	let tippStart = 0;
	function kontextmenue(e: MouseEvent) {
		if (!onMenu) return;
		e.preventDefault();
		e.stopPropagation();
		if (Date.now() - tippStart < 700) return;
		onMenu(e, subtask);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class="tf-sub"
	class:done={subtask.done}
	class:mobil
	onclick={(e) => e.stopPropagation()}
	oncontextmenu={kontextmenue}
	ontouchstart={() => (tippStart = Date.now())}
>
	<button
		class="tf-cb"
		class:done={subtask.done}
		onclick={abhaken}
		aria-label={subtask.done ? 'Unteraufgabe wieder öffnen' : 'Unteraufgabe abhaken'}
	>
		<span>{#if subtask.done}<Icon name="haken" size={14} />{/if}</span>
	</button>

	{#if bearbeitet}
		<input
			bind:this={feld}
			bind:value={entwurf}
			class="tf-inline"
			onblur={sichern}
			onkeydown={taste}
			maxlength="500"
		/>
	{:else if onEdit}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<span class="tx" onclick={bearbeiten}>{subtask.text}</span>
	{:else}
		<span class="tx">{subtask.text}</span>
	{/if}
</div>
