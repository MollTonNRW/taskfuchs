<script lang="ts">
	import BenachrichtigungenSeite from '$lib/components/tf/BenachrichtigungenSeite.svelte';

	/**
	 * Einstellungen für Benachrichtigungen. Alles Sichtbare steht in
	 * `components/tf/BenachrichtigungenSeite.svelte` — hier bleiben nur die
	 * Daten aus `+page.ts` und der echte Supabase-Zugang aus dem Wurzel-Layout.
	 */
	let { data } = $props();
</script>

<BenachrichtigungenSeite
	supabase={data.supabase}
	benutzerId={data.benutzerId}
	listen={data.listen}
	stummIds={data.stummIds}
/>
