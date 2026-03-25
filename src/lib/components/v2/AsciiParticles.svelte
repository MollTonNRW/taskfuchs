<script lang="ts">
	import { onMount } from 'svelte';

	const CHARS = ['*', '+', '\u00B7', '\u2022', '~', '^', '\u2219', '\u2218', '\u00B0'];
	const COLORS = [
		'var(--v2-accent)',
		'var(--v2-purple, #bb9af7)',
		'var(--v2-green, #9ece6a)',
		'var(--v2-cyan, #7dcfff)',
		'var(--v2-orange, #ff9e64)'
	];
	const COUNT = 18;

	type Particle = {
		char: string;
		left: string;
		color: string;
		duration: string;
		delay: string;
		fontSize: string;
	};

	let particles = $state<Particle[]>([]);

	onMount(() => {
		const items: Particle[] = [];
		for (let i = 0; i < COUNT; i++) {
			items.push({
				char: CHARS[Math.floor(Math.random() * CHARS.length)],
				left: (Math.random() * 100) + '%',
				color: COLORS[i % COLORS.length],
				duration: (14 + Math.random() * 16) + 's',
				delay: (-Math.random() * 20) + 's',
				fontSize: (0.5 + Math.random() * 0.5) + 'rem'
			});
		}
		particles = items;
	});
</script>

<div class="v2-ascii-particles" aria-hidden="true">
	{#each particles as p}
		<span
			class="v2-ascii-particle"
			style="left:{p.left};color:{p.color};animation-duration:{p.duration};animation-delay:{p.delay};font-size:{p.fontSize};"
		>{p.char}</span>
	{/each}
</div>
