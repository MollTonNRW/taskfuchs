<script lang="ts">
	import '../../v2.css';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { v2Theme, v2ThemePresets, type V2ThemePreset, type GamificationMode } from '$lib/stores/v2/theme.svelte';
	import { v2Events } from '$lib/stores/v2/events.svelte';
	import { createGamificationStore } from '$lib/stores/v2/gamification.svelte';
	import { createAchievementStore, ACHIEVEMENTS } from '$lib/stores/v2/achievements.svelte';
	import { listsStore } from '$lib/stores/lists';
	import { toasts } from '$lib/stores/toast';
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

	import * as gCrud from '$lib/services/gamification-crud';
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
	let sidebarOpen = $state(browser && window.innerWidth >= 769);
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

	// Shared list check for achievements
	let hasSharedList = $state(false);

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

	// Leaderboard
	type Player = { id: string; name: string; avatar: string; level: number; coins: number; streak: number };
	let leaderboardPlayers = $state<Player[]>([]);

	async function loadLeaderboard() {
		if (!data.supabase) return;
		const { data: profiles, error } = await gCrud.getLeaderboardProfiles(data.supabase);
		if (error || !profiles || profiles.length === 0) return;

		const userIds = profiles.map((p: { user_id: string }) => p.user_id);
		const { data: names } = await gCrud.getProfileDisplayNames(data.supabase, userIds);
		const nameMap = new Map<string, string>();
		if (names) {
			for (const n of names) {
				nameMap.set(n.id, n.display_name || n.username || 'User');
			}
		}

		leaderboardPlayers = profiles.map((p: { user_id: string; level: number; coins: number; streak_days: number }) => ({
			id: p.user_id,
			name: nameMap.get(p.user_id) ?? 'User',
			avatar: '\u{1F98A}',
			level: p.level ?? 1,
			coins: p.coins ?? 0,
			streak: p.streak_days ?? 0
		}));
	}

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
			loadLeaderboard();

			// Check if user has any shared lists (for achievements)
			data.supabase
				.from('list_shares')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', data.user.id)
				.then(({ count }) => {
					hasSharedList = (count ?? 0) > 0;
				});
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
			gStore.onTaskDone({ id: ev.taskId, parent_id: ev.parentId, priority: ev.priority ?? 'normal' }).then(async (result) => {
				if (!result) return;

				// Check achievements (delayed to let navCounts update from page)
				setTimeout(async () => {
					const allDoneInList = Object.values(v2Events.navCounts).some(
						(c) => c.total > 0 && c.done === c.total
					);
					const stats = {
						totalTasksDone: gStore.totalTasksDone,
						streakDays: gStore.streakDays,
						listCount: $listsStore.length,
						subtasksDone: gStore.totalSubtasksDone,
						currentHour: new Date().getHours(),
						speedCount: result.speedCount,
						hasSharedList,
						allDoneInList
					};
					await aStore.checkAchievements(stats);
				}, 200);

				// Fox reaction + LevelUp signal
				if (result.leveledUp) {
					foxMood = 'celebrating';
					foxMessage = 'LEVEL UP!';
					v2Events.triggerLevelUp(gStore.level, gStore.currentRank);
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

	// Shop placeholder items
	const SHOP_ITEMS: { id: string; category: 'themes' | 'sounds' | 'titles' | 'effects'; name: string; desc: string; icon: string; price: number; owned: boolean }[] = [
		// Themes
		{ id: 'theme-hacker-green', category: 'themes', name: 'Hacker Green', desc: 'Gruener Terminal-Look', icon: '🟢', price: 50, owned: false },
		{ id: 'theme-midnight-blue', category: 'themes', name: 'Midnight Blue', desc: 'Dunkles Blau', icon: '🔵', price: 50, owned: false },
		{ id: 'theme-sunset-orange', category: 'themes', name: 'Sunset Orange', desc: 'Warme Abendfarben', icon: '🟠', price: 75, owned: false },
		// Sounds
		{ id: 'sound-typewriter', category: 'sounds', name: 'Typewriter Click', desc: 'Mechanisches Klicken', icon: '⌨️', price: 30, owned: false },
		{ id: 'sound-retro-beep', category: 'sounds', name: 'Retro Beep', desc: '8-Bit Sounds', icon: '🕹️', price: 30, owned: false },
		// Titel
		{ id: 'title-taskmaster', category: 'titles', name: 'Taskmaster', desc: 'Zeigt neben deinem Namen', icon: '🏅', price: 100, owned: false },
		{ id: 'title-ninja', category: 'titles', name: 'Productivity Ninja', desc: 'Fuer die Effizienten', icon: '🥷', price: 150, owned: false },
		{ id: 'title-bughunter', category: 'titles', name: 'Bug Hunter', desc: 'Fuer die Perfektionisten', icon: '🐛', price: 200, owned: false },
		// Effekte
		{ id: 'effect-confetti', category: 'effects', name: 'Confetti Rain', desc: 'Konfetti bei Task-Completion', icon: '🎉', price: 80, owned: false },
		{ id: 'effect-matrix', category: 'effects', name: 'Matrix Rain', desc: 'Falling Code Animation', icon: '💻', price: 120, owned: false },
	];

	function handleShopPurchase(_itemId: string) {
		// TODO: Kauf-Logik implementieren
		toasts.show('Coming Soon — Shop ist noch in Arbeit!', 'info');
	}

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
			v2Events.toggleSearch();
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
	<aside class="v2-sidebar" class:open={sidebarOpen} class:collapsed={!sidebarOpen}>
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
						streakFreezes={gStore.freezeTokens}
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
				<button class="v2-nav-add-list" onclick={() => v2Events.triggerAddList()} aria-label="Neue Liste">+ Neue Liste</button>

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
						players={leaderboardPlayers.length > 0 ? leaderboardPlayers : [{
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

		<!-- Shop (collapsible, default collapsed, ab Level 3) -->
		{#if v2Theme.gamificationMode === 'full'}
			<div class="v2-sidebar-section">
				<button class="v2-section-header" onclick={() => (shopOpen = !shopOpen)} aria-label="Shop ein-/ausklappen">
					<h3>&#x250C;&#x2500; Shop {#if gStore.level < 3}<span class="v2-locked-badge">&#x1F512;</span>{/if}</h3>
					<span class="v2-section-toggle" class:collapsed={!shopOpen}>&#9660;</span>
				</button>
				<div class="v2-section-body" class:collapsed={!shopOpen}>
					{#if gStore.level >= 3}
						<ShopPanel items={SHOP_ITEMS} coins={gStore.coins} onPurchase={handleShopPurchase} />
					{:else}
						<div class="v2-shop-locked">
							<span class="v2-shop-locked-icon">&#x1F512;</span>
							<span class="v2-shop-locked-text">&gt; shop --unlock</span>
							<span class="v2-shop-locked-hint">Erreiche Level 3 zum Freischalten</span>
							<span class="v2-shop-locked-progress">Aktuell: Lvl {gStore.level} / 3</span>
						</div>
					{/if}
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
		<div class="v2-main" class:sidebar-collapsed={!sidebarOpen}>
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
						<span class="v2-header-freeze">&#x2744;&#xFE0F; {gStore.freezeTokens}</span>
					</div>
				{/if}

				<div class="v2-header-actions">
					<!-- View Toggle -->
					<div class="v2-view-toggle">
						<button
							class:active={v2Events.viewMode === 'list'}
							onclick={() => v2Events.setView('list')}
						>&#x2261; Liste</button>
						<button
							class:active={v2Events.viewMode === 'scroll'}
							onclick={() => v2Events.setView('scroll')}
						>&#x2759;&#x2759; Alle</button>
						<button
							class:active={v2Events.viewMode === 'kanban'}
							onclick={() => v2Events.setView('kanban')}
						>&#x2593; Kanban</button>
					</div>

					<!-- Sort Button -->
					<button class="v2-sort-btn" onclick={() => v2Events.toggleSort()}>
						&#x21C5; <span>{v2Events.sortLabel}</span>
					</button>

					<!-- Bulk Mode -->
					<button
						class="v2-bulk-mode-btn"
						class:active={v2Events.bulkModeActive}
						onclick={() => v2Events.toggleBulk()}
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
							onclick={() => v2Events.toggleSearch()}
							aria-label="Suchen"
						/>
						<span class="v2-cursor-blink">&#x2588;</span>
					</div>
					<button
						class="v2-mobile-search-toggle"
						onclick={() => v2Events.toggleSearch()}
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
							<pre style="white-space: pre-wrap; font-size: 12px; max-width: 100%; overflow-x: auto;">{(error as any)?.message ?? error}</pre>
							<pre style="white-space: pre-wrap; font-size: 10px; color: var(--v2-text-muted, #888); margin-top: 8px;">{(error as any)?.stack ?? ''}</pre>
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
