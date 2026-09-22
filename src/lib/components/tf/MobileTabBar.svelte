<script lang="ts">
	import Icon from './Icon.svelte';
	import type { MobileTab } from '$lib/stores/tf/navigation.svelte';

	/**
	 * Tab-Leiste (Mobile) — A-klar-spec.md Abschnitt 4.
	 * Drei gleich breite Tabs, je 52 px Inhalt, Icon 24 px ueber Label 12/500.
	 * Aktiver Tab traegt `--accent-ink`, keine Flaeche, kein Indikator.
	 *
	 * Die Safe-Area unten liegt als `--tf-safe-bottom` auf `.tf-app`
	 * (siehe src/tf.css — der Body zieht sie heute bereits ab).
	 */
	let {
		tab,
		onTab
	}: {
		tab: MobileTab;
		onTab: (t: MobileTab) => void;
	} = $props();

	const tabs: { id: MobileTab; label: string; icon: 'listen' | 'pin' | 'suche' }[] = [
		{ id: 'listen', label: 'Listen', icon: 'listen' },
		{ id: 'pins', label: 'Angepinnt', icon: 'pin' },
		{ id: 'suche', label: 'Suche', icon: 'suche' }
	];
</script>

<nav class="tf-bottombar" aria-label="Hauptbereiche">
	{#each tabs as t (t.id)}
		<button
			class="tf-tab"
			class:on={tab === t.id}
			aria-current={tab === t.id ? 'page' : undefined}
			onclick={() => onTab(t.id)}
		>
			<Icon name={t.icon} size={24} />
			{t.label}
		</button>
	{/each}
</nav>
