import type { SupabaseClient } from '@supabase/supabase-js';
import * as gCrud from '$lib/services/gamification-crud';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any>;

// ==========================================
// LEVEL SYSTEM
// ==========================================

const XP_THRESHOLDS = [
	0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000, 20000,
	27000, 36000, 50000
];

const RANKS = [
	'Neuling',
	'Anfaenger',
	'Lehrling',
	'Geselle',
	'Meister',
	'Grossmeister',
	'Legende'
] as const;

export type Rank = (typeof RANKS)[number];

function levelFromXP(xp: number): number {
	let lvl = 1;
	for (let i = 1; i < XP_THRESHOLDS.length; i++) {
		if (xp >= XP_THRESHOLDS[i]) lvl = i + 1;
		else break;
	}
	return lvl;
}

function xpForLevel(level: number): number {
	return XP_THRESHOLDS[Math.min(level, XP_THRESHOLDS.length - 1)] ?? 50000;
}

function rankFromLevel(level: number): Rank {
	if (level <= 2) return 'Neuling';
	if (level <= 4) return 'Anfaenger';
	if (level <= 6) return 'Lehrling';
	if (level <= 8) return 'Geselle';
	if (level <= 10) return 'Meister';
	if (level <= 13) return 'Grossmeister';
	return 'Legende';
}

function streakMultiplier(streakDays: number): number {
	if (streakDays >= 14) return 3;
	if (streakDays >= 7) return 2;
	if (streakDays >= 3) return 1.5;
	return 1;
}

// ==========================================
// DAILY QUEST TYPES
// ==========================================

export interface DailyQuest {
	id: string;
	quest_type: string;
	target: number;
	progress: number;
	reward_xp: number;
	reward_coins: number;
	completed: boolean;
	date: string;
}

export interface WeeklyTaskEntry {
	day: number; // 0=Mo, 6=So
	count: number;
}

// ==========================================
// STORE
// ==========================================

