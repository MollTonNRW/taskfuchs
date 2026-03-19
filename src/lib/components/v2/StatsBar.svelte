<script lang="ts">
	let {
		level = 1,
		xp = 0,
		xpMax = 100,
		coins = 0,
		streak = 0,
		rank = 'Neuling',
		streakMultiplier = 1.0
	}: {
		level?: number;
		xp?: number;
		xpMax?: number;
		coins?: number;
		streak?: number;
		rank?: string;
		streakMultiplier?: number;
	} = $props();

	let xpPercent = $derived(Math.min(100, Math.round((xp / xpMax) * 100)));
	let almostFull = $derived(xpPercent >= 85);
	let coinPop = $state(false);
	let prevCoins = $state(coins);

	$effect(() => {
		if (coins !== prevCoins) {
			coinPop = true;
			prevCoins = coins;
			setTimeout(() => (coinPop = false), 400);
		}
	});

	let streakTier = $derived<'normal' | 'blue' | 'golden'>(
		streak >= 30 ? 'golden' : streak >= 7 ? 'blue' : 'normal'
	);
</script>

<div class="stats-bar">
	<!-- Level + Rank -->
	<div class="stat-group">
		<span class="stat-level">{level}</span>
		<span class="stat-rank">{rank}</span>
	</div>

	<!-- XP Bar -->
	<div class="stat-xp-wrap">
		<div class="stat-xp-bar" role="progressbar" aria-valuenow={xp} aria-valuemin={0} aria-valuemax={xpMax} aria-label="Erfahrungspunkte">
			<div
				class="stat-xp-fill"
				class:shimmer={almostFull}
				style="width: {xpPercent}%"
			></div>
		</div>
		<span class="stat-xp-text">{xp}/{xpMax} XP</span>
	</div>

	<!-- Coins -->
	<div class="stat-group">
		<span class="stat-coin" class:pop={coinPop}>
			{coins}
		</span>
	</div>

	<!-- Streak -->
	{#if streak > 0}
		<div class="stat-group">
			<span class="stat-streak" data-tier={streakTier}>
				{streak}
			</span>
			{#if streakMultiplier > 1}
				<span class="stat-multiplier">x{streakMultiplier.toFixed(1)}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.stats-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		border: 1px dashed var(--v2-border);
		border-radius: var(--v2-radius, 6px);
		background: var(--v2-surface);
		font-family: var(--v2-font, monospace);
		font-size: .65rem;
	}

	.stat-group {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.stat-level {
		background: var(--v2-accent-glow);
		color: var(--v2-accent);
		font-weight: 700;
		padding: 2px 7px;
		border-radius: var(--v2-radius, 6px);
		border: 1px dashed var(--v2-accent);
		font-size: .6rem;
	}

	.stat-rank {
		color: var(--v2-text-secondary);
		font-size: .58rem;
		text-transform: uppercase;
		letter-spacing: .5px;
	}

	.stat-xp-wrap {
		flex: 1;
		min-width: 60px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.stat-xp-bar {
		flex: 1;
		height: 6px;
		background: var(--v2-border);
		border-radius: 3px;
		overflow: hidden;
	}

	.stat-xp-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--v2-accent), var(--v2-green));
		border-radius: 3px;
		transition: width .4s cubic-bezier(.22,1.2,.36,1);
		position: relative;
	}

	.stat-xp-fill.shimmer::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent, rgba(255,255,255,.3), transparent);
		animation: v2-xp-shimmer 1.5s linear infinite;
	}

	.stat-xp-text {
		color: var(--v2-text-muted);
		font-size: .55rem;
		white-space: nowrap;
	}

	.stat-coin {
		color: var(--v2-coin, var(--v2-yellow));
		font-weight: 700;
		transition: transform .2s ease;
	}
	.stat-coin::before { content: '\01FA99 '; }
	.stat-coin.pop {
		animation: coin-pop .4s var(--v2-bounce, cubic-bezier(.34,1.56,.64,1));
	}

	.stat-streak {
		font-weight: 700;
	}
	.stat-streak::before { content: '\01F525 '; }
	.stat-streak[data-tier="normal"] { color: var(--v2-streak, var(--v2-orange)); }
	.stat-streak[data-tier="blue"] {
		color: var(--v2-cyan);
		text-shadow: 0 0 6px var(--v2-cyan);
	}
	.stat-streak[data-tier="golden"] {
		color: var(--v2-gold, #ffd700);
		text-shadow: 0 0 8px rgba(255,215,0,.5);
	}

	.stat-multiplier {
		font-size: .5rem;
		color: var(--v2-green);
		font-weight: 600;
	}

	@keyframes coin-pop {
		0% { transform: scale(1); }
		40% { transform: scale(1.3); }
		100% { transform: scale(1); }
	}
</style>
