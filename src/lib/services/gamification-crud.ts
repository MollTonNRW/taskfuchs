import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any>;

// ==========================================
// H5: Typisierte Update-Felder statt Record<string, unknown>
// ==========================================

export interface GamificationProfileUpdate {
	xp: number;
	coins: number;
	level: number;
	streak_days: number;
	streak_last_date: string | null;
	best_streak: number;
	total_tasks_done: number;
	weekly_tasks: unknown;
	freeze_tokens: number;
}

// ==========================================
// GAMIFICATION PROFILE
// ==========================================

export async function getOrCreateProfile(sb: Sb, userId: string) {
	const { data, error } = await sb.from('gamification_profiles').select('*').eq('user_id', userId).single();

	if (error && error.code === 'PGRST116') {
		// Not found — create
		return sb.from('gamification_profiles').insert({ user_id: userId }).select().single();
	}
	return { data, error };
}

export async function updateProfile(sb: Sb, userId: string, changes: Partial<GamificationProfileUpdate>) {
	return sb
		.from('gamification_profiles')
		.update({ ...changes, updated_at: new Date().toISOString() })
		.eq('user_id', userId);
}

// Migration 014: Server-seitige Reward-Berechnung.
// Client uebergibt nur noch die Task-/Quest-ID, alle Werte kommen vom Server.
export async function completeTaskReward(sb: Sb, taskId: string) {
	return sb.rpc('complete_task_reward', { p_task_id: taskId });
}

export async function completeQuestReward(sb: Sb, questId: string) {
	return sb.rpc('complete_quest_reward', { p_quest_id: questId });
}

// ==========================================
// ACHIEVEMENTS
// ==========================================

export async function getAchievements(sb: Sb, userId: string) {
	return sb.from('user_achievements').select('*').eq('user_id', userId).order('unlocked_at', { ascending: false });
}

export async function unlockAchievement(sb: Sb, userId: string, achievementId: string) {
	return sb
		.from('user_achievements')
		.upsert({ user_id: userId, achievement_id: achievementId }, { onConflict: 'user_id,achievement_id' })
		.select()
		.single();
}

// ==========================================
// DAILY QUESTS
// ==========================================

export async function getDailyQuests(sb: Sb, userId: string, date: string) {
	return sb.from('daily_quests').select('*').eq('user_id', userId).eq('date', date);
}

// Migration 015: Quest-Mutations serverseitig. Client hat nur noch SELECT-Recht
// auf daily_quests. Generierung + Progress-Inkrement laufen ueber SECURITY DEFINER RPCs.
export async function generateDailyQuests(sb: Sb) {
	return sb.rpc('generate_daily_quests');
}

export async function incrementQuestProgress(sb: Sb, questType: string, amount: number = 1) {
	return sb.rpc('increment_quest_progress', {
		p_quest_type: questType,
		p_amount: amount
	});
}

// ==========================================
// LEADERBOARD
// ==========================================

export async function getLeaderboardProfiles(sb: Sb) {
	return sb
		.from('gamification_profiles')
		.select('user_id, xp, coins, level, streak_days')
		.order('xp', { ascending: false })
		.limit(20);
}

export async function getProfileDisplayNames(sb: Sb, userIds: string[]) {
	if (userIds.length === 0) return { data: [], error: null };
	return sb.from('profiles').select('id, display_name, username').in('id', userIds);
}

// ==========================================
// COSMETICS
// ==========================================

export async function purchaseCosmetic(sb: Sb, userId: string, cosmeticId: string) {
	return sb.from('user_cosmetics').insert({ user_id: userId, cosmetic_id: cosmeticId }).select().single();
}

export async function setActiveCosmetic(sb: Sb, userId: string, slot: string, cosmeticId: string) {
	return sb
		.from('active_cosmetics')
		.upsert({ user_id: userId, slot, cosmetic_id: cosmeticId }, { onConflict: 'user_id,slot' })
		.select()
		.single();
}
