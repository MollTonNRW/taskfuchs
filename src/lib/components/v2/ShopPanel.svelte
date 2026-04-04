<script lang="ts">
	type ShopItem = {
		id: string;
		category: 'themes' | 'sounds' | 'titles' | 'effects';
		name: string;
		desc: string;
		icon: string;
		price: number;
		owned: boolean;
	};

	let {
		items = [],
		coins = 0,
		onPurchase
	}: {
		items?: ShopItem[];
		coins?: number;
		onPurchase?: (itemId: string) => void;
	} = $props();

	type TabKey = 'themes' | 'sounds' | 'titles' | 'effects';
	const tabs: { key: TabKey; label: string; icon: string }[] = [
		{ key: 'themes', label: 'Themes', icon: '&#x1F3A8;' },
		{ key: 'sounds', label: 'Sounds', icon: '&#x1F50A;' },
		{ key: 'titles', label: 'Titel', icon: '&#x1F451;' },
		{ key: 'effects', label: 'Effekte', icon: '&#x2728;' }
	];

	let activeTab = $state<TabKey>('themes');
	let filteredItems = $derived(items.filter(i => i.category === activeTab));

	function handlePurchase(itemId: string) {
		onPurchase?.(itemId);
	}
</script>

<div class="shop-panel">
	<div class="shop-header">
		<h3 class="shop-title">Shop</h3>
		<span class="shop-coins">&#x1FA99; {coins}</span>
	</div>

	<!-- Tab Navigation -->
	<div class="shop-tabs">
		{#each tabs as tab}
			<button
				class="shop-tab"
				class:active={activeTab === tab.key}
				onclick={() => (activeTab = tab.key)}
			>
				<span>{@html tab.icon}</span>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Items -->
	<div class="shop-items">
		{#each filteredItems as item (item.id)}
			{@const affordable = coins >= item.price}
			<div
				class="shop-item v2-glass-card"
				class:owned={item.owned}
				class:affordable={!item.owned && affordable}
				class:too-expensive={!item.owned && !affordable}
			>
				<span class="shop-item-icon">{item.icon}</span>
				<div class="shop-item-info">
					<span class="shop-item-name">{item.name}</span>
					<span class="shop-item-desc">{item.desc}</span>
				</div>
				<div class="shop-item-action">
					{#if item.owned}
						<span class="shop-owned">Besitzt</span>
					{:else}
						<button
							class="shop-buy-btn"
							disabled={!affordable}
							onclick={() => handlePurchase(item.id)}
						>
							&#x1FA99; {item.price}
						</button>
					{/if}
				</div>
			</div>
		{:else}
			<p class="shop-empty">Keine Items in dieser Kategorie</p>
		{/each}
	</div>
</div>

<style>
	.shop-panel {
		font-family: var(--v2-font, monospace);
	}

	.shop-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.shop-title {
		font-size: .6rem;
		text-transform: uppercase;
		letter-spacing: 2px;
		color: var(--v2-text-muted);
	}

	.shop-coins {
		font-size: .65rem;
		font-weight: 700;
		color: var(--v2-coin, var(--v2-yellow));
	}

	.shop-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 12px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.shop-tabs::-webkit-scrollbar { display: none; }

	.shop-tab {
		padding: 5px 12px;
		border: 1px dashed var(--v2-border);
		border-radius: var(--v2-radius, 6px);
		font-size: .6rem;
		color: var(--v2-text-muted);
		background: transparent;
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 4px;
		transition: all .2s ease;
		font-family: var(--v2-font, monospace);
	}
	.shop-tab:hover {
		color: var(--v2-text-secondary);
		border-color: var(--v2-border-bright);
	}
	.shop-tab.active {
		border-color: var(--v2-accent);
		color: var(--v2-accent);
		background: var(--v2-accent-glow);
	}

	.shop-items {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.shop-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
	}
	.shop-item.owned { opacity: 0.6; }
	.shop-item.too-expensive { opacity: 0.5; }

	.shop-item-icon {
		font-size: 1.1rem;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--v2-bg);
		border-radius: var(--v2-radius, 6px);
		flex-shrink: 0;
	}

	.shop-item-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.shop-item-name {
		font-size: .68rem;
		font-weight: 600;
		color: var(--v2-text);
	}

	.shop-item-desc {
		font-size: .55rem;
		color: var(--v2-text-muted);
	}

	.shop-item-action {
		flex-shrink: 0;
	}

	.shop-owned {
		font-size: .5rem;
		color: var(--v2-green);
		text-transform: uppercase;
		letter-spacing: .5px;
		font-weight: 600;
	}

	.shop-buy-btn {
		padding: 4px 10px;
		border: 1px dashed var(--v2-coin, var(--v2-yellow));
		border-radius: var(--v2-radius, 6px);
		background: transparent;
		color: var(--v2-coin, var(--v2-yellow));
		font-size: .58rem;
		font-weight: 600;
		font-family: var(--v2-font, monospace);
		transition: all .2s ease;
	}
	.shop-buy-btn:hover:not(:disabled) {
		background: rgba(224,175,104,.15);
	}
	.shop-buy-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.shop-empty {
		font-size: .6rem;
		color: var(--v2-text-muted);
		font-style: italic;
		text-align: center;
		padding: 16px;
	}
</style>
