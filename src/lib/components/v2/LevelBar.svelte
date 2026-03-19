<script lang="ts">
	let {
		level = 1,
		xp = 0,
		xpMax = 100
	}: {
		level?: number;
		xp?: number;
		xpMax?: number;
	} = $props();

	let xpPercent = $derived(Math.min(100, Math.round((xp / xpMax) * 100)));
</script>

<div class="level-bar">
	<span class="level-badge">Lv.{level}</span>
	<div class="level-track">
		<div class="level-fill" style="width: {xpPercent}%"></div>
	</div>
	<span class="level-xp">{xp}/{xpMax}</span>
</div>

<style>
	.level-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--v2-font, monospace);
	}

	.level-badge {
		background: var(--v2-accent-glow);
		color: var(--v2-accent);
		font-weight: 700;
		font-size: .58rem;
		padding: 2px 8px;
		border-radius: var(--v2-radius, 6px);
		border: 1px dashed var(--v2-accent);
		white-space: nowrap;
	}

	.level-track {
		flex: 1;
		height: 6px;
		background: var(--v2-border);
		border-radius: 3px;
		overflow: hidden;
		min-width: 40px;
	}

	.level-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--v2-accent), var(--v2-green));
		border-radius: 3px;
		transition: width .4s cubic-bezier(.22,1.2,.36,1);
	}

	.level-xp {
		color: var(--v2-text-muted);
		font-size: .55rem;
		white-space: nowrap;
	}
</style>
