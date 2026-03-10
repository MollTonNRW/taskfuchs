<script lang="ts">
	import '../app.css';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, children } = $props();

	onMount(() => {
		const {
			data: { subscription }
		} = data.supabase.auth.onAuthStateChange((_event: string, _session: unknown) => {
			invalidate('supabase:auth');
		});

		return () => subscription.unsubscribe();
	});
</script>

{@render children()}
