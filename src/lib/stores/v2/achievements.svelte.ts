import type { SupabaseClient } from '@supabase/supabase-js';
import * as gCrud from '$lib/services/gamification-crud';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any>;

// ==========================================
// ACHIEVEMENT DEFINITIONS
// ==========================================

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface AchievementDef {
	id: string;
	name: string;
	description: string;
	icon: string;
	rarity: Rarity;
	condition: (stats: AchievementStats) => boolean;
}

export interface AchievementStats {
	totalTasksDone: number;
	streakDays: number;
	listCount: number;
	subtasksDone: number;
	currentHour: number;
	speedCount: number; // Tasks in last 5 min
	hasSharedList: boolean;
	allDoneInList: boolean;
}

export interface UnlockedAchievement {
	achievement_id: string;
	unlocked_at: string;
	notified: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
	// --- Task count ---
	{
		id: 'first_task',
		name: 'Erster Schritt',
		description: '1 Aufgabe erledigt',
		icon: '🐾',
		rarity: 'common',
		condition: (s) => s.totalTasksDone >= 1
	},
	{
		id: 'task_10',
		name: 'Fleissiger Fuchs',
		description: '10 Aufgaben erledigt',
		icon: '🦊',
		rarity: 'common',
		condition: (s) => s.totalTasksDone >= 10
	},
	{
		id: 'task_50',
		name: 'Aufgaben-Jaeger',
		description: '50 Aufgaben erledigt',
		icon: '🎯',
		rarity: 'uncommon',
		condition: (s) => s.totalTasksDone >= 50
	},
	{
		id: 'task_100',
		name: 'Centurion',
		description: '100 Aufgaben erledigt',
		icon: '💯',
		rarity: 'rare',
		condition: (s) => s.totalTasksDone >= 100
	},
	{
		id: 'task_500',
		name: 'Halbzeit-Held',
		description: '500 Aufgaben erledigt',
		icon: '🏆',
		rarity: 'legendary',
		condition: (s) => s.totalTasksDone >= 500
	},

	// --- Streak ---
	{
		id: 'streak_3',
		name: 'Drei-Tage-Feuer',
		description: '3 Tage in Folge aktiv',
		icon: '🔥',
		rarity: 'common',
		condition: (s) => s.streakDays >= 3
	},
	{
		id: 'streak_7',
		name: 'Wochen-Krieger',
		description: '7 Tage in Folge aktiv',
		icon: '⚔️',
		rarity: 'uncommon',
		condition: (s) => s.streakDays >= 7
	},
	{
		id: 'streak_30',
		name: 'Monatlicher Meister',
		description: '30 Tage in Folge aktiv',
		icon: '👑',
		rarity: 'rare',
		condition: (s) => s.streakDays >= 30
	},

	// --- Lists ---
	{
		id: 'list_5',
		name: 'Listensammler',
		description: '5 Listen erstellt',
		icon: '📋',
		rarity: 'common',
		condition: (s) => s.listCount >= 5
	},

	// --- Subtasks ---
	{
		id: 'subtask_master',
		name: 'Detailfuchs',
		description: '50 Unteraufgaben erledigt',
		icon: '🔍',
		rarity: 'uncommon',
		condition: (s) => s.subtasksDone >= 50
	},

	// --- Time-based ---
	{
		id: 'early_bird',
		name: 'Fruehaufsteher',
		description: 'Aufgabe vor 7 Uhr erledigt',
		icon: '🌅',
		rarity: 'uncommon',
		condition: (s) => s.currentHour < 7
	},
	{
		id: 'night_owl',
		name: 'Nachteule',
		description: 'Aufgabe nach 23 Uhr erledigt',
		icon: '🦉',
		rarity: 'uncommon',
		condition: (s) => s.currentHour >= 23
	},

	// --- Speed ---
	{
		id: 'speed_demon',
		name: 'Blitzfuchs',
		description: '5 Aufgaben in 5 Minuten',
		icon: '⚡',
		rarity: 'rare',
		condition: (s) => s.speedCount >= 5
	},

	// --- Social ---
	{
		id: 'share_first',
		name: 'Teamplayer',
		description: 'Erste Liste geteilt',
		icon: '🤝',
		rarity: 'common',
		condition: (s) => s.hasSharedList
	},

	// --- Completion ---
	{
		id: 'all_done',
		name: 'Alles erledigt',
		description: 'Alle Aufgaben einer Liste an einem Tag erledigt',
		icon: '✅',
		rarity: 'uncommon',
		condition: (s) => s.allDoneInList
	}
];

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

// ==========================================
// STORE
// ==========================================

export function createAchievementStore() {
	let sb: Sb;
	let userId = '';

	let unlocked = $state<UnlockedAchievement[]>([]);
	let initialized = $state(false);
	let newlyUnlocked = $state<AchievementDef[]>([]);

	const unlockedIds = $derived(new Set(unlocked.map((u) => u.achievement_id)));
	const unlockedCount = $derived(unlocked.length);
	const totalCount = $derived(ACHIEVEMENTS.length);

	async function init(supabase: Sb, uid: string) {
		sb = supabase;
		userId = uid;

		const { data } = await gCrud.getAchievements(sb, userId);
		unlocked = (data as UnlockedAchievement[]) ?? [];
		initialized = true;
	}

	/**
	 * Check all achievements against current stats.
	 * Returns array of newly unlocked achievements.
	 */
	async function checkAchievements(
		stats: AchievementStats
	): Promise<AchievementDef[]> {
		if (!initialized) return [];

		const newUnlocks: AchievementDef[] = [];

		for (const achievement of ACHIEVEMENTS) {
			if (unlockedIds.has(achievement.id)) continue;

			if (achievement.condition(stats)) {
				const { error } = await gCrud.unlockAchievement(
					sb,
					userId,
					achievement.id
				);
				if (!error) {
					unlocked = [
						...unlocked,
						{
							achievement_id: achievement.id,
							unlocked_at: new Date().toISOString(),
							notified: false
						}
					];
					newUnlocks.push(achievement);
				}
			}
		}

		if (newUnlocks.length > 0) {
			newlyUnlocked = newUnlocks;
		}

		return newUnlocks;
	}

	async function unlock(achievementId: string): Promise<boolean> {
		if (unlockedIds.has(achievementId)) return false;

		const { error } = await gCrud.unlockAchievement(
			sb,
			userId,
			achievementId
		);
		if (error) return false;

		unlocked = [
			...unlocked,
			{
				achievement_id: achievementId,
				unlocked_at: new Date().toISOString(),
				notified: false
			}
		];

		const def = ACHIEVEMENT_MAP.get(achievementId);
		if (def) newlyUnlocked = [def];

		return true;
	}

	function clearNewlyUnlocked() {
		newlyUnlocked = [];
	}

	function getDefinition(id: string): AchievementDef | undefined {
		return ACHIEVEMENT_MAP.get(id);
	}

	return {
		// State
		get unlocked() { return unlocked; },
		get initialized() { return initialized; },
		get newlyUnlocked() { return newlyUnlocked; },

		// Derived
		get unlockedIds() { return unlockedIds; },
		get unlockedCount() { return unlockedCount; },
		get totalCount() { return totalCount; },

		// Static
		definitions: ACHIEVEMENTS,

		// Methods
		init,
		checkAchievements,
		unlock,
		clearNewlyUnlocked,
		getDefinition
	};
}

export type AchievementStore = ReturnType<typeof createAchievementStore>;
