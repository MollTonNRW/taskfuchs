<script lang="ts">
	let {
		type = 'daily',
		title = '',
		progress = 0,
		target = 1,
		rewardXp = 0,
		rewardCoins = 0,
		completed = false
	}: {
		type?: 'daily' | 'bonus';
		title?: string;
		progress?: number;
		target?: number;
		rewardXp?: number;
		rewardCoins?: number;
		completed?: boolean;
	} = $props();

	let progressPercent = $derived(Math.min(100, Math.round((progress / target) * 100)));

	// SVG circle math
	const RADIUS = 18;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	let strokeOffset = $derived(CIRCUMFERENCE - (progressPercent / 100) * CIRCUMFERENCE);
</script>

<div class="quest-card v2-glass-card" class:completed data-type={type}>
	<!-- Progress Ring -->
	<div class="quest-ring">
		<svg width="48" height="48" viewBox="0 0 48 48">
			<circle
				cx="24" cy="24" r={RADIUS}
				fill="none"
				stroke="var(--v2-border)"
				stroke-width="3"
			/>
			<circle
				cx="24" cy="24" r={RADIUS}
				fill="none"
				stroke={completed ? 'var(--v2-green)' : type === 'bonus' ? 'var(--v2-purple)' : 'var(--v2-accent)'}
				stroke-width="3"
				stroke-linecap="round"
				stroke-dasharray={CIRCUMFERENCE}
				stroke-dashoffset={strokeOffset}
				transform="rotate(-90 24 24)"
				style="transition: stroke-dashoffset .5s cubic-bezier(.22,1.2,.36,1);"
			/>
		</svg>
		<span class="quest-ring-text">
			{#if completed}
				&#10003;
			{:else}
				{progress}/{target}
			{/if}
		</span>
	</div>

	<!-- Quest Info -->
	<div class="quest-info">
		<span class="quest-type">{type === 'daily' ? 'DAILY' : 'BONUS'}</span>
		<span class="quest-title">{title}</span>
		<div class="quest-rewards">
			{#if rewardXp > 0}
				<span class="quest-reward xp">+{rewardXp} XP</span>
			{/if}
			{#if rewardCoins > 0}
				<span class="quest-reward coin">+{rewardCoins} &#x1FA99;</span>
			{/if}
		</div>
	</div>

	{#if completed}
		<div class="quest-flash"></div>
	{/if}
</div>

<style>
	.quest-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		position: relative;
		overflow: hidden;
		font-family: var(--v2-font, monospace);
	}
	.quest-card.completed {
		opacity: 0.7;
	}
	.quest-card[data-type="bonus"] {
		border-color: var(--v2-purple);
	}

	.quest-ring {
		position: relative;
		width: 48px;
		height: 48px;
		flex-shrink: 0;
	}
	.quest-ring svg { display: block; }
	.quest-ring-text {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: .55rem;
		font-weight: 700;
		color: var(--v2-text);
	}
	.completed .quest-ring-text {
		color: var(--v2-green);
		font-size: .8rem;
	}

	.quest-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.quest-type {
		font-size: .45rem;
		text-transform: uppercase;
		letter-spacing: 2px;
		color: var(--v2-text-muted);
		font-weight: 600;
	}

	.quest-title {
		font-size: .7rem;
		color: var(--v2-text);
		font-weight: 500;
	}

	.quest-rewards {
		display: flex;
		gap: 8px;
		margin-top: 2px;
	}

	.quest-reward {
		font-size: .5rem;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 4px;
	}
	.quest-reward.xp {
		background: var(--v2-accent-glow);
		color: var(--v2-accent);
	}
	.quest-reward.coin {
		background: rgba(224,175,104,.15);
		color: var(--v2-coin, var(--v2-yellow));
	}

	.quest-flash {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent, rgba(158,206,106,.2), transparent);
		animation: quest-flash .6s ease-out forwards;
		pointer-events: none;
	}

	@keyframes quest-flash {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(100%); }
	}
</style>
