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
	import TeamStats from '$lib/components/v2/TeamStats.svelte';

	let { data, children } = $props();
	let sidebarOpen = $state(false);
	let filterOpen = $state(true);
	let prioFilterOpen = $state(false);
	let viewFilterOpen = $state(false);

	// Collapsible sidebar sections
	let weeklyOpen = $state(false);
	let questsOpen = $state(true);
	let achievementsOpen = $state(false);
	let shopOpen = $state(false);
	let teamOpen = $state(false);

	// Boot sequence
	let showBoot = $state(false);
	let bootDone = $state(true);

	// Fox state
	let foxMood = $state<'idle' | 'celebrating' | 'sleeping' | 'happy' | 'encouraging'>('idle');
	let foxMessage = $state('');

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
		<!-- Fox + User Area -->
		<div class="v2-sidebar-section" style="padding: 18px 16px 14px;">
			<div style="display: flex; align-items: center; gap: 14px;">
				<div aria-hidden="true">
					<FoxMascot mood={foxMood} message={foxMessage} />
				</div>
				<div style="min-width: 0;">
					<div style="font-size: .72rem; font-weight: 700; color: var(--v2-orange);">
						{data.user?.email?.split('@')[0] ?? 'User'}
					</div>
					<div style="font-size: .58rem; color: var(--v2-text-muted); margin-top: 2px;">
						{gStore.currentRank} &middot; Lv.{gStore.level}
					</div>
				</div>
			</div>
		</div>

		<!-- Stats Bar -->
		{#if v2Theme.gamificationMode !== 'off'}
			<div class="v2-sidebar-section" style="padding: 8px 16px;">
				<StatsBar
					level={gStore.level}
					xp={gStore.xp}
					xpMax={gStore.xpForNextLevel}
					coins={gStore.coins}
					streak={gStore.streakDays}
					rank={gStore.currentRank}
					streakMultiplier={gStore.currentStreakMultiplier}
				/>
			</div>
		{/if}

		<!-- Weekly Tracker (collapsible) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (weeklyOpen = !weeklyOpen)} aria-label="Wochentracker ein-/ausklappen">
					<h3>Wochentracker</h3>
					<span class="v2-section-toggle" class:collapsed={!weeklyOpen}>&#9660;</span>
				</button>
				{#if weeklyOpen}
					<div class="v2-section-body" style="margin-top: 8px;">
						<WeeklyTracker {weekData} {totalWeek} bestWeek={gStore.bestStreak > 0 ? totalWeek : 0} />
					</div>
				{/if}
			</div>
		{/if}

		<!-- Daily Quests (collapsible) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (questsOpen = !questsOpen)} aria-label="Quests ein-/ausklappen">
					<h3>
						Quests
						{#if gStore.dailyQuests.filter(q => !q.completed).length > 0}
							<span style="font-size: .45rem; padding: 1px 5px; border-radius: 8px; background: var(--v2-accent-glow); color: var(--v2-accent); font-weight: 600; margin-left: 6px;">
								{gStore.dailyQuests.filter(q => !q.completed).length}
							</span>
						{/if}
					</h3>
					<span class="v2-section-toggle" class:collapsed={!questsOpen}>&#9660;</span>
				</button>
				{#if questsOpen}
					<div class="v2-section-body" style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
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
							<p style="font-size: .6rem; color: var(--v2-text-muted); font-style: italic; padding: 4px 0;">
								Keine Quests heute
							</p>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Achievements (collapsible) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (achievementsOpen = !achievementsOpen)} aria-label="Achievements ein-/ausklappen">
					<h3>
						Achievements
						<span style="font-size: .45rem; color: var(--v2-text-muted); margin-left: 6px;">
							{aStore.unlockedCount}/{aStore.totalCount}
						</span>
					</h3>
					<span class="v2-section-toggle" class:collapsed={!achievementsOpen}>&#9660;</span>
				</button>
				{#if achievementsOpen}
					<div class="v2-section-body" style="margin-top: 8px;">
						<AchievementsPanel achievements={achievementsList} />
					</div>
				{/if}
			</div>
		{/if}

		<!-- Shop (collapsible, default collapsed) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (shopOpen = !shopOpen)} aria-label="Shop ein-/ausklappen">
					<h3>Shop</h3>
					<span class="v2-section-toggle" class:collapsed={!shopOpen}>&#9660;</span>
				</button>
				{#if shopOpen}
					<div class="v2-section-body" style="margin-top: 8px;">
						<ShopPanel items={[]} coins={gStore.coins} />
					</div>
				{/if}
			</div>
		{/if}

		<!-- Team / Leaderboard (collapsible, default collapsed) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (teamOpen = !teamOpen)} aria-label="Leaderboard ein-/ausklappen">
					<h3>Leaderboard</h3>
					<span class="v2-section-toggle" class:collapsed={!teamOpen}>&#9660;</span>
				</button>
				{#if teamOpen}
					<div class="v2-section-body" style="margin-top: 8px;">
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
				{/if}
			</div>
		{/if}

		<!-- Filter Section -->
		<div class="v2-sidebar-section">
			<button class="v2-section-header" onclick={() => (filterOpen = !filterOpen)} aria-label="Filter ein-/ausklappen">
				<h3>
					Filter
					{#if $hasActiveFilter}
						<span style="font-size: .45rem; padding: 1px 5px; border-radius: 8px; background: var(--v2-accent-glow); color: var(--v2-accent); font-weight: 600; margin-left: 6px;">
							aktiv
						</span>
					{/if}
				</h3>
				<span class="v2-section-toggle" class:collapsed={!filterOpen}>&#9660;</span>
			</button>

			{#if filterOpen}
				<div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
					<!-- Priority Filter -->
					<button
						onclick={() => (prioFilterOpen = !prioFilterOpen)}
						style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: var(--v2-radius); font-size: .65rem; color: var(--v2-text-secondary); background: none; border: none; cursor: pointer; width: 100%; text-align: left; min-height: 44px;"
						aria-label="Prioritaet-Filter ein-/ausklappen"
					>
						<span class="v2-section-toggle" style="font-size: .5rem;" class:collapsed={!prioFilterOpen}>&#9660;</span>
						Prioritaet
					</button>
					{#if prioFilterOpen}
						<div style="margin-left: 12px; display: flex; flex-direction: column; gap: 2px;">
							{#each [
								{ key: 'low', label: 'Niedrig', color: 'var(--v2-green)' },
								{ key: 'normal', label: 'Normal', color: 'var(--v2-yellow)' },
								{ key: 'high', label: 'Hoch', color: 'var(--v2-red)' },
								{ key: 'asap', label: 'ASAP!', color: 'var(--v2-red)' }
							] as filter}
								<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 6px; border-radius: var(--v2-radius); min-height: 44px;">
									<input
										type="checkbox"
										checked={$priorityFilters[filter.key as keyof typeof $priorityFilters]}
										onchange={() => togglePriorityFilter(filter.key as any)}
										style="accent-color: var(--v2-accent); width: 16px; height: 16px;"
									/>
									<span style="width: 8px; height: 8px; border-radius: 50%; background: {filter.color}; flex-shrink: 0;"></span>
									{filter.label}
								</label>
							{/each}
						</div>
					{/if}

					<!-- View Filter -->
					<button
						onclick={() => (viewFilterOpen = !viewFilterOpen)}
						style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: var(--v2-radius); font-size: .65rem; color: var(--v2-text-secondary); background: none; border: none; cursor: pointer; width: 100%; text-align: left; min-height: 44px;"
						aria-label="Ansicht-Filter ein-/ausklappen"
					>
						<span class="v2-section-toggle" style="font-size: .5rem;" class:collapsed={!viewFilterOpen}>&#9660;</span>
						Ansicht
					</button>
					{#if viewFilterOpen}
						<div style="margin-left: 12px; display: flex; flex-direction: column; gap: 2px;">
							<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 6px; min-height: 44px;">
								<input type="checkbox" checked={$viewFilters.highlighted} onchange={() => toggleViewFilter('highlighted')} style="accent-color: var(--v2-accent); width: 16px; height: 16px;" />
								Nur Fixierte
							</label>
							<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 6px; min-height: 44px;">
								<input type="checkbox" checked={$viewFilters.withDate} onchange={() => toggleViewFilter('withDate')} style="accent-color: var(--v2-accent); width: 16px; height: 16px;" />
								Mit Termin
							</label>
							<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 6px; min-height: 44px;">
								<input type="checkbox" checked={$viewFilters.shared} onchange={() => toggleViewFilter('shared')} style="accent-color: var(--v2-accent); width: 16px; height: 16px;" />
								Geteilte Listen
							</label>
						</div>
					{/if}

					<!-- Subtasks collapsed -->
					<label style="display: flex; align-items: center; gap: 6px; font-size: .65rem; color: var(--v2-text-secondary); cursor: pointer; padding: 3px 8px; margin-top: 4px; min-height: 44px;">
						<input type="checkbox" checked={$subtasksCollapsedByDefault} onchange={toggleSubtasksDefault} style="accent-color: var(--v2-accent); width: 16px; height: 16px;" />
						Unteraufgaben eingeklappt
					</label>

					{#if $hasActiveFilter}
						<button
							onclick={resetFilters}
							style="font-size: .55rem; color: var(--v2-accent); cursor: pointer; text-decoration: underline; padding: 4px 8px; background: none; border: none; text-align: left; min-height: 44px;"
							aria-label="Filter zuruecksetzen"
						>
							Filter zuruecksetzen
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Lists Navigation -->
		<div class="v2-sidebar-section" style="flex: 1; overflow-y: auto;">
			<h3 style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 8px;">Listen</h3>
			{#if $listsStore.length > 0}
				<div style="display: flex; flex-direction: column; gap: 2px;">
					{#each $listsStore as list (list.id)}
						<div class="v2-nav-item" style="position: relative;">
							<span style="font-size: .9rem;">{list.icon}</span>
							<span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{list.title}</span>
							<button
								onclick={() => toggleListVisibility(list.id)}
								style="opacity: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: none; border: none; color: var(--v2-text-muted); font-size: .6rem; transition: opacity .2s; cursor: pointer; min-width: 44px; min-height: 44px;"
								onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
								onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
								title={$hiddenListIds.has(list.id) ? 'Einblenden' : 'Ausblenden'}
								aria-label={$hiddenListIds.has(list.id) ? 'Liste einblenden' : 'Liste ausblenden'}
							>
								{$hiddenListIds.has(list.id) ? '\u25CB' : '\u25CF'}
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<p style="font-size: .65rem; color: var(--v2-text-muted); font-style: italic;">Noch keine Listen</p>
			{/if}
		</div>

		<!-- Theme + Gamification + User -->
		<div class="v2-sidebar-section" style="border-top: 1px dashed var(--v2-border); border-bottom: none;">
			<h3 style="font-size: .55rem; text-transform: uppercase; letter-spacing: 2px; color: var(--v2-text-muted); margin-bottom: 8px;">Design</h3>
			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 12px;">
				{#each v2ThemePresets as t}
					<button
						onclick={() => v2Theme.setPreset(t.id)}
						style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: var(--v2-radius); font-size: .65rem; border: 1px dashed {v2Theme.preset === t.id ? 'var(--v2-accent)' : 'var(--v2-border)'}; background: {v2Theme.preset === t.id ? 'var(--v2-accent-glow)' : 'transparent'}; color: {v2Theme.preset === t.id ? 'var(--v2-accent)' : 'var(--v2-text-secondary)'}; cursor: pointer; transition: all .2s ease; min-height: 44px;"
						aria-label="Theme: {t.name}"
					>
						<span style="font-family: var(--v2-font);">{t.icon}</span>
						{t.name}
					</button>
				{/each}
			</div>

			<!-- Dark/Light Toggle -->
			<button
				onclick={() => v2Theme.toggleDark()}
				style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border-radius: var(--v2-radius); border: 1px dashed var(--v2-border); background: transparent; color: var(--v2-text-secondary); font-size: .65rem; cursor: pointer; margin-bottom: 12px; min-height: 44px;"
				disabled={v2Theme.preset === 'neon' || v2Theme.preset === 'aurora'}
				aria-label={v2Theme.effectiveDark ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'}
			>
				{v2Theme.effectiveDark ? '\u2600' : '\u263E'}
				{v2Theme.effectiveDark ? 'Light Mode' : 'Dark Mode'}
				{#if v2Theme.preset === 'neon' || v2Theme.preset === 'aurora'}
					<span style="margin-left: auto; font-size: .5rem; color: var(--v2-text-muted);">(erzwungen)</span>
				{/if}
			</button>

			<!-- Gamification Mode Toggle -->
			<div style="margin-bottom: 12px;">
				<div style="font-size: .5rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--v2-text-muted); margin-bottom: 6px;">Gamification</div>
				<div style="display: flex; gap: 4px;">
					{#each gamificationModes as mode}
						<button
							onclick={() => v2Theme.setGamificationMode(mode.key)}
							style="flex: 1; padding: 5px 8px; border: 1px dashed {v2Theme.gamificationMode === mode.key ? 'var(--v2-accent)' : 'var(--v2-border)'}; border-radius: var(--v2-radius); font-size: .6rem; background: {v2Theme.gamificationMode === mode.key ? 'var(--v2-accent-glow)' : 'transparent'}; color: {v2Theme.gamificationMode === mode.key ? 'var(--v2-accent)' : 'var(--v2-text-muted)'}; cursor: pointer; transition: all .2s ease; font-family: var(--v2-font); min-height: 44px;"
							aria-label="Gamification Modus: {mode.label}"
						>
							{mode.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Logout -->
			<button
				onclick={logout}
				style="display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 10px; border-radius: var(--v2-radius); border: 1px dashed var(--v2-border); background: transparent; color: var(--v2-red); font-size: .65rem; cursor: pointer; min-height: 44px;"
				aria-label="Abmelden"
			>
				&#x23FB; Abmelden
			</button>
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
				<div style="display: flex; align-items: center; gap: 8px;">
					<span style="font-size: 1rem;" aria-hidden="true">&#x1F98A;</span>
					<span style="font-size: .85rem; font-weight: 700; color: var(--v2-orange);">TaskFuchs</span>
					<span style="font-size: .55rem; color: var(--v2-text-muted); padding: 2px 6px; border: 1px dashed var(--v2-border); border-radius: var(--v2-radius);">v2</span>
				</div>
				<div style="flex: 1;"></div>
				<!-- Theme quick toggle (desktop) -->
				<div style="display: none; gap: 4px;" class="hidden md:flex">
					{#each v2ThemePresets as t}
						<button
							onclick={() => v2Theme.setPreset(t.id)}
							style="padding: 4px 10px; border-radius: var(--v2-radius); font-size: .6rem; border: 1px dashed {v2Theme.preset === t.id ? 'var(--v2-accent)' : 'transparent'}; background: {v2Theme.preset === t.id ? 'var(--v2-accent-glow)' : 'transparent'}; color: {v2Theme.preset === t.id ? 'var(--v2-accent)' : 'var(--v2-text-muted)'}; cursor: pointer; transition: all .15s; min-height: 44px;"
							aria-label="Theme: {t.name}"
						>
							{t.name}
						</button>
					{/each}
				</div>
				<button
					onclick={() => v2Theme.toggleDark()}
					style="background: none; border: none; color: var(--v2-text-secondary); font-size: .9rem; cursor: pointer; padding: 4px 8px; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;"
					aria-label="Dark/Light Mode umschalten"
				>
					{v2Theme.effectiveDark ? '\u2600' : '\u263E'}
				</button>
			</header>

			<!-- Page content -->
			<div class="v2-content">
				{@render children()}
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
		/>
	{/if}
</div>
