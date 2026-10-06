<script lang="ts">
	import type { Component } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { vonPfadAus } from '$lib/push/seite';

	/**
	 * Dev-Vorschau der Seite „Benachrichtigungen". Lädt den Inhalt (Demodaten,
	 * Attrappen) nur hinter `import.meta.env.DEV` nach — Vite entfernt den
	 * Zweig beim Bauen samt Chunk, im Produktionsbündel steht nichts davon.
	 * Siehe `routes/vorschau/+page.svelte`.
	 */
	let Inhalt = $state<Component<{ vonPfad: string | null }> | null>(null);

	/**
	 * Wie in `routes/app/benachrichtigungen`: der Pfad kommt von der Route, denn der
	 * Inhalt mountet erst nach dem dynamischen Import — nach der Navigation.
	 */
	let vonPfad = $state<string | null>(null);
	afterNavigate((nav) => {
		vonPfad = vonPfadAus(nav);
	});

	if (import.meta.env.DEV) {
		import('$lib/demo/BenachrichtigungenVorschau.svelte').then((m) => (Inhalt = m.default));
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if Inhalt}
	<Inhalt {vonPfad} />
{/if}
