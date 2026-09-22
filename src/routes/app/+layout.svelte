<script lang="ts">
	import '../../v2.css';
	import { browser } from '$app/environment';
	import { theme } from '$lib/stores/v2/theme.svelte';

	/**
	 * Rahmen der App: Wurzelelement, Theme-Klasse, Statusleistenfarbe.
	 *
	 * Die Oberflaeche selbst — drei Spalten auf dem Desktop, Tab-Leiste auf
	 * dem Handy — baut `+page.svelte`. Dort liegt der Aufgaben-Store, aus dem
	 * alle drei Spalten lesen; ein Aufteilen auf Layout und Seite haette ihn
	 * nur ueber einen zweiten Kanal wieder zusammenfuehren muessen.
	 *
	 * Weggefallen sind mit dieser Fassung: die Off-Canvas-Sidebar samt
	 * Burger-Knopf und Scrim, die Kopfzeile mit Sortier-, Auswahl- und
	 * Suchknopf und die doppelte Ctrl+K-Registrierung (die Seite hat eine
	 * eigene).
	 */
	let { children } = $props();

	/*
	 * Theme-Klasse gehoert ans <html>, nicht an das div darunter.
	 * `body{background:var(--bg)}` (src/app.css) loest sonst immer gegen das
	 * helle :root auf — sichtbar in den Safe-Area-Streifen oben und unten
	 * (iPhone, TWA) und beim Ueberscrollen. Den ersten Wert setzt bereits das
	 * Startskript in src/app.html; dieser Effekt fuehrt nur noch das
	 * Umschalten nach. `color-scheme` haengt mit dran, damit Scrollbalken,
	 * Textcursor und Markierung dem Theme folgen und nicht dem Betriebssystem.
	 *
	 * Die Statusleiste von Browser und TWA bekommt dieselbe Flaechenfarbe.
	 * `theme.isDark` wird bewusst zuerst gelesen: getComputedStyle ist nicht
	 * reaktiv, ohne diese Zeile liefe der Effekt beim Umschalten nicht neu.
	 */
	$effect(() => {
		const dark = theme.isDark;
		if (!browser) return;
		const wurzel = document.documentElement;
		wurzel.classList.toggle('tf-dark', dark);
		wurzel.style.colorScheme = dark ? 'dark' : 'light';

		const bg = getComputedStyle(wurzel).getPropertyValue('--bg').trim();
		const color = bg || (dark ? '#181512' : '#F3EEE4');
		let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
		if (!meta) {
			meta = document.createElement('meta');
			meta.name = 'theme-color';
			document.head.appendChild(meta);
		}
		meta.content = color;
	});
</script>

<div class="v2-root tf-root">
	{@render children()}
</div>
