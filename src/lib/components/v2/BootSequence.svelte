<script lang="ts">
	import { onMount } from 'svelte';

	let {
		onComplete
	}: {
		onComplete?: () => void;
	} = $props();

	const BOOT_LINES = [
		{ text: '[INIT] TaskFuchs Kernel v2.0.0', delay: 0 },
		{ text: '[OK] Mounting Supabase connection...', delay: 200 },
		{ text: '[OK] Loading user profile...', delay: 400 },
		{ text: '[OK] Syncing task database...', delay: 650 },
		{ text: '[OK] Initializing gamification engine...', delay: 900 },
		{ text: '[OK] Rendering UI components...', delay: 1100 },
		{ text: '', delay: 1300 },
		{ text: '    /\\___/\\', delay: 1350 },
		{ text: '   ( o   o )', delay: 1400 },
		{ text: '   (  =^=  )', delay: 1450 },
		{ text: '    )     (', delay: 1500 },
		{ text: '   (       )', delay: 1550 },
		{ text: '  ( |     | )', delay: 1600 },
		{ text: ' (__|_____|__)', delay: 1650 },
		{ text: '', delay: 1700 },
		{ text: '[READY] System operational. Viel Erfolg!', delay: 1800 }
	];

	let visibleLines = $state(0);
	let fading = $state(false);

	onMount(() => {
		const timers: ReturnType<typeof setTimeout>[] = [];

		for (let i = 0; i < BOOT_LINES.length; i++) {
			timers.push(
				setTimeout(() => {
					visibleLines = i + 1;
				}, BOOT_LINES[i].delay)
			);
		}

		// Fade out after all lines shown
		timers.push(
			setTimeout(() => {
				fading = true;
			}, 2200)
		);

		timers.push(
			setTimeout(() => {
				onComplete?.();
			}, 2800)
		);

		return () => timers.forEach(clearTimeout);
	});
</script>

<div class="boot-sequence" class:fading>
	<div class="boot-terminal">
		{#each BOOT_LINES.slice(0, visibleLines) as line, i}
			<div class="boot-line" class:ok={line.text.startsWith('[OK]')} class:ready={line.text.startsWith('[READY]')} class:init={line.text.startsWith('[INIT]')}>
				{#if line.text.startsWith('[OK]')}
					<span class="boot-tag ok">[OK]</span>{line.text.slice(4)}
				{:else if line.text.startsWith('[INIT]')}
					<span class="boot-tag init">[INIT]</span>{line.text.slice(6)}
				{:else if line.text.startsWith('[READY]')}
					<span class="boot-tag ready">[READY]</span>{line.text.slice(7)}
				{:else}
					{line.text}
				{/if}
			</div>
		{/each}
		<span class="boot-cursor">_</span>
	</div>
</div>

<style>
	.boot-sequence {
		position: fixed;
		inset: 0;
		z-index: 99999;
		background: var(--v2-bg, #1a1b26);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity .6s ease;
	}
	.boot-sequence.fading {
		opacity: 0;
		pointer-events: none;
	}

	.boot-terminal {
		max-width: 500px;
		width: 90%;
		font-family: var(--v2-font, monospace);
		font-size: .65rem;
		line-height: 1.6;
		color: var(--v2-text-secondary, #a9b1d6);
	}

	.boot-line {
		white-space: pre;
		animation: boot-line-in .15s ease;
	}

	.boot-tag {
		font-weight: 700;
	}
	.boot-tag.ok { color: var(--v2-green, #9ece6a); }
	.boot-tag.init { color: var(--v2-accent, #7aa2f7); }
	.boot-tag.ready { color: var(--v2-orange, #ff9e64); }

	.boot-cursor {
		display: inline-block;
		color: var(--v2-accent, #7aa2f7);
		animation: boot-blink 0.8s step-end infinite;
	}

	@keyframes boot-line-in {
		0% { opacity: 0; }
		100% { opacity: 1; }
	}

	@keyframes boot-blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}
</style>
