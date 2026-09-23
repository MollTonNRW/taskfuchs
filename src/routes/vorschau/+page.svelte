<script lang="ts">
	import type { Component } from 'svelte';

	/**
	 * Vorschau der Richtung A „Klar" ohne Login — NUR im Dev-Modus.
	 *
	 * Diese Seite traegt selbst keine Demodaten. Sie holt den Inhalt
	 * (`$lib/demo/VorschauInhalt.svelte` samt Fixtures und Supabase-Attrappe)
	 * hinter `import.meta.env.DEV` nach. Vite ersetzt das beim Bauen durch
	 * `false`, der Zweig faellt weg und mit ihm der dynamische Import — im
	 * Produktionsbuendel gibt es keinen Chunk mit Demoinhalten mehr. Vorher
	 * hing der komplette Demobestand als oeffentlich abrufbare Datei daran.
	 *
	 * Den Riegel selbst setzen zwei Stellen: `hooks.server.ts` beantwortet
	 * `/vorschau` produktiv mit HTTP 404, `+page.ts` wirft zusaetzlich im
	 * Browser. Diese Seite verlaesst sich auf beide und bleibt sonst leer.
	 */
	let Inhalt = $state<Component | null>(null);

	if (import.meta.env.DEV) {
		import('$lib/demo/VorschauInhalt.svelte').then((m) => (Inhalt = m.default));
	}
</script>

<svelte:head>
	<title>TaskFuchs — Vorschau A „Klar“</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if Inhalt}
	<Inhalt />
{/if}
