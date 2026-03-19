<script lang="ts">
	import { onMount } from 'svelte';

	let {
		amount = 1,
		x = 0,
		y = 0
	}: {
		amount?: number;
		x?: number;
		y?: number;
	} = $props();

	let visible = $state(true);

	onMount(() => {
		const timer = setTimeout(() => (visible = false), 900);
		return () => clearTimeout(timer);
	});
</script>

{#if visible}
	<div
		class="coin-float"
		style="left: {x}px; top: {y}px;"
	>
		+{amount} &#x1FA99;
	</div>
{/if}

<style>
	.coin-float {
		position: fixed;
		z-index: 9999;
		font-family: var(--v2-font, monospace);
		font-size: .7rem;
		font-weight: 700;
		color: var(--v2-coin, var(--v2-yellow, #e0af68));
		pointer-events: none;
		animation: v2-coin-float .9s ease-out forwards;
		text-shadow: 0 0 6px rgba(224,175,104,.4);
		white-space: nowrap;
	}
</style>
