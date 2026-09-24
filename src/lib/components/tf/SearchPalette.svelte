<script lang="ts">
	import { untrack } from 'svelte';
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import { warteHinweis, type Eintrag } from '$lib/utils/verlauf';
	import { suchen, klartext, MIN_ZEICHEN, type Treffer } from '$lib/utils/suche';

	type Task = Database['public']['Tables']['tasks']['Row'];
	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Suche auf dem Zeigergeraet — die ⌘K-Palette (Spezifikation Abschnitt 6,
	 * Frame 3).
	 *
	 * Der Unterschied zur alten Fassung liegt nicht im Aussehen, sondern im
	 * Verhalten: waehrend man mit ↑↓ durch die Treffer geht, springt die
	 * Liste DAHINTER live mit (`onVorschau` setzt `nav.selectList` und
	 * `nav.selectTask`). Enter schliesst darum nur noch die Palette — die
	 * Aufgabe ist da bereits ausgewaehlt und das Detail gefuellt.
	 *
	 * Escape wird bewusst NICHT hier behandelt: die Seite hat genau einen
	 * globalen Tastatur-Hoerer, der alle Overlays in fester Reihenfolge
	 * schliesst. Ein zweiter Hoerer war schon einmal der Grund, warum ⌘K
	 * gegen sich selbst toggelte.
	 */
	let {
		tasks,
		lists,
		startBegriff = '',
		warteAuf,
		onVorschau,
		onClose
	}: {
		tasks: Task[];
		lists: List[];
		/** Vorbelegter Suchbegriff — nur die Vorschau-Route setzt das. */
		startBegriff?: string;
		/** Offene Warte-Eintraege einer Aufgabe (Sanduhr im Treffer). */
		warteAuf?: (id: string) => Eintrag[];
		/** Liste und Aufgabe hinter der Palette mitfuehren. */
		onVorschau: (listId: string, taskId: string) => void;
		onClose: () => void;
	} = $props();

	let begriff = $state(untrack(() => startBegriff));
	let aktiv = $state(0);
	let feld = $state<HTMLInputElement | undefined>();
	let zeilen: (HTMLElement | undefined)[] = [];

	let ergebnis = $derived(suchen(tasks, lists, begriff));
	/** Erledigte haengen hinten an — die Pfeiltasten laufen durch beide. */
	let treffer = $derived([...ergebnis.offen, ...ergebnis.erledigt]);
	let zuKurz = $derived(begriff.trim().length < MIN_ZEICHEN);

	// Beim Oeffnen liegt der Fokus im Feld — die Palette hat keinen anderen
	// Zweck. `autofocus` waere hier ein a11y-Verstoss ohne Not.
	$effect(() => {
		feld?.focus();
	});

	/**
	 * Die Liste hinter der Palette folgt dem aktiven Treffer. `untrack` um den
	 * Aufruf, damit der Schreibvorgang auf `nav` diesen Effekt nicht erneut
	 * ausloest (nav.selectList raeumt selectedTaskId ab — das waere eine
	 * Schleife).
	 */
	$effect(() => {
		const t = treffer[aktiv];
		if (!t) return;
		untrack(() => onVorschau(t.listId, t.task.id));
	});

	/**
	 * Der aktive Treffer bleibt sichtbar — ohne Laufanimation. `treffer` wird
	 * mitgelesen, damit die Liste auch bei einer neuen Eingabe wieder nach
	 * oben rueckt und nicht auf dem alten Bildlaufstand stehen bleibt.
	 */
	$effect(() => {
		treffer;
		zeilen[aktiv]?.scrollIntoView({ block: 'nearest' });
	});

	function bewege(schritt: number) {
		if (treffer.length === 0) return;
		aktiv = (aktiv + schritt + treffer.length) % treffer.length;
	}

	function taste(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			bewege(1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			bewege(-1);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			// Die Auswahl steht bereits — Enter beendet nur die Suche.
			if (treffer.length > 0) onClose();
		}
	}

	function waehle(i: number) {
		const t = treffer[i];
		if (!t) return;
		aktiv = i;
		onVorschau(t.listId, t.task.id);
		onClose();
	}
</script>

{#snippet sanduhr(aufgabe: Task)}
	{@const text = !aufgabe.done && warteAuf ? warteHinweis(warteAuf(aufgabe.id)) : ''}
	{#if text}
		<span class="warte" role="img" aria-label={text} title={text}><Icon name="sanduhr" size={14} /></span>
	{/if}
{/snippet}

{#snippet zeile(t: Treffer, i: number)}
	<button
		bind:this={zeilen[i]}
		class="tf-hit"
		class:on={aktiv === i}
		class:erledigt={t.task.done}
		role="option"
		aria-selected={aktiv === i}
		onclick={() => waehle(i)}
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
		{#if aktiv === i}<span class="ret" aria-hidden="true">&#8629;</span>{/if}
	</button>
{/snippet}

<!-- Heller Scrim (Spezifikation: rgba(40,30,20,.18)) — Klick daneben schliesst. -->
<div class="tf-such-scrim" role="presentation" onclick={onClose}></div>

<div class="tf-palette" role="dialog" aria-modal="true" aria-label="Aufgaben suchen">
	<div class="in">
		<Icon name="suche" />
		<input
			bind:this={feld}
			bind:value={begriff}
			oninput={() => (aktiv = 0)}
			onkeydown={taste}
			type="text"
			autocomplete="off"
			spellcheck="false"
			placeholder="Titel, Unteraufgaben und Notizen durchsuchen"
			aria-label="Suchbegriff"
		/>
		<kbd>esc</kbd>
	</div>

	{#if zuKurz}
		<p class="tf-such-hinweis">Mindestens {MIN_ZEICHEN} Zeichen eingeben.</p>
	{:else if treffer.length === 0}
		<p class="tf-such-hinweis">Keine Treffer.</p>
	{:else}
		<div class="res" role="listbox" aria-label="Treffer">
			{#each ergebnis.offen as t, i (t.id)}
				{@render zeile(t, i)}
			{/each}
			{#if ergebnis.erledigt.length > 0}
				<div class="tf-lsec">Erledigt</div>
				{#each ergebnis.erledigt as t, j (t.id)}
					{@render zeile(t, ergebnis.offen.length + j)}
				{/each}
			{/if}
		</div>
	{/if}

	<div class="hint">
		<span><kbd>&#8593;&#8595;</kbd>bl&auml;ttern &mdash; Liste springt live mit</span>
		<span><kbd>&#8629;</kbd>&ouml;ffnen</span>
		<span><kbd>esc</kbd>schlie&szlig;en</span>
	</div>
</div>
