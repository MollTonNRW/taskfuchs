<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Zeigerpunkt } from '$lib/composables/tf/useContextMenus.svelte';
	import type { Einkauf } from '$lib/stores/einkauf';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { einkaufsAnsicht } from '$lib/utils/einkauf';
	import { toasts } from '$lib/stores/toast';
	import { createLangesTippen } from '$lib/actions/langesTippen';
	import QuickAdd from './QuickAdd.svelte';
	import Icon from './Icon.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	/**
	 * Einkaufs-Modus — Spezifikation docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md.
	 * Kategorien sind Abschnitte ohne Haken; Artikel: offen, im Wagen
	 * (durchgestrichen am Abschnittsende), zuletzt gekauft (Chips).
	 */
	let {
		list,
		tasks,
		mobil = false,
		einkauf,
		onKategorieMenue,
		onArtikelMenue,
		onKategorieNeu,
		quickAddVorgabe = '',
		menuOffenId = null
	}: {
		list: List;
		/** Alle Zeilen DIESER Liste (Kategorien, Artikel, abgelegte). */
		tasks: Task[];
		mobil?: boolean;
		einkauf: Einkauf;
		onKategorieMenue: (e: Zeigerpunkt, kategorie: Task) => void;
		onArtikelMenue: (e: Zeigerpunkt, artikel: Task) => void;
		onKategorieNeu: () => void;
		/** Quick-Add aktiv mit diesem Text — nur die Vorschau-Route. */
		quickAddVorgabe?: string;
		/** Kategorie oder Artikel, deren Menue gerade offen steht — ihr ⋮ bleibt sichtbar. */
		menuOffenId?: string | null;
	} = $props();

	const CHIPS_MAX = 8;
	let ansicht = $derived(einkaufsAnsicht(tasks));
	/** Auf- und Zuklappen je Kategorie; ohne eigene Wahl sind leere zu. */
	const zu = new SvelteMap<string, boolean>();
	/** Kategorien, deren Chip-Zeile „+ N weitere" aufgeklappt hat. */
	const alleChips = new SvelteMap<string, boolean>();

	function istZu(id: string, leer: boolean): boolean {
		return zu.get(id) ?? leer;
	}

	async function hinzufuegen(listId: string, text: string) {
		const r = await einkauf.artikelHinzufuegen(listId, text);
		if (r.art === 'schon-da' && r.artikelId) {
			toasts.show(`„${text.trim()}“ steht schon auf der Liste`);
		} else if (r.artikelId && r.kategorieName) {
			const id = r.artikelId;
			toasts.aktion(`${text.trim()} → ${r.kategorieName}`, 'Ändern', () => void menueAmArtikel(id));
		}
	}

	/**
	 * „Aendern" im Toast: das Artikelmenue an der Zeile oeffnen. Hat jemand
	 * die Kategorie zugeklappt, steht die Zeile nicht im Baum — erst
	 * aufklappen, sonst liefe der Knopf ins Leere.
	 */
	async function menueAmArtikel(id: string) {
		const artikel = tasks.find((t) => t.id === id);
		if (!artikel) return;
		if (artikel.parent_id && zu.get(artikel.parent_id)) {
			zu.set(artikel.parent_id, false);
			await tick();
		}
		const rect = document.querySelector(`[data-tf-artikel="${id}"]`)?.getBoundingClientRect();
		if (rect) onArtikelMenue({ clientX: rect.right, clientY: rect.bottom, preventDefault() {} }, artikel);
	}

	function menue(e: MouseEvent, t: Task, art: 'kategorie' | 'artikel') {
		e.preventDefault();
		e.stopPropagation();
		(art === 'kategorie' ? onKategorieMenue : onArtikelMenue)(e, t);
	}

	// Am Finger traegt ein Artikel kein ⋮; das Menue kommt ueber langes
	// Tippen — dasselbe Muster wie bei den Aufgaben (actions/langesTippen.ts).
	// Der Klick danach wird geschluckt, sonst laege der Artikel im Wagen.
	const tippen = createLangesTippen<Task>((p, a) => onArtikelMenue(p, a));

	function umschalten(a: Task) {
		if (tippen.klickGeschluckt()) return;
		void einkauf.artikelUmschalten(a.id);
	}
</script>

<QuickAdd
	listId={list.id}
	{mobil}
	vorgabe={quickAddVorgabe}
	platzhalter="Artikel hinzufügen …"
	onAdd={hinzufuegen}
