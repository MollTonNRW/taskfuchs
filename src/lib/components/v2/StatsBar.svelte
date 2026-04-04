<script lang="ts">
	let {
		level = 1,
		xp = 0,
		xpMax = 100,
		coins = 0,
		streak = 0,
		rank = 'Neuling',
		streakMultiplier = 1.0,
		streakFreezes = 0
	}: {
		level?: number;
		xp?: number;
		xpMax?: number;
		coins?: number;
		streak?: number;
		rank?: string;
		streakMultiplier?: number;
		streakFreezes?: number;
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

<div class="stats-bar-v2">
	<!-- XP Section -->
	<div class="xp-section">
		<div class="xp-header">
			<span class="xp-label">XP</span>
			<span class="xp-values">{xp}/{xpMax}</span>
		</div>
		<div class="xp-bar" role="progressbar" aria-valuenow={xp} aria-valuemin={0} aria-valuemax={xpMax} aria-label="Erfahrungspunkte">
			<div
				class="xp-bar-fill"
				class:shimmer={almostFull}
				style="width: {xpPercent}%"
			></div>
		</div>
		<div class="level-rank-row">
			<span class="level-num">Lvl {level}</span>
			<span class="rank-name">{rank}</span>
		</div>
	</div>

	<!-- Currency Row: Coins + Streak as separate boxes -->
	<div class="currency-row">
		<div class="coin-display">
			<span class="coin-icon">&#x1FA99;</span>
			<span class="coin-count" class:pop={coinPop}>{coins}</span>
			<span class="coin-label">coins</span>
		</div>
		<div class="streak-display" data-tier={streakTier}>
			<span class="streak-fire">&#x1F525;</span>
			<div class="streak-info">
				<span class="streak-count">{streak}d</span>
				{#if streakMultiplier > 1}
					<span class="streak-mult">x{streakMultiplier.toFixed(1)}</span>
				{/if}
			</div>
			{#if streakFreezes > 0}
				<span class="streak-freeze">&#x2744;&#xFE0F; {streakFreezes}</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.stats-bar-v2 {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-family: var(--v2-font, monospace);
	}

	/* XP Section */
	.xp-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.xp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: .65rem;
	}

	.xp-label {
		color: var(--v2-purple, #bb9af7);
		font-weight: 700;
	}

	.xp-values {
		color: var(--v2-text-muted);
	}

	.xp-bar {
		height: 6px;
		background: var(--v2-border);
		border-radius: 3px;
		overflow: hidden;
	}

	.xp-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--v2-accent), var(--v2-green));
		border-radius: 3px;
		transition: width .4s cubic-bezier(.22,1.2,.36,1);
		position: relative;
	}

	.xp-bar-fill.shimmer::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent, rgba(255,255,255,.3), transparent);
		animation: v2-xp-shimmer 1.5s linear infinite;
	}

	.level-rank-row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: .68rem;
	}

	.level-num {
		color: var(--v2-purple, #bb9af7);
		font-weight: 700;
		font-size: .8rem;
		min-width: 42px;
	}

	.rank-name {
		color: var(--v2-green);
		font-size: .62rem;
	}

	/* Currency Row */
	.currency-row {
		display: flex;
		gap: 8px;
	}

	.coin-display, .streak-display {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		background: var(--v2-bg);
		border: 1px solid var(--v2-border);
		border-radius: var(--v2-radius, 6px);
		font-size: .75rem;
	}

	.coin-icon {
		font-size: 1rem;
	}

	.coin-count {
		font-weight: 700;
		color: var(--v2-coin, var(--v2-yellow));
		text-shadow: 0 0 8px rgba(224,175,104,.3);
		transition: all .3s ease;
	}

	.coin-count.pop {
		animation: coin-pop .4s var(--v2-bounce, cubic-bezier(.34,1.56,.64,1));
	}

	.coin-label {
		color: var(--v2-text-muted);
		font-size: .55rem;
		margin-left: auto;
	}

	.streak-fire {
		animation: fire-glow 1.5s ease-in-out infinite alternate;
		font-size: 1rem;
	}

	.streak-display[data-tier="blue"] .streak-fire {
		filter: hue-rotate(-30deg) brightness(1.3);
	}

	.streak-display[data-tier="golden"] .streak-fire {
		filter: hue-rotate(15deg) brightness(1.5) saturate(1.5);
	}

	.streak-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.streak-count {
		color: var(--v2-streak, var(--v2-orange));
		font-weight: 700;
		font-size: .75rem;
	}

	.streak-mult {
		color: var(--v2-yellow);
		font-size: .55rem;
		font-weight: 600;
	}

	.streak-freeze {
		color: var(--v2-cyan, #7dcfff);
		font-size: .6rem;
		margin-left: auto;
	}

	@keyframes coin-pop {
		0% { transform: scale(1); }
		40% { transform: scale(1.3); }
		100% { transform: scale(1); }
	}

	@keyframes fire-glow {
		0% { text-shadow: 0 0 4px #ff9e64; }
		100% { text-shadow: 0 0 12px #ff9e64, 0 0 20px #f7768e; }
	}
</style>
