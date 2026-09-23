<script lang="ts" module>
	import type { IconName } from './Icon.svelte';

	/**
	 * Ein Menueeintrag. Icons kommen ausschliesslich aus dem Stroke-Set
	 * (Icon.svelte) — Emoji bleiben den Listen-Symbolen vorbehalten und
	 * stehen darum nur im Untermenue („In Liste verschieben") als `emoji`.
	 */
	export type MenuEintrag = {
		label: string;
		icon?: IconName;
		/** Zusatz rechts: Zahl („3", „8") oder Wert („Manuell"). Den Chevron
		    setzt das Untermenue selbst — ein eigenes Flag dafuer hatte nie
		    einen Sender. */
		extra?: string;
		action?: () => void;
		danger?: boolean;
		divider?: boolean;
		/** Nicht anwaehlbar (z. B. „Keine weitere Liste"). */
		inaktiv?: boolean;
		submenu?: { label: string; emoji?: string; action: () => void; active?: boolean }[];
	};
</script>

<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * Popover-Menue nach A-klar-spec.md, Abschnitt 6.
	 *
	 * Flaeche `--surface`, Rahmen 1 px `--line`, Radius 12, Breite 220
	 * (mobiles Listenmenue 232), Eintrag 38 px am Zeiger / 44 px am Finger.
	 * Keine Einblendanimation — die Spezifikation verbietet sie (Abschnitt 9).
	 */
	let {
		items,
		x,
		y,
		breite = 220,
		onclose
	}: {
		items: MenuEintrag[];
		x: number;
		y: number;
		breite?: number;
		onclose: () => void;
	} = $props();

	let menuEl: HTMLDivElement | undefined = $state();
	let submenuEl: HTMLDivElement | undefined = $state();
	let offenesUnter = $state<string | null>(null);
	let unterAnker = $state<DOMRect | null>(null);

	// Gnadenfrist gegen Ghost-Clicks: nach einem langen Tippen liegt der
	// Finger noch auf und der Browser schickt hinterher ein synthetisches
	// click/contextmenu. Ohne diese 350 ms schliesst sich das Menue auf
	// Android sofort wieder (uebernommen aus components/v2/ContextMenu.svelte).
	let geoeffnetUm = Date.now();
	$effect(() => {
		void items;
		void x;
		void y;
		geoeffnetUm = Date.now();
		offenesUnter = null;
	});
	function geschuetztSchliessen() {
		if (Date.now() - geoeffnetUm < 350) return;
		onclose();
	}

	// Hauptmenue klemmen. x/y werden UNBEDINGT vor dem frühen `return`
	// gelesen, damit der Effekt bei jeder Positionsaenderung erneut laeuft
	// (Svelte-5-Abhaengigkeiten).
	//
	// Die waagerechte Grenze ist NICHT das Fenster, sondern die Listenspalte:
	// Spezifikation Abschnitt 3 sagt „Overlays liegen in dieser Spalte" und
	// setzt das Aufgabenmenue auf `right:24px`. Gegen das Fenster geklemmt
	// ragte es 190 px in die Detailspalte. Steht keine Listenspalte im Baum
	// (mobiler Unterschirm), bleibt das Fenster die Grenze.
	$effect(() => {
		const px = x;
		const py = y;
		const bw = breite;
		if (!menuEl) return;
		menuEl.style.left = `${px}px`;
		menuEl.style.top = `${py}px`;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const mw = menuEl.offsetWidth || bw;
		const mh = menuEl.offsetHeight;
		const spalte = vw >= 900 ? document.querySelector('.tf-main')?.getBoundingClientRect() : null;
		const grenzeRechts = spalte ? Math.min(vw - 8, spalte.right - 24) : vw - 8;
		const grenzeLinks = spalte ? Math.max(8, spalte.left + 8) : 8;
		if (px + mw > grenzeRechts) menuEl.style.left = `${Math.max(grenzeLinks, grenzeRechts - mw)}px`;
		if (py + mh > vh - 8) {
			const obenGekippt = py - mh;
			menuEl.style.top = `${obenGekippt >= 8 ? obenGekippt : Math.max(8, vh - mh - 8)}px`;
		}
	});

	// Touch-Browser schicken ein emuliertes `mouseenter` unmittelbar vor dem
	// `click` desselben Tippens. Ohne diese 500 ms wuerde der Klick das gerade
	// per mouseenter geoeffnete Untermenue sofort wieder zuklappen.
	let unterGeoeffnetUm = 0;

	function unterOeffnen(label: string, ankerEl: HTMLElement) {
		unterAnker = ankerEl.getBoundingClientRect();
		offenesUnter = label;
		unterGeoeffnetUm = Date.now();
	}

	function unterUmschalten(label: string, ankerEl: HTMLElement) {
		if (offenesUnter === label) {
			if (Date.now() - unterGeoeffnetUm < 500) return;
			offenesUnter = null;
		} else {
			unterOeffnen(label, ankerEl);
		}
	}

	// Untermenue (position:fixed) waagerecht und senkrecht klemmen.
	$effect(() => {
		const anker = unterAnker;
		if (!submenuEl || !anker) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const sw = submenuEl.offsetWidth;
		const sh = submenuEl.offsetHeight;
		let links = anker.right;
		if (links + sw > vw - 8) links = Math.max(8, anker.left - sw);
		let oben = anker.top - 1;
		if (oben + sh > vh - 8) oben = Math.max(8, vh - sh - 8);
		submenuEl.style.left = `${links}px`;
		submenuEl.style.top = `${oben}px`;
	});
