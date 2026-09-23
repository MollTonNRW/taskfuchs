<script lang="ts">
	import { get } from 'svelte/store';
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import SubtaskRow from './SubtaskRow.svelte';
	import { formatFaellig, formatSeit } from '$lib/utils/datum';
	import { dragState } from '$lib/actions/touchDrag';
	import type { Mitnutzer } from '$lib/utils/mitnutzer';
	import type { Zeigerpunkt } from '$lib/composables/v2/useContextMenus.svelte';

	type Task = Database['public']['Tables']['tasks']['Row'];

	/**
	 * Die Aufgabenzeile — Spezifikation Abschnitt 5.
	 *
	 * Bewusst NICHT vorhanden: ein Prioritaets-Textlabel ausser dem ASAP-Chip,
	 * ein „NORMAL"-Tag, ein Fortschrittsbalken (der lebt nur im Detail),
	 * Animationen, Puls, gestrichelte Rahmen. Der Prioritaetsbalken links
	 * traegt die Prioritaet allein.
	 *
	 * Die Komponente rendert ZWEI Geschwister: die Zeile und — ausgeklappt —
	 * den Unteraufgaben-Block darunter. So sieht jeder Aufrufer (Liste,
	 * Smart-Ansicht) die Unteraufgaben, ohne den Block selbst zu bauen.
	 * Erledigte Aufgaben behalten ihre Anzeige; dass sie bisher fehlte, lag
	 * nur an Props, die das alte ListPanel nicht durchgereicht hat.
	 */
	let {
		task,
		subtasks = [],
		selected = false,
		neu = false,
		subsOpen = false,
		menuOffen = false,
		mobil = false,
		ohneMenue = false,
		bulkMode = false,
		bulkSelected = false,
		herkunft = null,
		pinner = null,
		onToggle,
		onSelect,
		onMenu,
		onToggleSubs,
		onToggleSubtask,
		onEditSubtask,
		onSubMenu,
		onReorderSubtask,
		onBulkToggle
	}: {
		task: Task;
		/** Unteraufgaben in Anzeigereihenfolge — auch bei erledigten Aufgaben. */
		subtasks?: Task[];
		selected?: boolean;
		/** Gerade extern angekommen: warme Flaeche + „neu"-Chip. */
		neu?: boolean;
		subsOpen?: boolean;
		menuOffen?: boolean;
		mobil?: boolean;
		/** Pinnwand und Suche zeigen laut Spezifikation kein ⋮ in der Zeile. */
		ohneMenue?: boolean;
		bulkMode?: boolean;
		bulkSelected?: boolean;
		/** Ersteller, wenn es nicht der angemeldete Nutzer ist. */
		herkunft?: Mitnutzer | null;
		/** Wer angepinnt hat, wenn es nicht der angemeldete Nutzer ist. */
		pinner?: Mitnutzer | null;
		onToggle: (id: string) => void;
		onSelect: (task: Task) => void;
		onMenu: (e: Zeigerpunkt, task: Task) => void;
		onToggleSubs?: () => void;
		onToggleSubtask?: (id: string) => void;
		onEditSubtask?: (id: string, text: string) => void;
		onSubMenu?: (e: Zeigerpunkt, subtask: Task) => void;
		onReorderSubtask?: (subtaskId: string, parentId: string, newPosition: number) => void;
		onBulkToggle?: (id: string) => void;
	} = $props();

	let erledigteSubs = $derived(subtasks.filter((s) => s.done).length);
	let faellig = $derived(formatFaellig(task.due_date));
	let notiz = $derived((task.note ?? '').replace(/\s+/g, ' ').trim());
	let herkunftSeit = $derived(herkunft ? formatSeit(task.created_at) : '');
	/**
	 * Auf dem schmalen Schirm ist fuer Notizvorschau UND Herkunft kein Platz —
	 * gemessen bei 390 px blieb von „von Ingo · gerade eben" ein „v.". Die
	 * Notiz traegt mehr Information; die Herkunft steht ohnehin im Detail.
	 */
	let zeigeHerkunft = $derived(!!herkunft && !(mobil && !!notiz));
	let hatMeta = $derived(
		!!faellig.text || subtasks.length > 0 || !!notiz || zeigeHerkunft || !!pinner
	);
	let subsSichtbar = $derived(subsOpen && subtasks.length > 0);

	function abhaken(e: MouseEvent) {
		e.stopPropagation();
		onToggle(task.id);
	}

	function unteraufgabenUmschalten(e: MouseEvent) {
		e.stopPropagation();
		onToggleSubs?.();
	}

	function menueKnopf(e: MouseEvent) {
		e.stopPropagation();
		onMenu(e, task);
	}

	// ------------------------------------------------------------------
	// Zeigen und Tippen
	// ------------------------------------------------------------------
	// Auf dem Mobilgeraet traegt die Zeile kein ⋮ (Spezifikation Abschnitt 5);
	// das Menue kommt ueber langes Tippen. Das Ziehen beginnt laut Gesten-
	// Modell nach 300 ms Halten UND Bewegung (siehe actions/touchDrag.ts) —
	// Halten ohne Bewegung ist dort eine Leerstelle und gehoert hier dem Menue.
	/** Ab hier gilt ein Tippen als Halten und oeffnet das Menue. */
	const LANGES_TIPPEN = 450;
	/** So lange nach einer Beruehrung ist ein `contextmenu` das native Menue. */
	const NATIV_SPERRE = 700;
	/** Ab dieser Strecke war es kein Halten, sondern ein Wischen. */
	const WACKELN = 8;

	let tippStart = 0;
	let tippX = 0;
	let tippY = 0;
	let bewegt = false;
	/** Verhindert, dass der Klick nach einem langen Tippen die Zeile oeffnet. */
	let menueGeoeffnet = false;

	function beruehrungStart(e: TouchEvent) {
		tippStart = Date.now();
		bewegt = false;
		menueGeoeffnet = false;
		const t = e.touches[0];
		if (!t) return;
		tippX = t.clientX;
		tippY = t.clientY;
	}

	function beruehrungBewegt(e: TouchEvent) {
		const t = e.touches[0];
		if (!t) return;
		if (Math.abs(t.clientX - tippX) > WACKELN || Math.abs(t.clientY - tippY) > WACKELN)
			bewegt = true;
	}

	function beruehrungEnde(e: TouchEvent) {
		if (bewegt || Date.now() - tippStart < LANGES_TIPPEN) return;
		// Laeuft gerade ein Umsortieren, gehoert das Halten dem Ziehen.
		if (get(dragState).active) return;
		const t = e.changedTouches[0];
		if (!t) return;
		menueGeoeffnet = true;
		onMenu({ clientX: t.clientX, clientY: t.clientY, preventDefault() {} }, task);
	}

	function kontextmenue(e: MouseEvent) {
		e.preventDefault();
		// Android feuert `contextmenu` selbst beim langen Tippen; dort hat das
		// Halten bereits gewirkt und das native Menue stoert nur.
		if (Date.now() - tippStart < NATIV_SPERRE) return;
		onMenu(e, task);
	}

	function zeileGeklickt() {
		if (menueGeoeffnet) {
			menueGeoeffnet = false;
			return;
		}
		if (bulkMode) {
			onBulkToggle?.(task.id);
			return;
		}
		onSelect(task);
	}

	// ------------------------------------------------------------------
	// Unteraufgaben umsortieren (Zeigergeraet, HTML5-Drag)
	// ------------------------------------------------------------------
	let subZiel: number | null = $state(null);
	/** Waehrend eines Umbenennens darf nichts ziehen — sonst laesst sich der
	    Text im Feld nicht markieren. */
	let subBearbeitet = $state(false);
	let subZiehbar = $derived(!!onReorderSubtask && !subBearbeitet);

	function subZiehStart(e: DragEvent, sub: Task) {
		if (!e.dataTransfer) return;
		e.stopPropagation(); // sonst zieht die Aufgabe mit
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData(
			'application/x-subtask',
			JSON.stringify({ subtaskId: sub.id, parentId: task.id })
		);
	}

	function subZiehUeber(e: DragEvent, idx: number) {
		if (!onReorderSubtask) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		subZiel = e.clientY > rect.top + rect.height / 2 ? idx + 1 : idx;
	}

	function subFallen(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const ziel = subZiel;
		subZiel = null;
		if (!e.dataTransfer || !onReorderSubtask || ziel === null) return;
		try {
			const roh = e.dataTransfer.getData('application/x-subtask');
			if (!roh) return;
			const daten = JSON.parse(roh) as { subtaskId?: string };
			if (daten.subtaskId) onReorderSubtask(daten.subtaskId, task.id, ziel);
		} catch {
			/* unbrauchbare Zugdaten */
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class="tf-row"
	class:sel={selected}
	class:neu
	class:erledigt={task.done}
	class:gewaehlt={bulkSelected}
	onclick={zeileGeklickt}
	oncontextmenu={kontextmenue}
	ontouchstart={beruehrungStart}
	ontouchmove={beruehrungBewegt}
	ontouchend={beruehrungEnde}
>
	<span class="tf-bar {task.priority}"></span>

	<button
		class="tf-cb"
		class:done={task.done}
		onclick={abhaken}
		aria-label={task.done ? 'Aufgabe wieder öffnen' : 'Aufgabe abhaken'}
	>
		<span>{#if task.done}<Icon name="haken" size={14} />{/if}</span>
	</button>

	<div class="tf-body">
		<div class="tf-t">
			{#if task.emoji}<span class="em">{task.emoji}</span>{/if}
			<span class="tx">{task.text}</span>
			{#if task.priority === 'asap' && !task.done}
				<span class="tf-chip asap">ASAP</span>
			{/if}
			{#if neu}<span class="tf-chip neu">neu</span>{/if}
			{#if task.pinned}
				<span class="pin"><Icon name="pin" size={16} label="Angepinnt" /></span>
			{/if}
		</div>

		{#if hatMeta}
			<div class="tf-m">
				{#if faellig.text}
					<span class="el" class:over={faellig.ueberfaellig}>
						<Icon name="kalender" size={14} />{faellig.text}
					</span>
				{/if}
				{#if subtasks.length > 0}
					<button class="el zaehler" onclick={unteraufgabenUmschalten}>
						<Icon name="auswahl" size={14} />{erledigteSubs}/{subtasks.length}
						{#if subsSichtbar}<Icon name="chevron-auf" size={14} />{/if}
					</button>
				{/if}
				{#if notiz}
					<span class="el note"><Icon name="notiz" size={14} /><em>{notiz}</em></span>
				{/if}
				{#if herkunft && zeigeHerkunft}
					<span class="el von">
						<span class="tf-avatar klein" style="background:{herkunft.farbe}"
							>{herkunft.initialen}</span
						><span class="tx">von {herkunft.name}{herkunftSeit ? ` · ${herkunftSeit}` : ''}</span>
					</span>
				{/if}
				{#if pinner}
					<span class="tf-chip from">gepinnt von {pinner.name}</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if !mobil && !ohneMenue}
		<div class="tf-side">
			<button
				class="tf-more"
				class:on={menuOffen}
				onclick={menueKnopf}
				aria-label="Aufgabenmenü öffnen"
			>
				<Icon name="mehr" size={16} />
			</button>
		</div>
	{/if}
</div>

{#if subsSichtbar}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="tf-subs"
		class:mobil
		ondragover={(e) => {
			if (onReorderSubtask) e.preventDefault();
		}}
		ondrop={subFallen}
	>
		{#each subtasks as sub, idx (sub.id)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="tf-subwrap"
				class:ziel-oben={subZiel === idx}
				class:ziel-unten={subZiel === idx + 1}
				draggable={subZiehbar ? 'true' : 'false'}
				ondragstart={(e) => subZiehStart(e, sub)}
				ondragend={() => (subZiel = null)}
				ondragover={(e) => subZiehUeber(e, idx)}
			>
				<SubtaskRow
					subtask={sub}
					{mobil}
					onToggle={onToggleSubtask ?? (() => {})}
					onEdit={onEditSubtask}
					onMenu={onSubMenu}
					onBearbeitet={(aktiv) => (subBearbeitet = aktiv)}
				/>
			</div>
		{/each}
	</div>
{/if}
