<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';

	/**
	 * Faelligkeit setzen — Datum UND Uhrzeit in EINEM Schritt.
	 *
	 * Bis hierher lagen beide nativen Felder direkt im Detail und schrieben
	 * bei jeder Aenderung sofort in die Datenbank. Wer erst ein Datum und
	 * dann eine Uhrzeit setzen wollte, loeste damit zwei Schreibvorgaenge
	 * aus — und der alte `DatePicker` schloss sich nach dem ersten sogar.
	 * Jetzt sammelt dieser Waehler beides und meldet es erst bei
	 * „Uebernehmen" nach oben (Plan T11, Schritt 3).
	 *
	 * Ohne Datum ist eine Uhrzeit gegenstandslos: das Zeitfeld bleibt dann
	 * gesperrt, und „Uebernehmen" loescht in diesem Fall die Faelligkeit.
	 */
	let {
		datum: datumStart = '',
		zeit: zeitStart = '',
		x,
		y,
		mobil = false,
		onUebernehmen,
		onClose
	}: {
		/** Vorbelegung im Format der Datumseingabe (YYYY-MM-TT). */
		datum?: string;
		/** Vorbelegung als HH:MM, leer = ganztaegig. */
		zeit?: string;
		x: number;
		y: number;
		mobil?: boolean;
		/** `null` = Faelligkeit entfernen. */
		onUebernehmen: (wert: { datum: string; zeit: string } | null) => void;
		onClose: () => void;
	} = $props();

	// Bewusst eine Kopie beim Oeffnen: der Waehler sammelt, bis bestaetigt
	// wird. `untrack` sagt das auch dem Uebersetzer — sonst warnt er, hier
	// werde nur der Anfangswert einer Prop gelesen.
	let datum = $state(untrack(() => datumStart));
	let zeit = $state(untrack(() => zeitStart));
	let panelEl: HTMLDivElement | undefined = $state();
	let datumFeld: HTMLInputElement | undefined = $state();

	$effect(() => {
		tick().then(() => datumFeld?.focus());
	});

	/** In den Sichtbereich klemmen — wie Kontextmenue und Symbolwaehler. */
	$effect(() => {
		const px = x;
		const py = y;
		const el = panelEl;
		if (!el || mobil) return;
		el.style.left = `${px}px`;
		el.style.top = `${py}px`;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const bw = el.offsetWidth;
		const bh = el.offsetHeight;
		if (px + bw > vw - 8) el.style.left = `${Math.max(8, vw - bw - 8)}px`;
		if (py + bh > vh - 8) {
			const gekippt = py - bh - 12;
			el.style.top = `${gekippt >= 8 ? gekippt : Math.max(8, vh - bh - 8)}px`;
		}
	});

	function uebernehmen() {
		onUebernehmen(datum ? { datum, zeit } : null);
		onClose();
	}

	function entfernen() {
		onUebernehmen(null);
		onClose();
	}

	/**
	 * Escape schliesst NUR diesen Waehler, Enter bestaetigt ihn.
	 *
	 * Der globale Tastenhoerer der Seite haengt ebenfalls am window und wurde
	 * frueher registriert — in der Blasenphase liefe er damit ZUERST und
	 * raeumte nebenbei die Aufgabenauswahl ab. Ein Hoerer in der
	 * EINFANGPHASE kommt dagegen immer vor allen Blasen-Hoerern desselben
	 * Ziels; `stopImmediatePropagation` dort beendet den Lauf endgueltig.
	 */
	$effect(() => {
		function tasten(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.stopImmediatePropagation();
				onClose();
				return;
			}
			if (e.key !== 'Enter') return;
			e.preventDefault();
			e.stopImmediatePropagation();
			uebernehmen();
		}
		window.addEventListener('keydown', tasten, true);
		return () => window.removeEventListener('keydown', tasten, true);
	});
</script>

<div class="tf-datum-hinter" class:mobil onclick={onClose} role="presentation"></div>

<div
	bind:this={panelEl}
	class="tf-datum"
	class:mobil
	style={mobil ? '' : `left:${x}px; top:${y}px`}
	role="dialog"
	aria-modal="true"
	aria-label="F&auml;lligkeit setzen"
>
	<div class="zeile">
		<label class="fld" for="tf-datum-tag">
			<Icon name="kalender" size={16} />
			<input id="tf-datum-tag" bind:this={datumFeld} bind:value={datum} type="date" />
		</label>
		<label class="fld zeit" for="tf-datum-zeit" class:aus={!datum}>
			<input id="tf-datum-zeit" bind:value={zeit} type="time" disabled={!datum} />
		</label>
	</div>

	<div class="acts">
		{#if datumStart}
			<button class="tf-btn ghost" onclick={entfernen}>Entfernen</button>
		{/if}
		<span class="sp"></span>
		<button class="tf-btn" onclick={onClose}>Abbrechen</button>
		<button class="tf-btn primary" onclick={uebernehmen}>&Uuml;bernehmen</button>
	</div>
</div>
