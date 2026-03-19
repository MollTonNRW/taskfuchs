<script lang="ts">
	import { onMount } from 'svelte';

	let {
		newLevel = 1,
		newRank = '',
		onClose
	}: {
		newLevel?: number;
		newRank?: string;
		onClose?: () => void;
	} = $props();

	let confettiPieces = $state<Array<{ id: number; left: number; delay: number; color: string; size: number }>>([]);

	onMount(() => {
		const colors = [
			'var(--v2-accent)',
			'var(--v2-green)',
			'var(--v2-yellow)',
			'var(--v2-orange)',
			'var(--v2-purple)',
			'var(--v2-cyan)',
			'var(--v2-pink, #ff007c)'
		];
		confettiPieces = Array.from({ length: 40 }, (_, i) => ({
			id: i,
			left: Math.random() * 100,
			delay: Math.random() * 0.8,
			color: colors[Math.floor(Math.random() * colors.length)],
			size: 4 + Math.random() * 6
		}));
	});
</script>

<div class="levelup-overlay" role="dialog" aria-label="Level Up">
	<!-- Confetti -->
	<div class="confetti-container">
		{#each confettiPieces as piece (piece.id)}
			<div
				class="confetti-piece"
				style="
					left: {piece.left}%;
					animation-delay: {piece.delay}s;
					background: {piece.color};
					width: {piece.size}px;
					height: {piece.size}px;
				"
			></div>
		{/each}
	</div>

	<!-- Content -->
	<div class="levelup-card">
		<div class="levelup-glow"></div>
		<div class="levelup-label">LEVEL UP!</div>
		<div class="levelup-level">{newLevel}</div>
		{#if newRank}
			<div class="levelup-rank">{newRank}</div>
		{/if}
		<button class="levelup-btn" onclick={() => onClose?.()}>
			Weiter
		</button>
	</div>
</div>

<style>
	.levelup-overlay {
		position: fixed;
		inset: 0;
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0,0,0,.7);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		animation: v2-overlay-in .3s ease;
		font-family: var(--v2-font, monospace);
	}

	.confetti-container {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.confetti-piece {
		position: absolute;
		top: -10px;
		border-radius: 2px;
		animation: confetti-fall 2.5s ease-in forwards;
	}

	.levelup-card {
		position: relative;
		text-align: center;
		padding: 32px 48px;
		background: var(--v2-surface);
		border: 1px dashed var(--v2-accent);
		border-radius: var(--v2-radius-lg, 10px);
		animation: v2-dialog-in .5s cubic-bezier(.34,1.56,.64,1);
		overflow: hidden;
	}

	.levelup-glow {
		position: absolute;
		inset: -20px;
		background: radial-gradient(circle, var(--v2-accent-glow) 0%, transparent 70%);
		animation: levelup-glow-pulse 2s ease-in-out infinite;
		pointer-events: none;
	}

	.levelup-label {
		font-size: .6rem;
		letter-spacing: 4px;
		text-transform: uppercase;
		color: var(--v2-accent);
		margin-bottom: 8px;
		position: relative;
	}

	.levelup-level {
		font-size: 3rem;
		font-weight: 900;
		color: var(--v2-text);
		line-height: 1;
		margin-bottom: 4px;
		position: relative;
		text-shadow: 0 0 20px var(--v2-accent-glow);
	}

	.levelup-rank {
		font-size: .75rem;
		color: var(--v2-accent);
		font-weight: 600;
		margin-bottom: 20px;
		position: relative;
	}

	.levelup-btn {
		padding: 8px 28px;
		border: 1px dashed var(--v2-accent);
		border-radius: var(--v2-radius, 6px);
		background: var(--v2-accent-glow);
		color: var(--v2-accent);
		font-size: .7rem;
		font-weight: 600;
		font-family: var(--v2-font, monospace);
		cursor: pointer;
		position: relative;
		transition: all .2s ease;
	}
	.levelup-btn:hover {
		background: var(--v2-accent);
		color: var(--v2-bg);
	}

	@keyframes confetti-fall {
		0% { transform: translateY(0) rotate(0deg); opacity: 1; }
		100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
	}

	@keyframes levelup-glow-pulse {
		0%, 100% { opacity: 0.3; }
		50% { opacity: 0.6; }
	}
</style>
