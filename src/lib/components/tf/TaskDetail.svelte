<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { Database } from '$lib/types/database';
	import Icon from './Icon.svelte';
	import DatePicker from './DatePicker.svelte';
	import TaskHistory, { type VerlaufAnbindung } from './TaskHistory.svelte';
	import {
		priorityLabels,
		priorityOrder,
		timeframeLabels,
		timeframeOrder,
		type Priority,
		type Timeframe
	} from '$lib/constants';
	import { formatFaelligLang, zerlegeFaellig, baueFaellig } from '$lib/utils/datum';
	import type { Zeigerpunkt } from '$lib/composables/tf/useContextMenus.svelte';

	type Task = Database['public']['Tables']['tasks']['Row'];
	type List = Database['public']['Tables']['lists']['Row'];

	/**
	 * Aufgabendetail — Spezifikation Abschnitt 3 Punkt 3 (Spalte) und
	 * Abschnitt 4 (Bottom-Sheet). EIN Inhalt, zwei Fassungen: die Spalte
	 * rechts auf dem Desktop und das Sheet ueber der Liste auf dem Handy.
	 * Die Komponente rendert drei Geschwister — Kopf, Rumpf (scrollt) und
	 * Aktionsleiste —, damit die Leiste unten steht und nicht mitscrollt.
	 *
	 * Hier liegen die Felder, die frueher im Kontextmenue versteckt waren:
	 * Faelligkeit mit Datum UND Uhrzeit, Anpinnen, Verschieben, Loeschen.
	 * „Umbenennen" gibt es nicht mehr — der Titel wird an Ort und Stelle
	 * bearbeitet.
	 *
	 * Abgeloest wird damit `v2/FocusOverlay.svelte`. Dessen Huelle
	 * (Scrim, position:fixed, Klick daneben, eigenes Escape) faellt
	 * ersatzlos weg; das Sheet bringt seine eigene mit.
	 */
	let {
		task,
		subtasks = [],
		liste = null,
		listen = [],
		variante = 'spalte',
		onSchliessen,
		onToggle,
		onUmbenennen,
		onPrioritaet,
		onZeitrahmen,
		onFaellig,
		onNotiz,
		onPin,
		onVerschieben,
		onLoeschen,
		onUnterToggle,
		onUnterUmbenennen,
		onUnterLoeschen,
		onUnterNeu,
		onMenue,
		verlauf = null
	}: {
		task: Task;
		subtasks?: Task[];
		/** Liste der Aufgabe — traegt den Chip im Kopf. */
		liste?: List | null;
		/** Alle Listen — Ziele fuer „Verschieben". */
		listen?: List[];
		variante?: 'spalte' | 'sheet';
		onSchliessen: () => void;
		onToggle: (id: string) => void;
		onUmbenennen: (id: string, text: string) => void;
		onPrioritaet: (id: string, p: Priority) => void;
		onZeitrahmen: (id: string, tf: Timeframe | null) => void;
		onFaellig: (id: string, wert: string | null) => void;
		onNotiz: (id: string, note: string) => void;
		onPin: (id: string) => void;
		onVerschieben: (id: string, listId: string) => void;
		onLoeschen: (id: string) => void;
		onUnterToggle: (id: string) => void;
		onUnterUmbenennen: (id: string, text: string) => void;
		onUnterLoeschen: (id: string) => void;
		onUnterNeu: (parentId: string, text: string) => void;
		/** ⋮ im Sheet-Kopf; ohne Angabe entfaellt der Knopf. */
		onMenue?: (e: Zeigerpunkt, task: Task) => void;
		/**
		 * Aufgabenhistorie. `null` bei Unteraufgaben und Trennern — die
		 * Historie gibt es nur an Aufgaben oberster Ebene.
		 */
		verlauf?: VerlaufAnbindung | null;
	} = $props();

	const sheet = $derived(variante === 'sheet');

	// ==================================================================
	// NOTIZ — der einzige Wert, der verloren gehen kann
	// ==================================================================
	// Gespeichert wird an zwei Stellen: bei `blur` UND beim Wechsel der
	// Auswahl (die Komponente bleibt dabei stehen, nur `task` wechselt).
	// Solange das Feld den Fokus hat, haelt der Entwurf stand — ein
	// eintreffendes Realtime-UPDATE (es ersetzt das ganze Task-Objekt)
	// darf das gerade Getippte nicht ueberschreiben.
	let notizEntwurf = $state('');
	/** Bewusst KEIN $state: der Fokus soll den Abgleich-Effekt nicht ausloesen. */
	let notizFokus = false;
	/** Wem gehoert der Entwurf, und was stand zuletzt in der Datenbank. */
	let notizId = '';
	let notizBasis = '';
	let notizFeld = $state<HTMLTextAreaElement | undefined>(undefined);

	function notizSichern() {
		if (!notizId) return;
		if (notizEntwurf === notizBasis) return;
		const id = notizId;
		const wert = notizEntwurf;
		notizBasis = wert;
		onNotiz(id, wert);
	}

	function notizVerlassen() {
		notizFokus = false;
		notizSichern();
	}

	// ==================================================================
	// TITEL, UNTERAUFGABEN-EINGABE, POPOVER
	// ==================================================================
	let titelBearbeitet = $state(false);
	let titelEntwurf = $state('');
	let titelFeld = $state<HTMLInputElement | undefined>(undefined);

	let unterNeu = $state(false);
	let unterEntwurf = $state('');
	let unterFeld = $state<HTMLInputElement | undefined>(undefined);

	let unterBearbeitetId = $state<string | null>(null);
	let unterBearbeitetText = $state('');
	let unterBearbeitetFeld = $state<HTMLInputElement | undefined>(undefined);

	/** Listenwahl: am Kopf-Chip oder ueber dem Knopf „Verschieben". */
	let listenwahl = $state<'kopf' | 'aktion' | null>(null);
	let wahlFeld = $state<HTMLDivElement | undefined>(undefined);

	/**
	 * Wechsel der Auswahl. Die Seite haelt die Komponente bewusst ohne
	 * {#key} am Leben, damit genau hier der alte Entwurf gesichert wird,
	 * bevor der neue uebernommen wird.
	 */
	$effect(() => {
		const id = task.id;
		const gespeichert = task.note ?? '';
		untrack(() => {
			if (notizId !== id) {
				notizSichern();
				notizId = id;
				notizBasis = gespeichert;
				notizEntwurf = gespeichert;
				// Alle offenen Bearbeitungen gehoeren zur alten Aufgabe.
				titelBearbeitet = false;
				unterNeu = false;
				unterEntwurf = '';
				unterBearbeitetId = null;
				listenwahl = null;
				datumAuf = false;
				return;
			}
			// Dieselbe Aufgabe, neuer Wert von aussen: nur uebernehmen,
			// solange niemand im Feld steht.
			if (!notizFokus && gespeichert !== notizEntwurf) {
				notizBasis = gespeichert;
				notizEntwurf = gespeichert;
			}
		});
	});

	/** Beim Abbau (Auswahl aufgehoben, Sheet geschlossen) nicht verlieren. */
	$effect(() => {
		return () => untrack(() => notizSichern());
	});

	/** Notizfeld waechst mit dem Inhalt; die Mindesthoehe kommt aus dem CSS. */
	$effect(() => {
		const el = notizFeld;
		// Abhaengigkeit auf den Text, damit auch fremde Aenderungen wirken.
		void notizEntwurf;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	});

	// ==================================================================
	// ABGELEITETES
	// ==================================================================
	const faellig = $derived(formatFaelligLang(task.due_date));
	const felder = $derived(zerlegeFaellig(task.due_date));
	const erledigteSubs = $derived(subtasks.filter((s) => s.done).length);
	const fortschritt = $derived(
		subtasks.length > 0 ? Math.round((erledigteSubs / subtasks.length) * 100) : 0
	);

	// ==================================================================
	// AKTIONEN
	// ==================================================================
	async function titelStarten() {
		titelEntwurf = task.text;
		titelBearbeitet = true;
		await tick();
		titelFeld?.focus();
		titelFeld?.select();
	}

	function titelSichern() {
		const text = titelEntwurf.trim();
		if (text && text !== task.text) onUmbenennen(task.id, text);
		titelBearbeitet = false;
	}

	function titelTaste(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			titelSichern();
		}
		if (e.key === 'Escape') {
			// Escape beendet hier nur die Bearbeitung. Ohne stopPropagation
			// wuerde die Seite zusaetzlich die Auswahl aufheben.
			e.stopPropagation();
			titelBearbeitet = false;
		}
	}

	/**
	 * Faelligkeit: ein Waehler fuer Datum UND Uhrzeit, geschrieben wird erst
	 * beim Bestaetigen. Vorher lagen zwei native Felder direkt im Feld und
	 * schrieben bei jeder Aenderung einzeln — Datum und Uhrzeit nacheinander
	 * zu setzen kostete zwei Schreibvorgaenge.
	 */
	let datumAuf = $state(false);
	let datumPos = $state({ x: 0, y: 0 });

	function datumOeffnen(e: MouseEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		datumPos = { x: r.left, y: r.bottom + 6 };
		datumAuf = true;
	}

	function datumUebernehmen(wert: { datum: string; zeit: string } | null) {
		onFaellig(task.id, wert ? baueFaellig(wert.datum, wert.zeit) : null);
	}

	async function unterNeuStarten() {
		unterNeu = true;
		await tick();
		unterFeld?.focus();
	}

	function unterNeuSichern(weiter: boolean) {
		const text = unterEntwurf.trim();
		unterEntwurf = '';
		if (text) onUnterNeu(task.id, text);
		if (!weiter) unterNeu = false;
	}

	function unterNeuTaste(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			// Nach dem Anlegen bleibt das Feld offen — mehrere Unteraufgaben
			// hintereinander sind der Normalfall.
			unterNeuSichern(true);
		}
		if (e.key === 'Escape') {
			e.stopPropagation();
			unterEntwurf = '';
			unterNeu = false;
		}
	}

	async function unterBearbeiten(sub: Task) {
		unterBearbeitetId = sub.id;
		unterBearbeitetText = sub.text;
		await tick();
		unterBearbeitetFeld?.focus();
		unterBearbeitetFeld?.select();
	}

	function unterBearbeitetSichern() {
		const id = unterBearbeitetId;
		if (!id) return;
		const text = unterBearbeitetText.trim();
		const alt = subtasks.find((s) => s.id === id);
		if (text && alt && text !== alt.text) onUnterUmbenennen(id, text);
		unterBearbeitetId = null;
	}

	function unterBearbeitetTaste(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			unterBearbeitetSichern();
		}
		if (e.key === 'Escape') {
			e.stopPropagation();
			unterBearbeitetId = null;
		}
	}

	async function listenwahlOeffnen(wo: 'kopf' | 'aktion') {
		listenwahl = listenwahl === wo ? null : wo;
		if (!listenwahl) return;
		await tick();
		wahlFeld?.focus();
	}

	function listenwahlTaste(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		// Escape schliesst erst das Popover, nicht gleich das ganze Detail.
		e.stopPropagation();
		listenwahl = null;
	}

	function verschiebeNach(listId: string) {
		listenwahl = null;
		if (listId !== task.list_id) onVerschieben(task.id, listId);
	}

	function loeschen() {
		// Kein Bestaetigungsdialog: das Loeschen einer einzelnen Aufgabe
		// traegt laut Spezifikation einen Undo-Toast (Abschnitt 6).
		onLoeschen(task.id);
	}
