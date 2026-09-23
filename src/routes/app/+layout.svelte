<script lang="ts">
	import TfRoot from '$lib/components/tf/TfRoot.svelte';

	/**
	 * Rahmen der App. Die Huelle selbst — Wurzelelement, Theme-Klasse,
	 * Statusleistenfarbe — steht in `components/tf/TfRoot.svelte`, damit die
	 * Vorschau-Route `/vorschau` dieselbe benutzt und nicht eine zweite,
	 * leicht abweichende bekommt.
	 *
	 * Die Oberflaeche selbst — drei Spalten auf dem Desktop, Tab-Leiste auf
	 * dem Handy — baut `components/tf/AppShell.svelte`, gemountet von
	 * `+page.svelte`. Dort liegt der Aufgaben-Store, aus dem alle drei
	 * Spalten lesen; ein Aufteilen auf Layout und Seite haette ihn nur ueber
	 * einen zweiten Kanal wieder zusammenfuehren muessen.
	 *
	 * Weggefallen sind mit dieser Fassung: die Off-Canvas-Sidebar samt
	 * Burger-Knopf und Scrim, die Kopfzeile mit Sortier-, Auswahl- und
	 * Suchknopf und die doppelte Ctrl+K-Registrierung (die Seite hat eine
	 * eigene). Mit T11 ist auch das letzte Uebergangs-Stylesheet
	 * (src/v2.css) und die Klasse `.v2-root` entfallen — es rendert kein
	 * `v2-*`-Markup mehr.
	 */
	let { children } = $props();
</script>

<TfRoot>
	{@render children()}
</TfRoot>
