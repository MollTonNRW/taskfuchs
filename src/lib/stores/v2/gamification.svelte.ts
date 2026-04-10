import type { SupabaseClient } from '@supabase/supabase-js';
import * as gCrud from '$lib/services/gamification-crud';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any>;

// ==========================================
// LEVEL SYSTEM
// ==========================================

const XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000, 20000, 27000, 36000, 50000];

const RANKS = ['Neuling', 'Anfaenger', 'Lehrling', 'Geselle', 'Meister', 'Grossmeister', 'Legende'] as const;

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

const QUEST_POOL = [
	{ quest_type: 'complete_tasks', target: 3, reward_xp: 30, reward_coins: 15, label: '3 Tasks erledigen' },
	{ quest_type: 'complete_tasks', target: 5, reward_xp: 50, reward_coins: 25, label: '5 Tasks erledigen' },
	{ quest_type: 'complete_tasks', target: 10, reward_xp: 100, reward_coins: 50, label: '10 Tasks erledigen' },
	{ quest_type: 'complete_subtasks', target: 3, reward_xp: 20, reward_coins: 10, label: '3 Subtasks erledigen' },
	{ quest_type: 'complete_subtasks', target: 5, reward_xp: 40, reward_coins: 20, label: '5 Subtasks erledigen' },
	{ quest_type: 'complete_tasks', target: 1, reward_xp: 15, reward_coins: 10, label: '1 Task erledigen' },
	{ quest_type: 'complete_tasks', target: 7, reward_xp: 70, reward_coins: 35, label: '7 Tasks erledigen' },
	{ quest_type: 'complete_subtasks', target: 10, reward_xp: 60, reward_coins: 30, label: '10 Subtasks erledigen' },
	{ quest_type: 'complete_tasks', target: 2, reward_xp: 20, reward_coins: 10, label: '2 Tasks erledigen' },
	{ quest_type: 'complete_subtasks', target: 1, reward_xp: 10, reward_coins: 5, label: '1 Subtask erledigen' }
] as const;

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
	let totalSubtasksDone = $state(0);
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
			? Math.min(100, Math.round(((xp - xpCurrentLevel) / (xpForNextLevel - xpCurrentLevel)) * 100))
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

		// C1: totalSubtasksDone aus DB berechnen (kein eigenes Feld in gamification_profiles)
		const { count: subtaskCount } = await sb
			.from('tasks')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.not('parent_id', 'is', null)
			.eq('done', true);
		totalSubtasksDone = subtaskCount ?? 0;

		// Load daily quests, generate if none exist
		const today = todayStr();
		const { data: quests } = await gCrud.getDailyQuests(sb, userId, today);
		dailyQuests = (quests as DailyQuest[]) ?? [];

		if (dailyQuests.length === 0) {
			dailyQuests = await generateDailyQuests(today);
		}

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
			// Gestern aktiv gewesen — Streak normal erhoehen
			streakDays += 1;
		} else if (streakLastDate) {
			// H2: Mehrtaegige Abwesenheit — Tage seit letztem Aktivitaetstag berechnen
			const last = new Date(streakLastDate + 'T00:00:00');
			const todayDate = new Date(today + 'T00:00:00');
			const daysMissed = Math.round((todayDate.getTime() - last.getTime()) / 86400000) - 1;

			if (daysMissed > 0 && daysMissed <= freezeTokens) {
				// Genug Freeze-Tokens — alle verbrauchten Tage abdecken
				freezeTokens -= daysMissed;
				streakDays += 1; // Heute zaehlt als neuer Tag
			} else if (daysMissed > 0 && freezeTokens > 0) {
				// Nicht genug Tokens — alle verbrauchen, Streak reset
				freezeTokens = 0;
				streakDays = 1;
			} else {
				// Keine Tokens — Streak reset
				streakDays = 1;
			}
		} else {
			// Erster Tag ueberhaupt
			streakDays = 1;
		}
		streakLastDate = today;
		if (streakDays > bestStreak) bestStreak = streakDays;

		await gCrud.updateProfile(sb, userId, {
			streak_days: streakDays,
			streak_last_date: streakLastDate,
			best_streak: bestStreak,
			freeze_tokens: freezeTokens
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

	// --- Quest generation ---
	async function generateDailyQuests(date: string): Promise<DailyQuest[]> {
		// H1: Race-Condition-Schutz — nochmal DB pruefen ob heute schon Quests existieren
		const { data: existing } = await gCrud.getDailyQuests(sb, userId, date);
		if (existing && existing.length > 0) {
			return existing as DailyQuest[];
		}

		// Pick 2 random quests from the pool, ensuring different quest_types if possible
		const shuffled = [...QUEST_POOL].sort(() => Math.random() - 0.5);
		const picked: (typeof QUEST_POOL)[number][] = [];
		const usedTypes = new Set<string>();

		for (const quest of shuffled) {
			if (picked.length >= 2) break;
			if (picked.length === 0 || !usedTypes.has(quest.quest_type)) {
				picked.push(quest);
				usedTypes.add(quest.quest_type);
			}
		}
		// Fallback: if only 1 picked, take another
		if (picked.length < 2) {
			for (const quest of shuffled) {
				if (picked.length >= 2) break;
				if (!picked.includes(quest)) picked.push(quest);
			}
		}

		const results: DailyQuest[] = [];
		for (let i = 0; i < picked.length; i++) {
			const quest = picked[i];
			const { data, error } = await gCrud.insertDailyQuest(
				sb,
				userId,
				{
					quest_type: quest.quest_type,
					target: quest.target,
					reward_xp: quest.reward_xp,
					reward_coins: quest.reward_coins,
					date
				},
				i // slot = 0 fuer ersten, 1 fuer zweiten Pick
			);
			if (!error && data) {
				results.push(data as DailyQuest);
			} else if (error) {
				// Race Condition: UNIQUE (user_id, date, slot) verletzt —
				// andere Session war schneller. Existierende Quests zurueckgeben.
				const { data: existingNow } = await gCrud.getDailyQuests(sb, userId, date);
				if (existingNow && existingNow.length > 0) {
					return existingNow as DailyQuest[];
				}
			}
		}
		return results;
	}

	// --- Quest progress ---
	// Migration 014: Quest-Progress bleibt client-seitig (trusted UPDATE auf daily_quests.progress),
	// aber sobald newProgress >= target erreicht ist, geht es atomar ueber complete_quest_reward RPC.
	// FOLLOW-UP: Progress-UPDATE auch serverseitig absichern (sonst Cheat-Vektor).
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
					// Atomare RPC: Quest completen + Reward granten in einer Transaction.
					const { data, error: rewardError } = await gCrud.completeQuestReward(sb, quest.id);
					if (rewardError || !data || data.length === 0) {
						// Server hat abgelehnt — lokalen State zuruecksetzen.
						quest.progress = oldProgress;
						quest.completed = false;
						continue;
					}
					quest.completed = true;
					xp = data[0].new_xp;
					coins = data[0].new_coins;
					level = levelFromXP(xp);
					// Level in DB persistieren (RPC updated nur xp/coins).
					await gCrud.updateProfile(sb, userId, { level });
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
	// Migration 014: Rewards werden komplett server-seitig berechnet.
	// Client uebergibt nur die Task-ID, RPC checkt Ownership, done, type,
	// Double-Submit (rewarded_tasks Tabelle) und liefert die tatsaechlichen Werte.
	// rewardedTaskIds-Set bleibt als lokale Optimierung (spart RPC-Roundtrips),
	// ist aber nicht mehr das Security-Gate.
	async function onTaskDone(task: { id: string; parent_id: string | null; priority?: string }) {
		if (!initialized) return { xpGained: 0, coinsGained: 0, leveledUp: false, speedCount: 0 };

		// Tageswechsel-Reset des lokalen Caches
		const today = todayStr();
		if (rewardedDate !== today) {
			rewardedTaskIds = new Set();
			rewardedDate = today;
		}

		const speedCount = trackCompletion();

		// Lokaler Cache: kein erneuter RPC-Roundtrip falls schon belohnt
		if (rewardedTaskIds.has(task.id)) {
			return { xpGained: 0, coinsGained: 0, leveledUp: false, speedCount };
		}

		// Server-seitige Reward-Berechnung
		const { data, error } = await gCrud.completeTaskReward(sb, task.id);
		if (error) {
			// Server hat abgelehnt (nicht authentifiziert, nicht owner, nicht done, ...).
			// Kein State-Update — Konsistenz zwischen Counter und Reward wahren.
			console.error('[gamification] completeTaskReward failed:', error);
			return { xpGained: 0, coinsGained: 0, leveledUp: false, speedCount };
		}
		if (!data || data.length === 0) {
			return { xpGained: 0, coinsGained: 0, leveledUp: false, speedCount };
		}

		const row = data[0];

		// Already rewarded (Double-Submit durch Server erkannt)
		if (row.already_rewarded) {
			rewardedTaskIds = new Set([...rewardedTaskIds, task.id]);
			return { xpGained: 0, coinsGained: 0, leveledUp: false, speedCount };
		}

		// Server-Werte uebernehmen
		const oldLevel = level;
		xp = row.new_xp;
		coins = row.new_coins;
		level = levelFromXP(xp);
		const leveledUp = level > oldLevel;

		rewardedTaskIds = new Set([...rewardedTaskIds, task.id]);

		// Lokale Counter nur hochzaehlen, wenn Server tatsaechlich belohnt hat
		const isSubtask = !!task.parent_id;
		totalTasksDone += 1;
		if (isSubtask) totalSubtasksDone += 1;
		updateWeeklyTasks();
		await updateStreak();

		// Level + Counter persistieren (RPC updated nur xp/coins)
		await gCrud.updateProfile(sb, userId, {
			level,
			total_tasks_done: totalTasksDone,
			weekly_tasks: weeklyTasks
		});

		// Progress quests (weiter client-seitig bis Follow-up)
		await progressQuests('complete_tasks');
		if (isSubtask) await progressQuests('complete_subtasks');

		return {
			xpGained: row.xp_gained,
			coinsGained: row.coins_gained,
			leveledUp,
			speedCount
		};
	}

	async function onSubtaskDone(task: { id: string }) {
		return onTaskDone({ id: task.id, parent_id: 'subtask' });
	}

	async function onTaskUndone(task: { id: string; parent_id?: string | null }) {
		if (!initialized) return;
		// Undo: reduce counter but don't take away XP (zu frustrierend)
		const isSubtask = !!task.parent_id;
		if (isSubtask) {
			if (totalSubtasksDone > 0) totalSubtasksDone -= 1;
		}
		if (totalTasksDone > 0) totalTasksDone -= 1;
		await gCrud.updateProfile(sb, userId, {
			total_tasks_done: totalTasksDone
		});
	}

	return {
		// State (readonly getters)
		get xp() {
			return xp;
		},
		get coins() {
			return coins;
		},
		get level() {
			return level;
		},
		get streakDays() {
			return streakDays;
		},
		get streakLastDate() {
			return streakLastDate;
		},
		get bestStreak() {
			return bestStreak;
		},
		get totalTasksDone() {
			return totalTasksDone;
		},
		get totalSubtasksDone() {
			return totalSubtasksDone;
		},
		get weeklyTasks() {
			return weeklyTasks;
		},
		get dailyQuests() {
			return dailyQuests;
		},
		get initialized() {
			return initialized;
		},
		get freezeTokens() {
			return freezeTokens;
		},

		// Derived
		get xpForNextLevel() {
			return xpForNextLevel;
		},
		get xpCurrentLevel() {
			return xpCurrentLevel;
		},
		get xpProgress() {
			return xpProgress;
		},
		get currentRank() {
			return currentRank;
		},
		get currentStreakMultiplier() {
			return currentStreakMultiplier;
		},

		// Methods
		init,
		onTaskDone,
		onSubtaskDone,
		onTaskUndone,

		// Helpers (for achievement checks)
		get recentCompletionCount() {
			return recentCompletions.length;
		}
	};
}

export type GamificationStore = ReturnType<typeof createGamificationStore>;