</script>

<!-- Klick daneben schliesst — aber erst nach der Gnadenfrist. -->
<div
	class="tf-menu-hinter"
	onclick={geschuetztSchliessen}
	oncontextmenu={(e) => {
		e.preventDefault();
		geschuetztSchliessen();
	}}
	role="presentation"
></div>

<div bind:this={menuEl} class="tf-menu" style="left:{x}px; top:{y}px; width:{breite}px" role="menu">
	{#each items as item, i (i)}
		{#if item.divider}
			<hr />
		{:else if item.submenu}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				onmouseenter={(e) => unterOeffnen(item.label, e.currentTarget as HTMLElement)}
				onmouseleave={() => (offenesUnter = null)}
			>
				<button
					class="tf-mi"
					role="menuitem"
					onclick={(e) => unterUmschalten(item.label, e.currentTarget as HTMLElement)}
				>
					{#if item.icon}<Icon name={item.icon} size={20} />{/if}
					<span class="lbl">{item.label}</span>
					<span class="r">
						{#if item.extra}{item.extra}{/if}
						<Icon name="chevron-rechts" size={14} />
					</span>
				</button>
				{#if offenesUnter === item.label}
					<div bind:this={submenuEl} class="tf-menu tf-unter" style="width:{breite}px" role="menu">
						{#each item.submenu as sub, j (j)}
							<button
								class="tf-mi"
								role="menuitem"
								onclick={() => {
									sub.action();
									onclose();
								}}
							>
								{#if sub.emoji}<span class="em">{sub.emoji}</span>{/if}
								<span class="lbl">{sub.label}</span>
								{#if sub.active}<span class="r"><Icon name="haken" size={16} /></span>{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="tf-mi"
				class:danger={item.danger}
				class:aus={item.inaktiv}
				role="menuitem"
				disabled={item.inaktiv}
				onclick={() => {
					item.action?.();
					onclose();
				}}
			>
				{#if item.icon}<Icon name={item.icon} size={20} />{/if}
				<span class="lbl">{item.label}</span>
				{#if item.extra}
					<span class="r">{item.extra}</span>
				{/if}
			</button>
		{/if}
	{/each}
</div>
