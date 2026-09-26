<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Zeigerpunkt } from '$lib/composables/tf/useContextMenus.svelte';
	import type { Einkauf } from '$lib/stores/einkauf';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { einkaufsAnsicht } from '$lib/utils/einkauf';
	import { toasts } from '$lib/stores/toast';
	import { createLangesTippen } from '$lib/actions/langesTippen';
	import { touchDragHandle, touchDropZone } from '$lib/actions/touchDrag';
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
		/** „+ Kategorie" — mit der ID dieser Liste (Ruling R1). */
		onKategorieNeu: (listId: string) => void;
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
	 * aufklappen, sonst liefe der Knopf ins Leere. Der neue Artikel steht am
	 * Ende seiner Kategorie, oft weit unter dem Quick-Add: erst in die Mitte
	 * holen, sonst oeffnete das Menue ausserhalb des Bildschirms (die
	 * Mitte, weil unten die Leiste „Einkauf fertig" und mobil das
	 * angedockte Quick-Add ueber der Zeile laegen).
	 */
	async function menueAmArtikel(id: string) {
		const artikel = tasks.find((t) => t.id === id);
		if (!artikel) return;
		if (artikel.parent_id && zu.get(artikel.parent_id)) {
			zu.set(artikel.parent_id, false);
			await tick();
		}
		const zeile = document.querySelector(`[data-tf-artikel="${id}"]`);
		if (!zeile) return;
		zeile.scrollIntoView({ block: 'center', behavior: 'instant' });
		const rect = zeile.getBoundingClientRect();
		onArtikelMenue({ clientX: rect.right, clientY: rect.bottom, preventDefault() {} }, artikel);
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

	// ------------------------------------------------------------------
	// Kategorien umsortieren — am Kopf ziehen, HTML5-Drag (Zeigergeraet)
	// und touchDrag (Finger, nach kurzem Halten) wie die Zeilen der
	// Aufgabenliste. Eigener Datentyp, damit eine Kategorie nie als Aufgabe
	// in eine andere Liste faellt. `zielIndex`: Einfuegestelle in der
	// Reihenfolge der Kategorien MIT der gezogenen.
	// ------------------------------------------------------------------
	const ZUG_TYP = 'application/x-tf-kategorie';
	let zielIndex: number | null = $state(null);
	let ziehId: string | null = $state(null);

	function ziehStart(e: DragEvent, k: Task) {
		if (!e.dataTransfer) return;
		ziehId = k.id;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData(ZUG_TYP, k.id);
	}

	function ziehEnde() {
		ziehId = null;
		zielIndex = null;
	}

	function ziehUeber(e: DragEvent, idx: number) {
		if (!e.dataTransfer?.types.includes(ZUG_TYP)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		zielIndex = e.clientY > rect.top + rect.height / 2 ? idx + 1 : idx;
	}

	function fallen(e: DragEvent, idx: number) {
		const id = e.dataTransfer?.getData(ZUG_TYP);
		if (!id) return;
		e.preventDefault();
		const ziel = zielIndex ?? idx;
		ziehEnde();
		void einkauf.kategorieVerschieben(id, ziel);
	}

	/** Einfuegestelle aus einer Bildschirmhoehe (Finger-Variante). */
	function stelleAus(behaelter: Element, y: number): number {
		const abschnitte = behaelter.querySelectorAll('[data-tf-kategorie]');
		for (let i = 0; i < abschnitte.length; i++) {
			const rect = abschnitte[i].getBoundingClientRect();
			if (y < rect.top + rect.height / 2) return i;
		}
		return abschnitte.length;
	}

	function fingerFallen(daten: unknown, el: HTMLElement, _x: number, y: number) {
		const id = (daten as { kategorieId?: string } | null)?.kategorieId;
		const ziel = stelleAus(el, y);
		ziehEnde();
		if (id) void einkauf.kategorieVerschieben(id, ziel);
	}
</script>

<QuickAdd
	listId={list.id}
	{mobil}
	vorgabe={quickAddVorgabe}
	platzhalter="Artikel hinzufügen …"
	onAdd={hinzufuegen}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="tf-ek"
	use:touchDropZone={{
		type: 'kategorie',
		onDragOver: (el, _x, y) => (zielIndex = stelleAus(el, y)),
		onDragLeave: () => (zielIndex = null),
		onDrop: fingerFallen
	}}
>
	{#if ansicht.ohneKategorie.length > 0 || ansicht.ohneKategorieAbgelegt.length > 0}
		<section class="tf-ek-abschnitt" aria-label="Ohne Kategorie">
			<div class="tf-ek-kopf"><span class="tf-ek-titel">Ohne Kategorie</span></div>
			{#each ansicht.ohneKategorie as a (a.id)}
				{@render artikelZeile(a)}
			{/each}
			{@render chips('ohne', ansicht.ohneKategorieAbgelegt)}
		</section>
	{/if}

	{#each ansicht.abschnitte as s, idx (s.kategorie.id)}
		{@const leer = s.offen.length === 0 && s.wagen.length === 0}
		{@const geschlossen = istZu(s.kategorie.id, leer && s.abgelegt.length === 0)}
		<section
			class="tf-ek-abschnitt"
			class:zieht={ziehId === s.kategorie.id}
			class:ziel-oben={zielIndex === idx}
			class:ziel-unten={zielIndex === idx + 1 && idx === ansicht.abschnitte.length - 1}
			aria-label={s.kategorie.text}
			data-tf-kategorie={s.kategorie.id}
			ondragover={(e) => ziehUeber(e, idx)}
			ondrop={(e) => fallen(e, idx)}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="tf-ek-kopf"
				draggable="true"
				ondragstart={(e) => ziehStart(e, s.kategorie)}
				ondragend={ziehEnde}
				use:touchDragHandle={{
					data: { kategorieId: s.kategorie.id },
					type: 'kategorie',
					onStart: () => (ziehId = s.kategorie.id),
					onEnd: ziehEnde
				}}
			>
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
				{@render chips(s.kategorie.id, s.abgelegt)}
			{/if}
		</section>
	{/each}

	<button class="tf-ek-neu" onclick={() => onKategorieNeu(list.id)}>
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

{#snippet chips(schluessel: string, abgelegt: Task[])}
	{#if abgelegt.length > 0}
		{@const alle = alleChips.get(schluessel) ?? false}
		<div class="tf-ek-chips" role="group" aria-label="Zuletzt gekauft">
			<span class="lbl">Zuletzt gekauft</span>
			{#each alle ? abgelegt : abgelegt.slice(0, CHIPS_MAX) as a (a.id)}
				<button
					class="tf-ek-chip"
					onclick={() => einkauf.wiederDrauf(a.id)}
					aria-label={`${a.text} wieder auf die Liste`}
				>
					<Icon name="plus" size={14} />{a.text}
				</button>
			{/each}
			{#if !alle && abgelegt.length > CHIPS_MAX}
				<button class="tf-ek-chip mehr" onclick={() => alleChips.set(schluessel, true)}>
					+ {abgelegt.length - CHIPS_MAX} weitere
				</button>
			{/if}
		</div>
	{/if}
{/snippet}

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
