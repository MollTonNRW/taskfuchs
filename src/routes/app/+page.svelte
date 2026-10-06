<script lang="ts">
	import { goto } from '$app/navigation';
	import AppShell from '$lib/components/tf/AppShell.svelte';
	import { abmelden } from '$lib/push/abo';

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

	async function abmeldenUndWeiter() {
		// Löscht vorher das Push-Abo dieses Geräts (siehe `abmelden` in push/abo.ts).
		await abmelden(data.supabase);
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
	onLogout={abmeldenUndWeiter}
/>
