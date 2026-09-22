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

	// Status-Leiste von Browser und TWA auf die aktive Flaechenfarbe ziehen.
	// isDark wird bewusst zuerst gelesen: getComputedStyle ist nicht reaktiv,
	// ohne diese Zeile wuerde der Effekt beim Umschalten nicht neu laufen.
	$effect(() => {
		const dark = theme.isDark;
		if (!browser) return;
		const root = document.querySelector('.tf-root');
		const bg = root ? getComputedStyle(root).getPropertyValue('--bg').trim() : '';
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

<div class="v2-root tf-root" class:tf-dark={theme.isDark}>
	{@render children()}
</div>
