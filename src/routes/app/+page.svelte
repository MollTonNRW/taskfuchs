<script lang="ts">
	import { goto } from '$app/navigation';
	import AppShell from '$lib/components/tf/AppShell.svelte';

	/**
	 * Die angemeldete App. Alles Sichtbare steht in
	 * `components/tf/AppShell.svelte` — hier bleibt nur, was diese Route
	 * ausmacht: die Daten aus `+page.ts`, der echte Supabase-Zugang aus dem
	 * Wurzel-Layout und das Abmelden.
	 *
	 * Die Shell steht als Komponente, weil die Vorschau-Route `/vorschau`
	 * exakt dieselbe mountet — mit Demodaten statt Datenbank. Nur so zeigen
	 * die Abnahmebilder wirklich die App und nicht deren Nachbau.
	 */
	let { data } = $props();

	async function abmelden() {
		await data.supabase.auth.signOut();
		goto('/auth/login');
	}
</script>

<AppShell
	supabase={data.supabase}
	benutzerId={data.user?.id ?? null}
	benutzerEmail={data.user?.email ?? null}
	startListen={data.lists}
	startAufgaben={data.tasks}
	startMitnutzer={data.mitnutzer}
	onLogout={abmelden}
/>
