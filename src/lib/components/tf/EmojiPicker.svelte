<script lang="ts">
	/**
	 * Symbolwaehler fuer Listen — Karte „Neue Liste" und Menueeintrag
	 * „Icon aendern".
	 *
	 * Nachfolger von `components/v2/EmojiPicker.svelte`. Dort waren die
	 * Knoepfe 32 x 32 und wuchsen beim Ueberfahren auf 115 % — beides
	 * verboten: die Spezifikation verlangt am Finger mindestens 44 px
	 * (Abschnitt 9, Punkt 4) und untersagt Animationen (Punkt 3). Hier
	 * sind die Ziele 44 x 44, die Hervorhebung ist eine Flaeche.
	 *
	 * Sechs Spalten statt acht: 6 x 44 px passen mit Polster in die 390 px
	 * des schmalsten Schirms, acht nicht.
	 */
	let {
		x,
		y,
		aktuell = '',
		onSelect,
		onClose
	}: {
		x: number;
		y: number;
		/** Aktuelles Symbol — bekommt die Auswahlflaeche. */
		aktuell?: string;
		onSelect: (emoji: string) => void;
		onClose: () => void;
	} = $props();

	const emojis = [
		'\u{1F4CB}', '\u{1F3AF}', '\u{1F512}', '\u{1F98A}', '\u{1F4A1}', '\u{1F680}',
		'⚡', '\u{1F525}', '\u{1F4CC}', '\u{1F3E0}', '\u{1F4BC}', '\u{1F5A5}️',
		'\u{1F4DD}', '✨', '\u{1F3A8}', '\u{1F6E0}️', '\u{1F4CA}', '\u{1F5C2}️',
		'\u{1F514}', '❤️', '⭐', '\u{1F389}', '\u{1F4E6}', '\u{1F31F}',
		'\u{1F9B7}', '\u{1F4C5}', '\u{1F3AA}', '\u{1F48E}', '\u{1F9E9}', '\u{1F4F1}',
		'\u{1F30D}', '\u{1F527}'
	];

	let pickerEl: HTMLDivElement | undefined = $state();

	/** In den Sichtbereich klemmen — wie beim Kontextmenue. */
	$effect(() => {
		const px = x;
		const py = y;
		const el = pickerEl;
		if (!el) return;
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

	function waehlen(emoji: string) {
		onSelect(emoji);
		onClose();
	}

	/**
	 * Escape schliesst NUR diesen Waehler.
	 *
	 * Der globale Tastenhoerer der Seite haengt ebenfalls am window und wurde
	 * frueher registriert — in der Blasenphase liefe er damit ZUERST und
	 * raeumte nebenbei die Aufgabenauswahl ab. Ein Hoerer in der
	 * EINFANGPHASE kommt dagegen immer vor allen Blasen-Hoerern desselben
	 * Ziels; `stopImmediatePropagation` dort beendet den Lauf endgueltig.
	 */
	$effect(() => {
		function tasten(e: KeyboardEvent) {
			if (e.key !== 'Escape') return;
			e.stopImmediatePropagation();
			onClose();
		}
		window.addEventListener('keydown', tasten, true);
		return () => window.removeEventListener('keydown', tasten, true);
	});
</script>

<div class="tf-emoji-hinter" onclick={onClose} role="presentation"></div>

<div bind:this={pickerEl} class="tf-emoji" style="left:{x}px; top:{y}px" role="menu">
	{#each emojis as emoji (emoji)}
		<button
			class="em"
			class:on={emoji === aktuell}
			role="menuitem"
			onclick={() => waehlen(emoji)}
			aria-label="Symbol {emoji}"
		>
			{emoji}
		</button>
	{/each}
	<button class="weg" onclick={() => waehlen('')}>Symbol entfernen</button>
</div>
