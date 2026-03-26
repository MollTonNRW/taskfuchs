<script lang="ts">
	import '../../v2.css';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { v2Theme, v2ThemePresets, type V2ThemePreset, type GamificationMode } from '$lib/stores/v2/theme.svelte';
	import { v2Events } from '$lib/stores/v2/events.svelte';
	import { createGamificationStore } from '$lib/stores/v2/gamification.svelte';
	import { createAchievementStore, ACHIEVEMENTS } from '$lib/stores/v2/achievements.svelte';
	import { listsStore } from '$lib/stores/lists';
	import { hiddenListIds, toggleListVisibility } from '$lib/stores/visibility';
	import {
		priorityFilters,
		viewFilters,
		togglePriorityFilter,
		toggleViewFilter,
		hasActiveFilter,
		resetFilters,
		subtasksCollapsedByDefault,
		toggleSubtasksDefault
	} from '$lib/stores/filters';
	import { onMount } from 'svelte';

	import FoxMascot from '$lib/components/v2/FoxMascot.svelte';
	import StatsBar from '$lib/components/v2/StatsBar.svelte';
	import Statusbar from '$lib/components/v2/Statusbar.svelte';
	import BootSequence from '$lib/components/v2/BootSequence.svelte';
	import WeeklyTracker from '$lib/components/v2/WeeklyTracker.svelte';
	import QuestCard from '$lib/components/v2/QuestCard.svelte';
	import AchievementsPanel from '$lib/components/v2/AchievementsPanel.svelte';
	import ShopPanel from '$lib/components/v2/ShopPanel.svelte';
	import AsciiParticles from '$lib/components/v2/AsciiParticles.svelte';
	import TeamStats from '$lib/components/v2/TeamStats.svelte';

	let { data, children } = $props();
	let sidebarOpen = $state(false);
	let filterOpen = $state(false);
	let prioFilterOpen = $state(false);
	let viewFilterOpen = $state(false);

	// Collapsible sidebar sections
	let statsOpen = $state(true);
	let weeklyOpen = $state(false);
	let questsOpen = $state(false);
	let achievementsOpen = $state(false);
	let shopOpen = $state(false);
	let teamOpen = $state(false);
	let listenOpen = $state(true);

	// Boot sequence
	let showBoot = $state(false);
	let bootDone = $state(true);

	// Fox state
	let foxMood = $state<'idle' | 'celebrating' | 'sleeping' | 'happy' | 'encouraging'>('idle');
	let foxMessage = $state('');

	// Contextual fox messages (matching PoC v6)
	const FOX_MESSAGES: Record<string, string[]> = {
		morning: ['> guten morgen. was steht an?', '> kaffee geladen. tasks warten.', '> fruehschicht. let\'s go.'],
		midday: ['> mittagspause? oder noch ein task?', '> halbzeit. laeuft bei dir.'],
		evening: ['> feierabend bald? noch ein paar tasks?', '> abend-session. solide.'],
		night: ['> nachtschicht? respekt.', '> die besten commits passieren nachts.'],
		empty: ['> keine tasks. saubere sache.', '> leere liste. alles erledigt.'],
		idle: ['> fox.status = idle...', '> ...warte auf input.']
	};

	function getContextFoxMessage(): string {
		const h = new Date().getHours();
		let pool: string[];
		if (h >= 5 && h < 12) pool = FOX_MESSAGES.morning;
		else if (h >= 12 && h < 17) pool = FOX_MESSAGES.midday;
		else if (h >= 17 && h < 23) pool = FOX_MESSAGES.evening;
		else pool = FOX_MESSAGES.night;
		return pool[Math.floor(Math.random() * pool.length)];
	}

	let contextFoxMessage = $state('> bereit.');

	// Gamification stores
	const gStore = createGamificationStore();
	const aStore = createAchievementStore();

	// Init gamification on mount
	onMount(() => {
		// Boot sequence (once per browser session)
		if (browser && !localStorage.getItem('v2-booted')) {
			showBoot = true;
			bootDone = false;
		}

		if (data.supabase && data.user) {
			gStore.init(data.supabase, data.user.id);
			aStore.init(data.supabase, data.user.id);
		}

		// Set contextual fox message
		contextFoxMessage = getContextFoxMessage();
	});

	function handleBootComplete() {
		bootDone = true;
		showBoot = false;
		if (browser) localStorage.setItem('v2-booted', '1');
	}

	// Apply DaisyUI data-theme for utility classes
	$effect(() => {
		if (browser) {
			document.documentElement.setAttribute(
				'data-theme',
				v2Theme.effectiveDark ? 'dark' : 'light'
			);
		}
	});

	// Listen for task events from the page and drive gamification
	let lastProcessedCounter = 0;
	$effect(() => {
		const counter = v2Events.eventCounter;
		const ev = v2Events.lastEvent;
		if (!ev || counter === lastProcessedCounter) return;
		lastProcessedCounter = counter;

		if (ev.type === 'task_done' || ev.type === 'subtask_done') {
			gStore.onTaskDone({ id: ev.taskId, parent_id: ev.parentId }).then(async (result) => {
				if (!result) return;

				// Check achievements
				const stats = {
					totalTasksDone: gStore.totalTasksDone,
					streakDays: gStore.streakDays,
					listCount: $listsStore.length,
					subtasksDone: ev.parentId ? gStore.totalTasksDone : 0,
					currentHour: new Date().getHours(),
					speedCount: result.speedCount,
					hasSharedList: false,
					allDoneInList: false
				};
				await aStore.checkAchievements(stats);

				// Fox reaction
				if (result.leveledUp) {
					foxMood = 'celebrating';
					foxMessage = 'LEVEL UP!';
				} else if (result.xpGained > 0) {
					foxMood = 'happy';
					foxMessage = `+${result.xpGained} XP`;
				}
				setTimeout(() => { foxMood = 'idle'; foxMessage = ''; }, 3000);
			});
		} else if (ev.type === 'task_undone') {
			gStore.onTaskUndone({ id: ev.taskId });
		}
	});

	// Weekly tracker data
	const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
	let weekData = $derived(
		DAY_LABELS.map((label, i) => {
			const entry = gStore.weeklyTasks.find(w => w.day === i);
			return {
				day: label,
				count: entry?.count ?? 0,
				done: (entry?.count ?? 0) > 0
			};
		})
	);
	let totalWeek = $derived(gStore.weeklyTasks.reduce((sum, w) => sum + w.count, 0));

	// Achievements data for panel
	let achievementsList = $derived(
		ACHIEVEMENTS.map(a => ({
			id: a.id,
			name: a.name,
			desc: a.description,
			icon: a.icon,
			rarity: a.rarity,
			earned: aStore.unlockedIds.has(a.id)
		}))
	);

	// Gamification mode labels
	const gamificationModes: { key: GamificationMode; label: string }[] = [
		{ key: 'full', label: 'Full' },
		{ key: 'minimal', label: 'Minimal' },
		{ key: 'off', label: 'Aus' }
	];

	async function logout() {
		await data.supabase.auth.signOut();
		goto('/auth/login');
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	// Keyboard shortcut for search
	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			window.dispatchEvent(new CustomEvent('v2:toggle-search'));
		}
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<!-- Boot Sequence -->
{#if showBoot && !bootDone}
	<BootSequence onComplete={handleBootComplete} />
{/if}

<div class="v2-root {v2Theme.themeClass}" data-gamification={v2Theme.gamificationMode}>
	{#if v2Theme.gamificationMode !== 'off'}
		<AsciiParticles />
	{/if}

	<!-- Sidebar Overlay (mobile) -->
	{#if sidebarOpen}
		<div
			class="v2-sidebar-overlay active"
			onclick={closeSidebar}
			role="presentation"
		></div>
	{/if}

	<!-- Sidebar -->
	<aside class="v2-sidebar {sidebarOpen ? 'open' : ''}" class:collapsed={!sidebarOpen && typeof window !== 'undefined' && window.innerWidth >= 769}>
		<!-- Sidebar Header (v6 style) -->
		<div class="v2-sidebar-topbar">
			<span class="v2-sidebar-title">TaskFuchs</span>
			<button class="v2-sidebar-close" onclick={closeSidebar} aria-label="Sidebar schliessen">&times;</button>
		</div>

		<!-- Fox + User Area (v6 greeting style) -->
		<div class="v2-sidebar-section v2-sidebar-fox-area">
			<div aria-hidden="true">
				<FoxMascot mood={foxMood} message={foxMessage} />
			</div>
			<div class="v2-fox-greeting">
				<div class="v2-fox-name">{data.user?.email?.split('@')[0] ?? 'User'}</div>
				<div class="v2-fox-rank">~$ [Lvl {gStore.level}: {gStore.currentRank}]</div>
				<div class="v2-fox-sub">{v2Events.openTaskCount > 0 ? `${v2Events.openTaskCount} offene Tasks` : 'Alles erledigt!'}</div>
				<div class="v2-fox-msg">{contextFoxMessage}</div>
			</div>
		</div>

		<!-- Stats (collapsible, v6 style) -->
		{#if v2Theme.gamificationMode !== 'off'}
			<div class="v2-sidebar-section v2-sidebar-stats">
				<button class="v2-section-header" onclick={() => (statsOpen = !statsOpen)} aria-label="Stats ein-/ausklappen">
					<h3>&#x250C;&#x2500; Stats</h3>
					<span class="v2-section-toggle" class:collapsed={!statsOpen}>&#9660;</span>
				</button>
				<div class="v2-section-body" class:collapsed={!statsOpen}>
					<StatsBar
						level={gStore.level}
						xp={gStore.xp}
						xpMax={gStore.xpForNextLevel}
						coins={gStore.coins}
						streak={gStore.streakDays}
						rank={gStore.currentRank}
						streakMultiplier={gStore.currentStreakMultiplier}
						streakFreezes={2}
					/>
				</div>
			</div>
		{/if}

		<!-- Filter (collapsible, v6 order: after Stats) -->
		<div class="v2-sidebar-section">
			<button class="v2-section-header" onclick={() => (filterOpen = !filterOpen)} aria-label="Filter ein-/ausklappen">
				<h3>
					&#x250C;&#x2500; Filter
					{#if $hasActiveFilter}
						<span class="v2-active-badge">aktiv</span>
					{/if}
				</h3>
				<span class="v2-section-toggle" class:collapsed={!filterOpen}>&#9660;</span>
			</button>

			<div class="v2-filter-section" class:collapsed={!filterOpen}>
				<!-- Priority Filter -->
				<button
					class="v2-filter-group-btn"
					onclick={() => (prioFilterOpen = !prioFilterOpen)}
					aria-label="Prioritaet-Filter ein-/ausklappen"
				>
					<span class="v2-section-toggle" class:collapsed={!prioFilterOpen}>&#9660;</span>
					Prioritaet
				</button>
				<div class="v2-filter-options" class:collapsed={!prioFilterOpen}>
					{#each [
						{ key: 'low', label: 'Niedrig', color: 'var(--v2-green)' },
						{ key: 'normal', label: 'Normal', color: 'var(--v2-yellow)' },
						{ key: 'high', label: 'Hoch', color: 'var(--v2-red)' },
						{ key: 'asap', label: 'ASAP!', color: 'var(--v2-red)' }
					] as filter}
						<label class="v2-filter-check">
							<input
								type="checkbox"
								checked={$priorityFilters[filter.key as keyof typeof $priorityFilters]}
								onchange={() => togglePriorityFilter(filter.key as any)}
							/>
							<span class="v2-filter-dot" style="background: {filter.color};"></span>
							{filter.label}
						</label>
					{/each}
				</div>

				<!-- View Filter -->
				<button
					class="v2-filter-group-btn"
					onclick={() => (viewFilterOpen = !viewFilterOpen)}
					aria-label="Ansicht-Filter ein-/ausklappen"
				>
					<span class="v2-section-toggle" class:collapsed={!viewFilterOpen}>&#9660;</span>
					Ansicht
				</button>
				<div class="v2-filter-options" class:collapsed={!viewFilterOpen}>
					<label class="v2-filter-check">
						<input type="checkbox" checked={$viewFilters.highlighted} onchange={() => toggleViewFilter('highlighted')} />
						Nur Fixierte
					</label>
					<label class="v2-filter-check">
						<input type="checkbox" checked={$viewFilters.withDate} onchange={() => toggleViewFilter('withDate')} />
						Mit Termin
					</label>
					<label class="v2-filter-check">
						<input type="checkbox" checked={$viewFilters.shared} onchange={() => toggleViewFilter('shared')} />
						Geteilte Listen
					</label>
				</div>

				<!-- Subtask default visibility -->
				<div class="v2-subtask-default-label">Unteraufgaben bei Start</div>
				<div class="v2-subtask-default-row">
					<button
						class="v2-subtask-default-btn"
						class:active={!$subtasksCollapsedByDefault}
						onclick={() => { if ($subtasksCollapsedByDefault) toggleSubtasksDefault(); }}
					>
						&#x25BC; Ausgeklappt
					</button>
					<button
						class="v2-subtask-default-btn"
						class:active={$subtasksCollapsedByDefault}
						onclick={() => { if (!$subtasksCollapsedByDefault) toggleSubtasksDefault(); }}
					>
						&#x25B6; Eingeklappt
					</button>
				</div>

				{#if $hasActiveFilter}
					<button
						class="v2-filter-reset"
						onclick={resetFilters}
						aria-label="Filter zuruecksetzen"
					>
						Filter zuruecksetzen
					</button>
				{/if}
			</div>
		</div>

		<!-- Weekly Tracker (collapsible) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (weeklyOpen = !weeklyOpen)} aria-label="Wochentracker ein-/ausklappen">
					<h3>&#x250C;&#x2500; Wochenfortschritt {#if gStore.bestStreak > 0}<span class="v2-best-week">&#x1F3C6; Rekord: {gStore.bestStreak}</span>{/if}</h3>
					<span class="v2-section-toggle" class:collapsed={!weeklyOpen}>&#9660;</span>
				</button>
				<div class="v2-section-body" class:collapsed={!weeklyOpen}>
					<WeeklyTracker {weekData} {totalWeek} bestWeek={gStore.bestStreak > 0 ? totalWeek : 0} />
				</div>
			</div>
		{/if}

		<!-- Daily Quests (collapsible) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (questsOpen = !questsOpen)} aria-label="Quests ein-/ausklappen">
					<h3>
						&#x250C;&#x2500; Quests
						{#if gStore.dailyQuests.filter(q => !q.completed).length > 0}
							<span class="v2-active-badge">
								{gStore.dailyQuests.filter(q => !q.completed).length}
							</span>
						{/if}
					</h3>
					<span class="v2-section-toggle" class:collapsed={!questsOpen}>&#9660;</span>
				</button>
				<div class="v2-section-body-flex" class:collapsed={!questsOpen}>
					{#each gStore.dailyQuests.slice(0, 3) as quest (quest.id)}
						<QuestCard
							type="daily"
							title={quest.quest_type.replace(/_/g, ' ')}
							progress={quest.progress}
							target={quest.target}
							rewardXp={quest.reward_xp}
							rewardCoins={quest.reward_coins}
							completed={quest.completed}
						/>
					{:else}
						<p class="v2-quest-empty">
							Keine Quests heute
						</p>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Achievements (collapsible) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (achievementsOpen = !achievementsOpen)} aria-label="Achievements ein-/ausklappen">
					<h3>
						&#x250C;&#x2500; Achievements
						<span class="v2-achievement-count">
							{aStore.unlockedCount}/{aStore.totalCount}
						</span>
					</h3>
					<span class="v2-section-toggle" class:collapsed={!achievementsOpen}>&#9660;</span>
				</button>
				<div class="v2-section-body" class:collapsed={!achievementsOpen}>
					<AchievementsPanel achievements={achievementsList} />
				</div>
			</div>
		{/if}

		<!-- Lists Navigation (collapsible, v6 style) -->
		<div class="v2-sidebar-section v2-nav-section">
			<button class="v2-section-header" onclick={() => (listenOpen = !listenOpen)} aria-label="Listen ein-/ausklappen">
				<h3>&#x250C;&#x2500; Listen</h3>
				<span class="v2-section-toggle" class:collapsed={!listenOpen}>&#9660;</span>
			</button>
			<div class="v2-section-body" class:collapsed={!listenOpen}>
				{#if $listsStore.length > 0}
					<div class="v2-nav-list">
						{#each $listsStore as list, i (list.id)}
							<button
								class="v2-nav-item"
								class:active={i === 0}
								onclick={() => toggleListVisibility(list.id)}
								aria-label="{list.title} {$hiddenListIds.has(list.id) ? 'einblenden' : 'ausblenden'}"
							>
								<span class="v2-nav-item-icon">{list.icon}</span>
								<span class="v2-nav-item-title">{list.title}</span>
								<span class="v2-nav-item-count">{v2Events.navCounts[list.id]?.done ?? 0}/{v2Events.navCounts[list.id]?.total ?? 0}</span>
							</button>
						{/each}
					</div>
				{:else}
					<p class="v2-nav-empty">Noch keine Listen</p>
				{/if}
				<button class="v2-nav-add-list" onclick={() => window.dispatchEvent(new CustomEvent('v2:add-list'))} aria-label="Neue Liste">+ Neue Liste</button>

				<!-- Ansichten sub-section (v6 style) -->
				<h3 class="v2-nav-sub-header">&#x250C;&#x2500; Ansichten</h3>
				<div class="v2-nav-item v2-nav-view-item" role="button" tabindex="0">
					<span class="v2-nav-item-icon">&#x2593;</span>
					<span class="v2-nav-item-title">Kanban Board</span>
				</div>
			</div>
		</div>

		<!-- Team Stats (collapsible, default collapsed) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (teamOpen = !teamOpen)} aria-label="Team Stats ein-/ausklappen">
					<h3>&#x250C;&#x2500; Team Stats</h3>
					<span class="v2-section-toggle" class:collapsed={!teamOpen}>&#9660;</span>
				</button>
				<div class="v2-section-body" class:collapsed={!teamOpen}>
					<TeamStats
						players={[{
							id: data.user?.id ?? '',
							name: data.user?.email?.split('@')[0] ?? 'User',
							avatar: '\u{1F98A}',
							level: gStore.level,
							coins: gStore.coins,
							streak: gStore.streakDays
						}]}
						currentUserId={data.user?.id ?? ''}
					/>
				</div>
			</div>
		{/if}

		<!-- Shop (collapsible, default collapsed) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (shopOpen = !shopOpen)} aria-label="Shop ein-/ausklappen">
					<h3>&#x250C;&#x2500; Shop</h3>
					<span class="v2-section-toggle" class:collapsed={!shopOpen}>&#9660;</span>
				</button>
				<div class="v2-section-body" class:collapsed={!shopOpen}>
					<ShopPanel items={[]} coins={gStore.coins} />
				</div>
			</div>
		{/if}

		<!-- Footer (v6 style: Gamification toggle + Theme + Presets) -->
		<div class="v2-sidebar-section v2-sidebar-footer">
			<!-- Gamification Toggle (v6 style: toggle switch) -->
			<button
				class="v2-gamification-toggle"
				onclick={() => v2Theme.setGamificationMode(v2Theme.gamificationMode === 'off' ? 'full' : 'off')}
				aria-label="Gamification umschalten"
			>
				<span>&#x1F3AE;</span>
				<span>Gamification</span>
				<div class="v2-toggle-switch" class:on={v2Theme.gamificationMode !== 'off'}></div>
			</button>

			<!-- Dark/Light Toggle -->
			<button
				class="v2-dark-toggle"
				onclick={() => v2Theme.toggleDark()}
				disabled={v2Theme.preset === 'neon' || v2Theme.preset === 'aurora'}
				aria-label={v2Theme.effectiveDark ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'}
			>
				{v2Theme.effectiveDark ? '\u263E' : '\u2600'}
				{v2Theme.effectiveDark ? 'Light Mode' : 'Dark Mode'}
			</button>

			<!-- Theme Preset Row (v6 style: single row) -->
			<div class="v2-preset-row">
				{#each v2ThemePresets as t}
					<button
						class="v2-preset-btn"
						class:active={v2Theme.preset === t.id}
						onclick={() => v2Theme.setPreset(t.id)}
						aria-label="Theme: {t.name}"
					>
						<span class="v2-preset-icon">{t.icon}</span> {t.name}
					</button>
				{/each}
			</div>
		</div>
	</aside>

	<div class="v2-app">
		<!-- Main area -->
		<div class="v2-main" class:sidebar-collapsed={sidebarOpen === false && typeof window !== 'undefined' && window.innerWidth < 769}>
			<!-- Header -->
			<header class="v2-header">
				<button
					onclick={() => (sidebarOpen = !sidebarOpen)}
					style="background: none; border: none; color: var(--v2-text-secondary); font-size: 1.1rem; padding: 4px; cursor: pointer; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;"
					aria-label="Sidebar umschalten"
				>
					&#9776;
				</button>

				<!-- ASCII-Art Logo (v6 style) -->
				<div class="v2-header-logo">
					<pre style="font-size: .55rem; color: var(--v2-text-muted); white-space: pre; line-height: 1.05;">&#x2554;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2557;
&#x2551; <span style="color: var(--v2-orange);">TaskFuchs</span> &#x2551;
&#x255A;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x2550;&#x255D;</pre>
				</div>

				<!-- Game Stats: Coins + Streak (v6 style) -->
				{#if v2Theme.gamificationMode !== 'off'}
					<div class="v2-header-game-stats">
						<span class="v2-header-coin">&#x1FA99; {gStore.coins}</span>
						<span class="v2-header-streak">
							&#x1F525; {gStore.streakDays}d
							{#if gStore.currentStreakMultiplier > 1}
								<span class="v2-header-mult">x{gStore.currentStreakMultiplier}</span>
							{/if}
						</span>
						<span class="v2-header-freeze">&#x2744;&#xFE0F; 2</span>
					</div>
				{/if}

				<div class="v2-header-actions">
					<!-- View Toggle -->
					<div class="v2-view-toggle">
						<button
							class:active={v2Events.viewMode === 'list'}
							onclick={() => window.dispatchEvent(new CustomEvent('v2:set-view', { detail: 'list' }))}
						>&#x2261; Liste</button>
						<button
							class:active={v2Events.viewMode === 'kanban'}
							onclick={() => window.dispatchEvent(new CustomEvent('v2:set-view', { detail: 'kanban' }))}
						>&#x2593; Kanban</button>
					</div>

					<!-- Sort Button -->
					<button class="v2-sort-btn" onclick={() => window.dispatchEvent(new CustomEvent('v2:toggle-sort'))}>
						&#x21C5; <span>{v2Events.sortLabel}</span>
					</button>

					<!-- Bulk Mode -->
					<button
						class="v2-bulk-mode-btn"
						class:active={v2Events.bulkModeActive}
						onclick={() => window.dispatchEvent(new CustomEvent('v2:toggle-bulk'))}
					>
						{v2Events.bulkModeActive ? '\u2611 Auswaehlen' : '\u2610 Auswaehlen'}
					</button>

					<!-- Inline Search (Desktop: immer sichtbar, Mobile: nur Icon) -->
					<div class="v2-header-search">
						<span class="v2-search-icon">&#x26B2;</span>
						<input
							type="text"
							placeholder="Ctrl+K"
							readonly
							onclick={() => window.dispatchEvent(new CustomEvent('v2:toggle-search'))}
							aria-label="Suchen"
						/>
						<span class="v2-cursor-blink">&#x2588;</span>
					</div>
					<button
						class="v2-mobile-search-toggle"
						onclick={() => window.dispatchEvent(new CustomEvent('v2:toggle-search'))}
						aria-label="Suche oeffnen"
					>
						&#x26B2;
					</button>

					<!-- Dark/Light Toggle -->
					<button
						onclick={() => v2Theme.toggleDark()}
						style="background: none; border: none; color: var(--v2-text-secondary); font-size: .9rem; cursor: pointer; padding: 4px 8px; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;"
						aria-label="Dark/Light Mode umschalten"
					>
						{v2Theme.effectiveDark ? '\u2600' : '\u263E'}
					</button>
				</div>
			</header>

			<!-- Page content -->
			<div class="v2-content">
				<svelte:boundary onerror={(e) => console.error('V2_BOUNDARY_ERROR:', e)}>
					{@render children()}
					{#snippet failed(error)}
						<div style="padding: 40px; font-family: monospace; color: var(--v2-red, red);">
							<h2>v2 Error</h2>
							<pre style="white-space: pre-wrap; font-size: 12px; max-width: 100%; overflow-x: auto;">{error?.message ?? error}</pre>
							<pre style="white-space: pre-wrap; font-size: 10px; color: var(--v2-text-muted, #888); margin-top: 8px;">{error?.stack ?? ''}</pre>
						</div>
					{/snippet}
				</svelte:boundary>
			</div>
		</div>
	</div>

	<!-- Statusbar (fixed bottom) -->
	{#if v2Theme.gamificationMode !== 'off'}
		<Statusbar
			level={gStore.level}
			xp={gStore.xp}
			xpMax={gStore.xpForNextLevel}
			coins={gStore.coins}
			streak={gStore.streakDays}
			streakMultiplier={gStore.currentStreakMultiplier}
			questsDone={gStore.dailyQuests.filter(q => q.completed).length}
			questsTotal={gStore.dailyQuests.length || 5}
			totalTasks={gStore.totalTasksDone}
		/>
	{/if}
</div>
