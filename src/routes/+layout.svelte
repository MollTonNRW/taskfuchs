<script lang="ts">
	import '../app.css';
	import '../tf.css';
	import { invalidate } from '$app/navigation';
	import { updated } from '$app/state';
	import { onMount } from 'svelte';
	import { aufNeueVersionAchten, neuLadenMitSperre } from '$lib/utils/aktualisierung';

	let { data, children } = $props();

	onMount(() => {
		const {
			data: { subscription }
		} = data.supabase.auth.onAuthStateChange((_event: string, _session: unknown) => {
			invalidate('supabase:auth');
		});

		// Alter Build im wiederhergestellten APK-Tab → neu laden.
		const versionAbmelden = aufNeueVersionAchten({
			pruefe: () => updated.check(),
			neuLaden: () =>
				neuLadenMitSperre({ speicher: sessionStorage, reload: () => location.reload(), jetzt: Date.now() }),
			dokument: document,
			fenster: window
		});

		return () => {
			subscription.unsubscribe();
			versionAbmelden();
		};
	});
</script>

{@render children()}
