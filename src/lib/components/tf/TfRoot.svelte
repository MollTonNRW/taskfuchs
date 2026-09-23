<script lang="ts">
	import { browser } from '$app/environment';
	import { theme } from '$lib/stores/tf/theme.svelte';

	/**
	 * Wurzelelement der Oberflaeche: Theme-Klasse, Farbschema, Statusleiste.
	 *
	 * Steht als eigene Komponente, weil zwei Einstiege dieselbe Huelle
	 * brauchen — `/app` (ueber sein Layout) und die Vorschau-Route
	 * `/vorschau`. Eine zweite, leicht abweichende Kopie waere genau die Art
	 * Unterschied, die auf Abnahme-Bildern niemandem auffaellt und spaeter
	 * lange gesucht wird.
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

<div class="tf-root">
	{@render children()}
</div>
