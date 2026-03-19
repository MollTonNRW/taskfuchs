<script lang="ts">
	type Achievement = {
		id: string;
		name: string;
		desc: string;
		icon: string;
		rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
		earned: boolean;
	};

	let {
		achievements = []
	}: {
		achievements?: Achievement[];
	} = $props();

	function rarityLabel(r: Achievement['rarity']): string {
		switch (r) {
			case 'common': return 'Common';
			case 'uncommon': return 'Uncommon';
			case 'rare': return 'Rare';
			case 'legendary': return 'Legendary';
		}
	}
</script>

<div class="achievements-panel">
	<h3 class="achievements-title">Achievements</h3>
	<div class="achievements-grid">
		{#each achievements as ach (ach.id)}
			<div
				class="achievement-card v2-glass-card"
				class:earned={ach.earned}
				class:locked={!ach.earned}
				data-rarity={ach.rarity}
			>
				<div class="achievement-icon">
					{#if ach.earned}
						{ach.icon}
					{:else}
						<span class="locked-icon">?</span>
					{/if}
				</div>
				<div class="achievement-info">
					<span class="achievement-name">
						{#if ach.earned}{ach.name}{:else}???{/if}
					</span>
					<span class="achievement-desc">
						{#if ach.earned}{ach.desc}{:else}Noch nicht freigeschaltet{/if}
					</span>
					<span class="achievement-rarity" data-rarity={ach.rarity}>
						{rarityLabel(ach.rarity)}
					</span>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.achievements-panel {
		font-family: var(--v2-font, monospace);
	}

	.achievements-title {
		font-size: .6rem;
		text-transform: uppercase;
		letter-spacing: 2px;
		color: var(--v2-text-muted);
		margin-bottom: 10px;
	}

	.achievements-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}

	.achievement-card {
		padding: 10px;
		display: flex;
		gap: 8px;
		align-items: flex-start;
		position: relative;
		overflow: hidden;
	}

	.achievement-card.locked {
		opacity: 0.45;
		filter: grayscale(0.6);
	}

	.achievement-card.earned[data-rarity="common"] {
		box-shadow: 0 0 8px rgba(158,206,106,.15);
	}
	.achievement-card.earned[data-rarity="uncommon"] {
		box-shadow: 0 0 10px var(--v2-accent-glow);
	}
	.achievement-card.earned[data-rarity="rare"] {
		box-shadow: 0 0 12px rgba(187,154,247,.2);
	}
	.achievement-card.earned[data-rarity="legendary"] {
		box-shadow: 0 0 14px rgba(255,215,0,.25);
		animation: legendary-glow 3s ease-in-out infinite;
	}

	.achievement-icon {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		flex-shrink: 0;
		background: var(--v2-bg);
		border-radius: var(--v2-radius, 6px);
	}

	.locked-icon {
		font-size: .7rem;
		color: var(--v2-text-muted);
		font-weight: 700;
	}

	.achievement-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.achievement-name {
		font-size: .65rem;
		font-weight: 700;
		color: var(--v2-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.achievement-desc {
		font-size: .55rem;
		color: var(--v2-text-secondary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.achievement-rarity {
		font-size: .45rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 1px;
		margin-top: 2px;
	}
	.achievement-rarity[data-rarity="common"] { color: var(--v2-common, var(--v2-green)); }
	.achievement-rarity[data-rarity="uncommon"] { color: var(--v2-uncommon, var(--v2-accent)); }
	.achievement-rarity[data-rarity="rare"] { color: var(--v2-rare, var(--v2-purple)); }
	.achievement-rarity[data-rarity="legendary"] { color: var(--v2-legendary, #ffd700); }

	@keyframes legendary-glow {
		0%, 100% { box-shadow: 0 0 10px rgba(255,215,0,.15); }
		50% { box-shadow: 0 0 20px rgba(255,215,0,.35); }
	}
</style>
