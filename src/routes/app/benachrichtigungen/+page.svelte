<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import BenachrichtigungenSeite from '$lib/components/tf/BenachrichtigungenSeite.svelte';
	import { vonPfadAus } from '$lib/push/seite';

	/**
	 * Einstellungen für Benachrichtigungen. Alles Sichtbare steht in
	 * `components/tf/BenachrichtigungenSeite.svelte` — hier bleiben nur die
	 * Daten aus `+page.ts` und der echte Supabase-Zugang aus dem Wurzel-Layout.
	 */
	let { data } = $props();

	/** Woher man kam — der Zurück-Pfeil geht aus der App im Verlauf zurück statt eine Schleife zu bilden. */
	let vonPfad = $state<string | null>(null);
	afterNavigate((nav) => {
		vonPfad = vonPfadAus(nav);
	});
</script>

<BenachrichtigungenSeite
	supabase={data.supabase}
	benutzerId={data.benutzerId}
	listen={data.listen}
	stummIds={data.stummIds}
	{vonPfad}
/>
