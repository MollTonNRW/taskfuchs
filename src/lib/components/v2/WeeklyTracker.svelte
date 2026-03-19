<script lang="ts">
	type DayData = {
		day: string;
		count: number;
		done: boolean;
	};

	let {
		weekData = [],
		totalWeek = 0,
		bestWeek = 0
	}: {
		weekData?: DayData[];
		totalWeek?: number;
		bestWeek?: number;
	} = $props();

	let progressPercent = $derived(
		bestWeek > 0 ? Math.min(100, Math.round((totalWeek / bestWeek) * 100)) : 0
	);

	let isNewRecord = $derived(totalWeek > 0 && totalWeek >= bestWeek);

	const today = new Date().toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2);

	function motivationMessage(): string {
		if (totalWeek === 0) return 'Los gehts! Erste Aufgabe erledigen.';
		if (isNewRecord) return 'Neuer Rekord! Weiter so!';
		if (progressPercent >= 80) return 'Fast am Rekord dran!';
		if (progressPercent >= 50) return 'Gute Haelfte geschafft!';
		return 'Schritt fuer Schritt.';
	}
</script>

<div class="weekly-tracker">
	<h3 class="weekly-title">Diese Woche</h3>

	<!-- Day Grid -->
	<div class="weekly-grid">
		{#each weekData as d (d.day)}
			{@const isToday = d.day.slice(0, 2) === today}
			<div
				class="weekly-day"
				class:done={d.done}
				class:today={isToday}
			>
				<span class="weekly-day-label">{d.day}</span>
				<span class="weekly-day-count">{d.count}</span>
			</div>
		{/each}
	</div>

	<!-- Progress Bar -->
	<div class="weekly-progress">
		<div class="weekly-progress-bar">
			<div class="weekly-progress-fill" style="width: {progressPercent}%"></div>
		</div>
	</div>

	<!-- Stats -->
	<div class="weekly-stats">
		<span class="weekly-stat">
			Erledigt: <strong>{totalWeek}</strong>
		</span>
		<span class="weekly-stat">
			Rekord: <strong>{bestWeek}</strong>
			{#if isNewRecord}
				<span class="weekly-record">NEU!</span>
			{/if}
		</span>
	</div>

	<!-- Motivation -->
	<div class="weekly-motivation">{motivationMessage()}</div>
</div>

<style>
	.weekly-tracker {
		font-family: var(--v2-font, monospace);
	}

	.weekly-title {
		font-size: .6rem;
		text-transform: uppercase;
		letter-spacing: 2px;
		color: var(--v2-text-muted);
		margin-bottom: 10px;
	}

	.weekly-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
		margin-bottom: 10px;
	}

	.weekly-day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 2px;
		border: 1px dashed var(--v2-border);
		border-radius: var(--v2-radius, 6px);
		transition: all .2s ease;
	}
	.weekly-day.done {
		background: var(--v2-accent-glow);
		border-color: var(--v2-accent-dim);
	}
	.weekly-day.today {
		border-color: var(--v2-accent);
		box-shadow: 0 0 6px var(--v2-accent-glow);
	}

	.weekly-day-label {
		font-size: .45rem;
		color: var(--v2-text-muted);
		text-transform: uppercase;
		letter-spacing: .5px;
	}
	.weekly-day.today .weekly-day-label { color: var(--v2-accent); }

	.weekly-day-count {
		font-size: .65rem;
		font-weight: 700;
		color: var(--v2-text-secondary);
	}
	.weekly-day.done .weekly-day-count { color: var(--v2-accent); }

	.weekly-progress {
		margin-bottom: 8px;
	}

	.weekly-progress-bar {
		height: 4px;
		background: var(--v2-border);
		border-radius: 2px;
		overflow: hidden;
	}

	.weekly-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--v2-accent), var(--v2-green));
		border-radius: 2px;
		transition: width .4s cubic-bezier(.22,1.2,.36,1);
	}

	.weekly-stats {
		display: flex;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.weekly-stat {
		font-size: .55rem;
		color: var(--v2-text-muted);
	}
	.weekly-stat strong {
		color: var(--v2-text);
	}

	.weekly-record {
		font-size: .45rem;
		font-weight: 700;
		color: var(--v2-gold, #ffd700);
		text-shadow: 0 0 4px rgba(255,215,0,.4);
		margin-left: 3px;
	}

	.weekly-motivation {
		font-size: .55rem;
		color: var(--v2-text-secondary);
		font-style: italic;
		text-align: center;
		padding-top: 4px;
		border-top: 1px dashed var(--v2-border);
	}
</style>