export function createGamificationStore() {
	let sb: Sb;
	let userId = '';

	// --- State ---
	let xp = $state(0);
	let coins = $state(0);
	let level = $state(1);
	let streakDays = $state(0);
	let streakLastDate = $state<string | null>(null);
	let bestStreak = $state(0);
	let totalTasksDone = $state(0);
	let weeklyTasks = $state<WeeklyTaskEntry[]>([]);
	let dailyQuests = $state<DailyQuest[]>([]);
	let initialized = $state(false);

	// Track speed_demon: timestamps of recent completions
	let recentCompletions: number[] = [];

	// --- Derived ---
	const xpForNextLevel = $derived(xpForLevel(level));
	const xpCurrentLevel = $derived(xpForLevel(level - 1));
	const xpProgress = $derived(
		xpForNextLevel > xpCurrentLevel
			? Math.min(
					100,
					Math.round(
						((xp - xpCurrentLevel) / (xpForNextLevel - xpCurrentLevel)) * 100
					)
				)
			: 100
	);
	const currentRank = $derived(rankFromLevel(level));
	const currentStreakMultiplier = $derived(streakMultiplier(streakDays));

	// M4: freeze_tokens aus DB laden
	let freezeTokens = $state(2);

	// H4: XP-Exploit-Schutz — Tasks die bereits belohnt wurden
	let rewardedTaskIds = $state(new Set<string>());
	let rewardedDate = $state('');

	// --- Init ---
	async function init(supabase: Sb, uid: string) {
		sb = supabase;
		userId = uid;

		const { data } = await gCrud.getOrCreateProfile(sb, userId);
		if (data) {
			xp = data.xp ?? 0;
			coins = data.coins ?? 0;
			level = data.level ?? 1;
			streakDays = data.streak_days ?? 0;
			streakLastDate = data.streak_last_date ?? null;
			bestStreak = data.best_streak ?? 0;
			totalTasksDone = data.total_tasks_done ?? 0;
			weeklyTasks = (data.weekly_tasks as WeeklyTaskEntry[]) ?? [];
			freezeTokens = data.freeze_tokens ?? 2;
			// Recalc level from XP to be safe
			level = levelFromXP(xp);
		}

		// Load daily quests
		const today = todayStr();
		const { data: quests } = await gCrud.getDailyQuests(sb, userId, today);
		dailyQuests = (quests as DailyQuest[]) ?? [];

		// H4: Reset rewarded set bei Tageswechsel
		rewardedDate = today;

		initialized = true;
	}

	// --- Streak logic ---
	// M2: Lokalzeit statt UTC
	function todayStr(): string {
		return new Date().toLocaleDateString('sv-SE');
	}

	function yesterdayStr(): string {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		return d.toLocaleDateString('sv-SE');
	}

	async function updateStreak() {
		const today = todayStr();
		if (streakLastDate === today) return; // Already counted today

		if (streakLastDate === yesterdayStr()) {
			streakDays += 1;
		} else if (streakLastDate !== today) {
			streakDays = 1; // Reset streak
		}
		streakLastDate = today;
		if (streakDays > bestStreak) bestStreak = streakDays;

		await gCrud.updateProfile(sb, userId, {
			streak_days: streakDays,
			streak_last_date: streakLastDate,
			best_streak: bestStreak
		});
	}

	// --- Weekly tracking ---
	function updateWeeklyTasks() {
		const dayOfWeek = (new Date().getDay() + 6) % 7; // 0=Mo, 6=So
		const existing = weeklyTasks.find((w) => w.day === dayOfWeek);
		if (existing) {
			existing.count += 1;
			weeklyTasks = [...weeklyTasks]; // Trigger reactivity
		} else {
			weeklyTasks = [...weeklyTasks, { day: dayOfWeek, count: 1 }];
		}
	}

	// --- XP & Coins ---
	// C1: Atomarer RPC statt Read-then-Write
	async function grantRewards(xpAmount: number, coinAmount: number) {
		const multiplier = currentStreakMultiplier;
		const finalXP = Math.round(xpAmount * multiplier);

		// Optimistic Update
		xp += finalXP;
		coins += coinAmount;
		const newLevel = levelFromXP(xp);
		const leveledUp = newLevel > level;
		level = newLevel;

		const { data, error } = await gCrud.grantRewards(sb, userId, finalXP, coinAmount);
		if (error) {
			// Rollback bei Fehler
			xp -= finalXP;
			coins -= coinAmount;
			level = levelFromXP(xp);
			return { xpGained: 0, coinsGained: 0, leveledUp: false };
		}

		// Server-Werte uebernehmen falls vorhanden
		if (data && data.length > 0) {
			xp = data[0].new_xp;
			coins = data[0].new_coins;
			level = levelFromXP(xp);
		}

		// Restliche Profil-Felder separat updaten
		await gCrud.updateProfile(sb, userId, {
			level,
			total_tasks_done: totalTasksDone,
			weekly_tasks: weeklyTasks
		});

		return { xpGained: finalXP, coinsGained: coinAmount, leveledUp };
	}

	// --- Quest progress ---
	// H3: Error-Handling fuer Quest-Rewards
	async function progressQuests(questType: string, amount: number = 1) {
		for (const quest of dailyQuests) {
			if (quest.quest_type === questType && !quest.completed) {
				const oldProgress = quest.progress;
				const newProgress = Math.min(quest.progress + amount, quest.target);
				quest.progress = newProgress;

				const { error: progressError } = await gCrud.updateQuestProgress(sb, quest.id, newProgress);
				if (progressError) {
					quest.progress = oldProgress;
					continue;
				}

				if (newProgress >= quest.target) {
					quest.completed = true;
					const { error: completeError } = await gCrud.completeQuest(sb, quest.id);
					if (completeError) {
						quest.completed = false;
						quest.progress = oldProgress;
						continue;
					}
					// Quest-Rewards atomar ueber RPC
					const { data, error: rewardError } = await gCrud.grantRewards(
						sb, userId, quest.reward_xp, quest.reward_coins
					);
					if (!rewardError && data && data.length > 0) {
						xp = data[0].new_xp;
						coins = data[0].new_coins;
						level = levelFromXP(xp);
					} else if (rewardError) {
						quest.completed = false;
						quest.progress = oldProgress;
					}
				}
			}
		}
		dailyQuests = [...dailyQuests]; // Trigger reactivity
	}

	// --- Track speed_demon ---
	function trackCompletion(): number {
		const now = Date.now();
		recentCompletions.push(now);
		// Keep only last 5 minutes
		const fiveMinAgo = now - 5 * 60 * 1000;
		recentCompletions = recentCompletions.filter((t) => t >= fiveMinAgo);
		return recentCompletions.length;
	}

	// --- Public event handlers ---
	// H4: XP-Exploit-Schutz — jede Task-ID wird nur einmal pro Tag belohnt
	async function onTaskDone(task: { id: string; parent_id: string | null }) {
		if (!initialized) return { xpGained: 0, coinsGained: 0, leveledUp: false, speedCount: 0 };

		// H4: Tageswechsel-Reset
		const today = todayStr();
		if (rewardedDate !== today) {
			rewardedTaskIds = new Set();
			rewardedDate = today;
		}

		// H4: Bereits belohnte Task ignorieren
		if (rewardedTaskIds.has(task.id)) {
			const speedCount = trackCompletion();
			return { xpGained: 0, coinsGained: 0, leveledUp: false, speedCount };
		}
		rewardedTaskIds = new Set([...rewardedTaskIds, task.id]);

		const isSubtask = !!task.parent_id;
		const xpAmount = isSubtask ? 5 : 10;
		const coinAmount = isSubtask ? 1 : 2;

		totalTasksDone += 1;
		updateWeeklyTasks();
		await updateStreak();

		const result = await grantRewards(xpAmount, coinAmount);

		// Progress quests
		await progressQuests('complete_tasks');
		if (isSubtask) await progressQuests('complete_subtasks');

		const speedCount = trackCompletion();

		return { ...result, speedCount };
	}

	async function onSubtaskDone(task: { id: string }) {
		return onTaskDone({ id: task.id, parent_id: 'subtask' });
	}

	async function onTaskUndone(_task: { id: string }) {
		if (!initialized) return;
		// Undo: reduce counter but don't take away XP (zu frustrierend)
		if (totalTasksDone > 0) totalTasksDone -= 1;
		await gCrud.updateProfile(sb, userId, {
			total_tasks_done: totalTasksDone
		});
	}

	return {
		// State (readonly getters)
		get xp() { return xp; },
		get coins() { return coins; },
		get level() { return level; },
		get streakDays() { return streakDays; },
		get streakLastDate() { return streakLastDate; },
		get bestStreak() { return bestStreak; },
		get totalTasksDone() { return totalTasksDone; },
		get weeklyTasks() { return weeklyTasks; },
		get dailyQuests() { return dailyQuests; },
		get initialized() { return initialized; },
		get freezeTokens() { return freezeTokens; },

		// Derived
		get xpForNextLevel() { return xpForNextLevel; },
		get xpCurrentLevel() { return xpCurrentLevel; },
		get xpProgress() { return xpProgress; },
		get currentRank() { return currentRank; },
		get currentStreakMultiplier() { return currentStreakMultiplier; },

		// Methods
		init,
		onTaskDone,
		onSubtaskDone,
		onTaskUndone,

		// Helpers (for achievement checks)
		get recentCompletionCount() { return recentCompletions.length; }
	};
}

export type GamificationStore = ReturnType<typeof createGamificationStore>;