</script>

{#snippet listenPopover(wo: 'kopf' | 'aktion')}
	<div
		bind:this={wahlFeld}
		class="tf-popmenu tf-wahl {wo}"
		role="menu"
		tabindex="-1"
		onkeydown={listenwahlTaste}
	>
		{#each listen as l (l.id)}
			<button class="tf-mi" role="menuitem" onclick={() => verschiebeNach(l.id)}>
				<span class="em">{l.icon}</span>
				<span class="nm">{l.title}</span>
				{#if l.id === task.list_id}<Icon name="haken" size={16} />{/if}
			</button>
		{/each}
	</div>
{/snippet}

{#snippet listenChip()}
	<span class="tf-wahlanker">
		<button class="tf-listchip" onclick={() => listenwahlOeffnen('kopf')}>
			{#if liste}<span class="em">{liste.icon}</span>{/if}
			<span class="nm">{liste?.title ?? 'Ohne Liste'}</span>
			<Icon name="chevron-ab" size={14} />
		</button>
		{#if listenwahl === 'kopf'}
			{@render listenPopover('kopf')}
		{/if}
	</span>
{/snippet}

{#snippet gruppePrio()}
	<div class="tf-grp erste" class:tight={sheet}>
		{#if !sheet}<div class="tf-lbl">Priorit&auml;t</div>{/if}
		<div class="tf-seg">
			{#each priorityOrder as p (p)}
				<button class="tf-segopt" class:on={task.priority === p} onclick={() => onPrioritaet(task.id, p)}>
					<i style="background:var(--{p})"></i>{priorityLabels[p]}
				</button>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet gruppeZeitrahmen()}
	<div class="tf-grp" class:tight={sheet}>
		<div class="tf-lbl">Zeitrahmen</div>
		<div class="tf-chips">
			<button class:on={!task.timeframe} onclick={() => onZeitrahmen(task.id, null)}>Keiner</button>
			{#each timeframeOrder as tf (tf)}
				<button class:on={task.timeframe === tf} onclick={() => onZeitrahmen(task.id, tf)}>
					{timeframeLabels[tf]}
				</button>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet gruppeFaellig()}
	<div class="tf-grp" class:tight={sheet}>
		{#if !sheet}<div class="tf-lbl">F&auml;llig</div>{/if}
		<div class="tf-field">
			<Icon name="kalender" size={16} />
			<button class="zone datum" onclick={datumOeffnen} aria-label="F&auml;lligkeit setzen">
				{#if faellig}
					<span class="val">{faellig.datum}</span>
				{:else}
					<span class="leer">Kein Datum</span>
				{/if}
			</button>
			{#if felder.datum}
				<button class="zone zeit" onclick={datumOeffnen} aria-label="Uhrzeit setzen">
					{#if felder.zeit}
						<span class="sub2">{felder.zeit}</span>
					{:else}
						<span class="leer">Zeit</span>
					{/if}
				</button>
				<button
					class="clr"
					class:gross={sheet}
					aria-label="F&auml;lligkeit entfernen"
					onclick={() => onFaellig(task.id, null)}
				>
					<Icon name="leeren" size={16} />
				</button>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet gruppeUnteraufgaben()}
	<div class="tf-grp" class:tight={sheet}>
		<div class="tf-lbl zeile">
			Unteraufgaben
			{#if subtasks.length > 0}
				<span class="n">{erledigteSubs}/{subtasks.length}</span>
				<span class="tf-prog"><i style="width:{fortschritt}%"></i></span>
			{/if}
		</div>

		{#each subtasks as sub (sub.id)}
			<div class="tf-subl" class:done={sub.done}>
				<button
					class="tf-cb"
					class:done={sub.done}
					onclick={() => onUnterToggle(sub.id)}
					aria-label={sub.done ? 'Unteraufgabe wieder öffnen' : 'Unteraufgabe abhaken'}
				>
					<span>{#if sub.done}<Icon name="haken" size={14} />{/if}</span>
				</button>
				{#if unterBearbeitetId === sub.id}
					<input
						bind:this={unterBearbeitetFeld}
						bind:value={unterBearbeitetText}
						class="tf-inline"
						onblur={unterBearbeitetSichern}
						onkeydown={unterBearbeitetTaste}
						maxlength="500"
					/>
				{:else}
					<button class="tx" onclick={() => unterBearbeiten(sub)}>{sub.text}</button>
				{/if}
				<button
					class="del"
					aria-label="Unteraufgabe l&ouml;schen"
					onclick={() => onUnterLoeschen(sub.id)}
				>
					<Icon name="loeschen" size={16} />
				</button>
			</div>
		{/each}

		{#if unterNeu}
			<div class="tf-subl">
				<span class="plus"><Icon name="plus" size={16} /></span>
				<input
					bind:this={unterFeld}
					bind:value={unterEntwurf}
					class="tf-inline"
					placeholder="Unteraufgabe …"
					onblur={() => unterNeuSichern(false)}
					onkeydown={unterNeuTaste}
					maxlength="500"
				/>
			</div>
		{:else}
			<button class="tf-subl add" onclick={unterNeuStarten}>
				<span class="plus"><Icon name="plus" size={16} /></span>
				<span class="tx">Unteraufgabe</span>
			</button>
		{/if}
	</div>
{/snippet}

{#snippet gruppeNotiz()}
	<div class="tf-grp" class:tight={sheet}>
		<div class="tf-lbl">Notiz</div>
		<textarea
			bind:this={notizFeld}
			bind:value={notizEntwurf}
			class="tf-notebox"
			placeholder="Notiz &hellip;"
			onfocus={() => (notizFokus = true)}
			onblur={notizVerlassen}
		></textarea>
	</div>
{/snippet}

<!-- Kopf: Spalte = Zurueck + Listen-Chip; Sheet = Schliessen + Chip + ⋮ -->
<div class="tf-dh" class:sheet>
	{#if sheet}
		<button class="tf-ib gross" onclick={onSchliessen} aria-label="Detail schlie&szlig;en">
			<Icon name="chevron-ab" />
		</button>
		<span class="lst">{@render listenChip()}</span>
		{#if onMenue}
			<button
				class="tf-ib gross"
				aria-label="Aufgabenmen&uuml; &ouml;ffnen"
				onclick={(e) => onMenue?.(e, task)}
			>
				<Icon name="mehr" />
			</button>
		{:else}
			<span class="tf-ib gross"></span>
		{/if}
	{:else}
		<button class="tf-ib" onclick={onSchliessen} aria-label="Auswahl aufheben">
			<Icon name="chevron-links" />
		</button>
		<span class="sp"></span>
		{@render listenChip()}
	{/if}
</div>

<div class="tf-detail-body">
	<div class="tf-dt" class:sheet>
		<button
			class="tf-cb"
			class:done={task.done}
			onclick={() => onToggle(task.id)}
			aria-label={task.done ? 'Aufgabe wieder öffnen' : 'Aufgabe abhaken'}
		>
			<span>{#if task.done}<Icon name="haken" size={14} />{/if}</span>
		</button>
		{#if titelBearbeitet}
			<input
				bind:this={titelFeld}
				bind:value={titelEntwurf}
				class="titel"
				aria-label="Titel der Aufgabe"
				onblur={titelSichern}
				onkeydown={titelTaste}
				maxlength="500"
			/>
		{:else}
			<!-- Der Knopf haelt die Ueberschrift mit der Tastatur erreichbar;
			     „Umbenennen" gibt es im Menue nicht mehr. -->
			<h3 class:erledigt={task.done}>
				<button onclick={titelStarten}>{task.text}</button>
			</h3>
		{/if}
	</div>

	{@render gruppePrio()}
	{#if sheet}
		{@render gruppeFaellig()}
		{@render gruppeZeitrahmen()}
	{:else}
		{@render gruppeZeitrahmen()}
		{@render gruppeFaellig()}
	{/if}
	{@render gruppeUnteraufgaben()}
	{@render gruppeNotiz()}
	<!-- Verlauf direkt unter der Notiz (Spezifikation Aufgabenhistorie) -->
	{#if verlauf}
		<TaskHistory aufgabeId={task.id} {sheet} {...verlauf} />
	{/if}
</div>

<!--
	Die drei Knoepfe sind die EINZIGEN Flex-Elemente der Leiste — sonst
	verschoebe ein Huellelement fuer das Popover die gleichen Drittel.
	Das Popover haengt absolut in der Leiste und steht darum ausserhalb
	des Flusses.
-->
<div class="tf-acts" class:sheet>
	<button class="tf-btn" class:pinned={task.pinned} onclick={() => onPin(task.id)}>
		<Icon name="pin" size={16} />{task.pinned ? 'Gepinnt' : 'Anpinnen'}
	</button>
	<button class="tf-btn" onclick={() => listenwahlOeffnen('aktion')}>
		<Icon name="verschieben" size={16} />Verschieben
	</button>
	<button class="tf-btn danger" onclick={loeschen}>
		<Icon name="loeschen" size={16} />L&ouml;schen
	</button>
	{#if listenwahl === 'aktion'}
		{@render listenPopover('aktion')}
	{/if}
</div>

{#if listenwahl}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="tf-backdrop" onclick={() => (listenwahl = null)}></div>
{/if}

{#if datumAuf}
	<DatePicker
		datum={felder.datum}
		zeit={felder.zeit}
		x={datumPos.x}
		y={datumPos.y}
		mobil={sheet}
		onUebernehmen={datumUebernehmen}
		onClose={() => (datumAuf = false)}
	/>
{/if}
