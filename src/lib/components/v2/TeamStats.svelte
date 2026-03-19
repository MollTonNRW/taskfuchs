<script lang="ts">
	type Player = {
		id: string;
		name: string;
		avatar: string;
		level: number;
		coins: number;
		streak: number;
	};

	let {
		players = [],
		currentUserId = ''
	}: {
		players?: Player[];
		currentUserId?: string;
	} = $props();

	function rankBadge(index: number): string {
		if (index === 0) return '\u{1F947}';
		if (index === 1) return '\u{1F948}';
		if (index === 2) return '\u{1F949}';
		return `${index + 1}.`;
	}
</script>

<div class="team-stats">
	<h3 class="team-title">Leaderboard</h3>
	<div class="team-list">
		{#each players as player, i (player.id)}
			{@const isMe = player.id === currentUserId}
			<div
				class="team-row"
				class:top3={i < 3}
				class:me={isMe}
				data-rank={i}
			>
				<span class="team-rank">{rankBadge(i)}</span>
				<span class="team-avatar">{player.avatar}</span>
				<div class="team-info">
					<span class="team-name">
						{player.name}
						{#if isMe}<span class="team-me">(Du)</span>{/if}
					</span>
					<span class="team-meta">Lv.{player.level}</span>
				</div>
				<div class="team-values">
					<span class="team-coins">&#x1FA99; {player.coins}</span>
					{#if player.streak > 0}
						<span class="team-streak">&#x1F525; {player.streak}</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.team-stats {
		font-family: var(--v2-font, monospace);
	}

	.team-title {
		font-size: .6rem;
		text-transform: uppercase;
		letter-spacing: 2px;
		color: var(--v2-text-muted);
		margin-bottom: 10px;
	}

	.team-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.team-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border: 1px dashed var(--v2-border);
		border-radius: var(--v2-radius, 6px);
		transition: all .2s ease;
	}
	.team-row.me {
		background: var(--v2-accent-glow);
		border-color: var(--v2-accent-dim);
	}
	.team-row[data-rank="0"] { border-color: var(--v2-gold, #ffd700); }
	.team-row[data-rank="1"] { border-color: var(--v2-text-muted); }
	.team-row[data-rank="2"] { border-color: var(--v2-orange); }

	.team-rank {
		width: 24px;
		text-align: center;
		font-size: .7rem;
		flex-shrink: 0;
	}

	.team-avatar {
		font-size: .9rem;
		flex-shrink: 0;
	}

	.team-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.team-name {
		font-size: .65rem;
		font-weight: 600;
		color: var(--v2-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.team-me {
		font-size: .5rem;
		color: var(--v2-accent);
		font-weight: 400;
		margin-left: 3px;
	}

	.team-meta {
		font-size: .5rem;
		color: var(--v2-text-muted);
	}

	.team-values {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		flex-shrink: 0;
	}

	.team-coins {
		font-size: .55rem;
		color: var(--v2-coin, var(--v2-yellow));
		font-weight: 600;
	}

	.team-streak {
		font-size: .5rem;
		color: var(--v2-streak, var(--v2-orange));
	}
</style>
