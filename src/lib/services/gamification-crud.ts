import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any>;

// ==========================================
// GAMIFICATION PROFILE
// ==========================================

export async function getOrCreateProfile(sb: Sb, userId: string) {
	const { data, error } = await sb
		.from('gamification_profiles')
		.select('*')
		.eq('user_id', userId)
		.single();

	if (error && error.code === 'PGRST116') {
		// Not found — create
		return sb
			.from('gamification_profiles')
			.insert({ user_id: userId })
			.select()
			.single();
	}
	return { data, error };
}

export async function updateProfile(
	sb: Sb,
	userId: string,
	changes: Record<string, unknown>
) {
	return sb
		.from('gamification_profiles')
		.update({ ...changes, updated_at: new Date().toISOString() })
		.eq('user_id', userId);
}

export async function addXP(sb: Sb, userId: string, amount: number) {
	const { data } = await sb
		.from('gamification_profiles')
		.select('xp')
		.eq('user_id', userId)
		.single();
	const newXP = (data?.xp ?? 0) + amount;
	return sb
		.from('gamification_profiles')
		.update({ xp: newXP, updated_at: new Date().toISOString() })
		.eq('user_id', userId);
}

export async function addCoins(sb: Sb, userId: string, amount: number) {
	const { data } = await sb
		.from('gamification_profiles')
		.select('coins')
		.eq('user_id', userId)
		.single();
	const newCoins = (data?.coins ?? 0) + amount;
	return sb
		.from('gamification_profiles')
		.update({ coins: newCoins, updated_at: new Date().toISOString() })
		.eq('user_id', userId);
}

// ==========================================
// ACHIEVEMENTS
// ==========================================

export async function getAchievements(sb: Sb, userId: string) {
	return sb
		.from('user_achievements')
		.select('*')
		.eq('user_id', userId)
		.order('unlocked_at', { ascending: false });
}

export async function unlockAchievement(
	sb: Sb,
	userId: string,
	achievementId: string
) {
	return sb
		.from('user_achievements')
		.upsert(
			{ user_id: userId, achievement_id: achievementId },
			{ onConflict: 'user_id,achievement_id' }
		)
		.select()
		.single();
}

// ==========================================
// DAILY QUESTS
// ==========================================

export async function getDailyQuests(sb: Sb, userId: string, date: string) {
	return sb
		.from('daily_quests')
		.select('*')
		.eq('user_id', userId)
		.eq('date', date);
}

export async function updateQuestProgress(
	sb: Sb,
	questId: string,
	progress: number
) {
	return sb.from('daily_quests').update({ progress }).eq('id', questId);
}

export async function completeQuest(sb: Sb, questId: string) {
	return sb
		.from('daily_quests')
		.update({ completed: true })
		.eq('id', questId);
}

// ==========================================
// COSMETICS
// ==========================================

export async function purchaseCosmetic(
	sb: Sb,
	userId: string,
	cosmeticId: string
) {
	return sb
		.from('user_cosmetics')
		.insert({ user_id: userId, cosmetic_id: cosmeticId })
		.select()
		.single();
}

export async function setActiveCosmetic(
	sb: Sb,
	userId: string,
	slot: string,
	cosmeticId: string
) {
	return sb
		.from('active_cosmetics')
		.upsert(
			{ user_id: userId, slot, cosmetic_id: cosmeticId },
			{ onConflict: 'user_id,slot' }
		)
		.select()
		.single();
}
