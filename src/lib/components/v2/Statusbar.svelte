<script lang="ts">
	let {
		level = 1,
		xp = 0,
		xpMax = 100,
		coins = 0,
		streak = 0
	}: {
		level?: number;
		xp?: number;
		xpMax?: number;
		coins?: number;
		streak?: number;
	} = $props();

	let time = $state('');

	function updateTime() {
		const now = new Date();
		time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	}

	$effect(() => {
		updateTime();
		const interval = setInterval(updateTime, 30000);
		return () => clearInterval(interval);
	});
</script>

<div class="statusbar">
	<span class="sb-item">
		<span class="sb-label">LVL</span>
		<span class="sb-value">{level}</span>
	</span>
	<span class="sb-sep sb-xp-only">|</span>
	<span class="sb-item sb-xp-only">
		<span class="sb-label">XP</span>
		<span class="sb-value">{xp}/{xpMax}</span>
	</span>
	<span class="sb-sep">|</span>
	<span class="sb-item">
		<span class="sb-label">&#x1FA99;</span>
		<span class="sb-value">{coins}</span>
	</span>
	{#if streak > 0}
		<span class="sb-sep">|</span>
		<span class="sb-item">
			<span class="sb-label">&#x1F525;</span>
			<span class="sb-value">{streak}</span>
		</span>
	{/if}
	<span class="sb-spacer"></span>
	<span class="sb-time">{time}</span>
</div>

<style>
	.statusbar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 90;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 14px;
		border-top: 1px dashed var(--v2-border);
		background: var(--v2-surface);
		font-family: var(--v2-font, monospace);
		font-size: .55rem;
	}

	.sb-item {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.sb-label {
		color: var(--v2-text-muted);
		text-transform: uppercase;
		letter-spacing: .5px;
	}

	.sb-value {
		color: var(--v2-text-secondary);
		font-weight: 600;
	}

	.sb-sep {
		color: var(--v2-border);
	}

	.sb-spacer {
		flex: 1;
	}

	.sb-time {
		color: var(--v2-text-muted);
	}

	@media (max-width: 768px) {
		.sb-xp-only { display: none; }
		.statusbar {
			padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
