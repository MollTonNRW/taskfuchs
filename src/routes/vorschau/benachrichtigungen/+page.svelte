<script lang="ts">
	import type { Component } from 'svelte';

	/**
	 * Dev-Vorschau der Seite „Benachrichtigungen". Lädt den Inhalt (Demodaten,
	 * Attrappen) nur hinter `import.meta.env.DEV` nach — Vite entfernt den
	 * Zweig beim Bauen samt Chunk, im Produktionsbündel steht nichts davon.
	 * Siehe `routes/vorschau/+page.svelte`.
	 */
	let Inhalt = $state<Component | null>(null);

	if (import.meta.env.DEV) {
		import('$lib/demo/BenachrichtigungenVorschau.svelte').then((m) => (Inhalt = m.default));
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if Inhalt}
	<Inhalt />
{/if}