/>

<div class="tf-ek">
	{#if ansicht.ohneKategorie.length > 0}
		<section class="tf-ek-abschnitt" aria-label="Ohne Kategorie">
			<div class="tf-ek-kopf"><span class="tf-ek-titel">Ohne Kategorie</span></div>
			{#each ansicht.ohneKategorie as a (a.id)}
				{@render artikelZeile(a)}
			{/each}
		</section>
	{/if}

	{#each ansicht.abschnitte as s (s.kategorie.id)}
		{@const leer = s.offen.length === 0 && s.wagen.length === 0}
		{@const geschlossen = istZu(s.kategorie.id, leer && s.abgelegt.length === 0)}
		<section class="tf-ek-abschnitt" aria-label={s.kategorie.text}>
			<div class="tf-ek-kopf">
				<button
					class="tf-ek-titel"
					aria-expanded={!geschlossen}
					onclick={() => zu.set(s.kategorie.id, !geschlossen)}
				>
					<Icon name={geschlossen ? 'chevron-rechts' : 'chevron-ab'} size={16} />
					<span class="name">{s.kategorie.text}</span>
					{#if s.offen.length > 0}<span class="cnt">{s.offen.length}</span>{/if}
				</button>
				<button
					class="tf-more"
					class:on={menuOffenId === s.kategorie.id}
					aria-label="Kategoriemenü öffnen"
					onclick={(e) => menue(e, s.kategorie, 'kategorie')}
				>
					<Icon name="mehr" size={16} />
				</button>
			</div>
			{#if !geschlossen}
				{#each s.offen as a (a.id)}{@render artikelZeile(a)}{/each}
				{#each s.wagen as a (a.id)}{@render artikelZeile(a)}{/each}
				{#if s.abgelegt.length > 0}
					{@const alle = alleChips.get(s.kategorie.id) ?? false}
					<div class="tf-ek-chips" role="group" aria-label="Zuletzt gekauft">
						<span class="lbl">Zuletzt gekauft</span>
						{#each alle ? s.abgelegt : s.abgelegt.slice(0, CHIPS_MAX) as a (a.id)}
							<button
								class="tf-ek-chip"
								onclick={() => einkauf.wiederDrauf(a.id)}
								aria-label={`${a.text} wieder auf die Liste`}
							>
								<Icon name="plus" size={14} />{a.text}
							</button>
						{/each}
						{#if !alle && s.abgelegt.length > CHIPS_MAX}
							<button class="tf-ek-chip mehr" onclick={() => alleChips.set(s.kategorie.id, true)}>
								+ {s.abgelegt.length - CHIPS_MAX} weitere
							</button>
						{/if}
					</div>
				{/if}
			{/if}
		</section>
	{/each}

	<button class="tf-ek-neu" onclick={() => onKategorieNeu()}>
		<Icon name="plus" size={16} /> Kategorie
	</button>
</div>

{#if ansicht.wagenAnzahl > 0}
	<div class="tf-ek-fertig">
		<button class="tf-btn primary" onclick={() => einkauf.einkaufFertig(list.id)}>
			Einkauf fertig · {ansicht.wagenAnzahl}
		</button>
	</div>
{/if}

{#snippet artikelZeile(a: Task)}
	{@const imWagen = a.done}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="tf-ek-artikel"
		class:wagen={imWagen}
		data-tf-artikel={a.id}
		oncontextmenu={(e) => tippen.kontextmenue(e, a)}
		ontouchstart={tippen.start}
		ontouchmove={tippen.bewegt}
		ontouchend={(e) => tippen.ende(e, a)}
	>
		<button
			class="tf-ek-haken"
			role="checkbox"
			aria-checked={imWagen}
			aria-label={imWagen ? `${a.text} zurück auf die Liste` : `${a.text} in den Wagen`}
			onclick={() => umschalten(a)}
		>
			<span class="kreis">{#if imWagen}<Icon name="haken" size={14} />{/if}</span>
			<span class="txt">{a.text}</span>
		</button>
		{#if !mobil}
			<button
				class="tf-more"
				class:on={menuOffenId === a.id}
				aria-label="Artikelmenü öffnen"
				onclick={(e) => menue(e, a, 'artikel')}
			>
				<Icon name="mehr" size={16} />
			</button>
		{/if}
	</div>
{/snippet}
