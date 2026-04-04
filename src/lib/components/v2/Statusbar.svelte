<script lang="ts">
	let {
		level = 1,
		xp = 0,
		xpMax = 100,
		coins = 0,
		streak = 0,
		streakMultiplier = 1.0,
		questsDone = 0,
		questsTotal = 5,
		totalTasks = 0
	}: {
		level?: number;
		xp?: number;
		xpMax?: number;
		coins?: number;
		streak?: number;
		streakMultiplier?: number;
		questsDone?: number;
		questsTotal?: number;
		totalTasks?: number;
	} = $props();
</script>

<div class="statusbar" role="status">
	<span class="sb-item">
		<span class="sb-prompt">&gt;</span>
		<span class="sb-label">lvl:</span><strong class="sb-lvl">{level}</strong>
	</span>
	<span class="sb-sep">|</span>
	<span class="sb-item sb-xp-only">
		<span class="sb-label">xp:</span><strong class="sb-xp">{xp}/{xpMax}</strong>
	</span>
	<span class="sb-sep sb-xp-only">|</span>
	<span class="sb-item">
		<span class="sb-label">coins:</span><strong class="sb-coin">{coins}</strong>
	</span>
	<span class="sb-sep">|</span>
	{#if streak > 0}
		<span class="sb-item">
			<span class="sb-label">streak:</span><strong class="sb-streak">{streak}d</strong>
			{#if streakMultiplier > 1}
				<strong class="sb-mult">x{streakMultiplier}</strong>
			{/if}
		</span>
		<span class="sb-sep">|</span>
	{/if}
	<span class="sb-item sb-quest-only">
		<span class="sb-label">quest:</span><strong class="sb-accent">{questsDone}/{questsTotal}</strong>
	</span>
	<span class="sb-sep sb-quest-only">|</span>
	<span class="sb-item">
		<span class="sb-label">tasks:</span><strong class="sb-accent">{totalTasks}</strong>
	</span>
	<span class="sb-spacer"></span>
	<span class="sb-version">taskfuchs v6.0</span>
</div>

<style>
	.statusbar {
		position: sticky;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 90;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 5px 20px;
		border-top: 1px dashed var(--v2-border);
		background: var(--v2-surface);
		font-family: var(--v2-font, monospace);
		font-size: .6rem;
		color: var(--v2-text-muted);
	}

	.sb-item {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.sb-prompt {
		color: var(--v2-accent);
		font-weight: 700;
		margin-right: 2px;
	}

	.sb-label {
		color: var(--v2-text-muted);
	}

	.sb-sep {
		color: var(--v2-border);
	}

	.sb-lvl {
		color: var(--v2-purple);
		font-weight: 600;
	}

	.sb-xp {
		color: var(--v2-purple);
		font-weight: 600;
	}

	.sb-coin {
		color: var(--v2-coin, var(--v2-yellow));
		font-weight: 600;
	}

	.sb-streak {
		color: var(--v2-streak, var(--v2-orange));
		font-weight: 600;
	}

	.sb-mult {
		color: var(--v2-yellow);
		font-weight: 600;
	}

	.sb-accent {
		color: var(--v2-accent);
		font-weight: 600;
	}

	.sb-spacer {
		flex: 1;
	}

	.sb-version {
		color: var(--v2-orange);
		margin-left: auto;
	}

	@media (min-width: 769px) {
		.statusbar {
			margin-left: var(--v2-sidebar-w);
		}
	}

	@media (max-width: 768px) {
		.sb-xp-only { display: none; }
		.sb-quest-only { display: none; }
		.statusbar {
			padding-bottom: calc(5px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
