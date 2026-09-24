<script lang="ts">
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import { warteHinweis, type Eintrag } from '$lib/utils/verlauf';
	import { suchen, klartext, trefferLabel, MIN_ZEICHEN, type Treffer } from '$lib/utils/suche';

	type Task = Database['public']['Tables']['tasks']['Row'];
	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Suche am Finger — ein eigener Schirm im Tab „Suche" (Spezifikation
	 * Abschnitt 6, Frame 8).
	 *
	 * Bis T8 war dieser Tab nur ein Umweg: er oeffnete das alte
	 * Desktop-Overlay ueber dem vorigen Schirm, die Tab-Leiste zeigte
	 * „Suche", der Schirm darunter etwas anderes. Jetzt ist es ein echter
	 * Schirm mit eigenem Suchfeld (44 px), eigenem Loesch-X (44 px) und
	 * eigenen Sektionen.
	 *
	 * Der Suchbegriff liegt beim Aufrufer (`bind:begriff`): wer einen Treffer
	 * antippt, landet im Tab „Listen" — kommt er zurueck, steht seine Eingabe
	 * noch da.
	 */
	let {
		tasks,
		lists,
		begriff = $bindable(''),
		warteAuf,
		onOeffnen
	}: {
		tasks: Task[];
		lists: List[];
		begriff?: string;
		/** Offene Warte-Eintraege einer Aufgabe (Sanduhr im Treffer). */
		warteAuf?: (id: string) => Eintrag[];
		/** Treffer angetippt: in die Liste springen und die Aufgabe zeigen. */
		onOeffnen: (listId: string, taskId: string) => void;
	} = $props();

	let feld = $state<HTMLInputElement | undefined>();

	let ergebnis = $derived(suchen(tasks, lists, begriff));
	let zuKurz = $derived(begriff.trim().length < MIN_ZEICHEN);
	let leer = $derived(ergebnis.offen.length === 0 && ergebnis.erledigt.length === 0);

	// Der Tab hat genau einen Zweck — das Feld bekommt den Fokus.
	$effect(() => {
		feld?.focus();
	});

	function leeren() {
		begriff = '';
		feld?.focus();
	}
</script>

{#snippet sanduhr(aufgabe: Task)}
	{@const text = !aufgabe.done && warteAuf ? warteHinweis(warteAuf(aufgabe.id)) : ''}
	{#if text}
		<span class="warte" role="img" aria-label={text} title={text}><Icon name="sanduhr" size={14} /></span>
	{/if}
{/snippet}

{#snippet zeile(t: Treffer, erster = false)}
	<button
		class="tf-hit"
		class:on={erster}
		class:erledigt={t.task.done}
		onclick={() => onOeffnen(t.listId, t.task.id)}
	>
		<span class="em">{t.emoji}</span>
		<div class="tf-body">
			<div class="tf-t">
				<span class="tx"
					>{t.titel.vor}{#if t.titel.treffer}<mark>{t.titel.treffer}</mark>{/if}{t.titel.nach}</span
				>
			</div>
			<div class="tf-m">
				{@render sanduhr(t.task)}
				<span class="path" title={klartext(t.pfad)}
					>{t.pfad.vor}{#if t.pfad.treffer}<mark>{t.pfad.treffer}</mark>{/if}{t.pfad.nach}</span
				>
			</div>
		</div>
		<Icon name="chevron-rechts" size={16} class="chev" />
	</button>
{/snippet}

<div class="tf-suche">
	<div class="tf-sfield">
		<Icon name="suche" size={16} />
		<input
			bind:this={feld}
			bind:value={begriff}
			type="text"
			autocomplete="off"
			spellcheck="false"
			placeholder="Titel, Unteraufgaben, Notizen"
			aria-label="Suchbegriff"
		/>
		{#if begriff.length > 0}
			<button class="x" onclick={leeren} aria-label="Suche leeren">
				<Icon name="leeren" size={16} />
			</button>
		{/if}
	</div>

	<div class="tf-liste">
		{#if zuKurz}
			<p class="tf-such-hinweis">Mindestens {MIN_ZEICHEN} Zeichen eingeben.</p>
		{:else if leer}
			<p class="tf-such-hinweis">Keine Treffer.</p>
		{:else}
			{#if ergebnis.offen.length > 0}
				<div class="tf-lsec">{trefferLabel(ergebnis.offen)}</div>
				{#each ergebnis.offen as t, i (t.id)}
					<!-- Spezifikation Abschnitt 6: „aktiver/erster Treffer Flaeche --sel". -->
					{@render zeile(t, i === 0)}
				{/each}
			{/if}
			{#if ergebnis.erledigt.length > 0}
				<div class="tf-lsec">Erledigt</div>
				{#each ergebnis.erledigt as t (t.id)}
					{@render zeile(t)}
				{/each}
			{/if}
		{/if}
	</div>
</div>
