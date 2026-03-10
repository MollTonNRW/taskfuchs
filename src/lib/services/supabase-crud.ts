import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { Priority, Timeframe } from '$lib/constants';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type ListShare = Database['public']['Tables']['list_shares']['Row'];
type Sb = SupabaseClient<Database>;

// ==========================================
// LIST CRUD
// ==========================================

export async function createList(sb: Sb, userId: string, position: number) {
	return sb.from('lists').insert({ user_id: userId, title: 'Neue Liste', position }).select().single();
}

export async function renameList(sb: Sb, id: string, title: string) {
	return sb.from('lists').update({ title }).eq('id', id);
}

export async function deleteList(sb: Sb, id: string) {
	return sb.from('lists').delete().eq('id', id);
}

export async function changeListIcon(sb: Sb, id: string, icon: string) {
	return sb.from('lists').update({ icon }).eq('id', id);
}

export async function reorderListDb(sb: Sb, updates: { id: string; position: number }[]) {
	for (const u of updates) {
		const { error } = await sb.from('lists').update({ position: u.position }).eq('id', u.id);
		if (error) return { error };
	}
	return { error: null };
}

// ==========================================
// TASK CRUD
// ==========================================

export async function insertTask(sb: Sb, data: { list_id: string; user_id: string; text: string; position: number; parent_id?: string }) {
	return sb.from('tasks').insert(data).select().single();
}

export async function updateTaskField(sb: Sb, id: string, fields: Record<string, unknown>) {
	return sb.from('tasks').update(fields).eq('id', id);
}

export async function deleteTaskDb(sb: Sb, id: string) {
	return sb.from('tasks').delete().eq('id', id);
}

export async function deleteTaskWithSubtasks(sb: Sb, id: string, subtaskIds: string[]) {
	if (subtaskIds.length > 0) {
		const { error: subErr } = await sb.from('tasks').delete().in('id', subtaskIds);
		if (subErr) return { error: subErr };
	}
	return sb.from('tasks').delete().eq('id', id);
}

// ==========================================
// BULK OPERATIONS (Batch mit .in())
// ==========================================

export async function bulkUpdateField(sb: Sb, ids: string[], fields: Record<string, unknown>) {
	return sb.from('tasks').update(fields).in('id', ids);
}

export async function bulkDeleteTasks(sb: Sb, ids: string[]) {
	return sb.from('tasks').delete().in('id', ids);
}

export async function bulkMoveToList(sb: Sb, ids: string[], targetListId: string, basePos: number) {
	// Move requires individual updates since each task gets a different position
	for (let i = 0; i < ids.length; i++) {
		const { error } = await sb.from('tasks').update({ list_id: targetListId, position: basePos + i }).eq('id', ids[i]);
		if (error) return { error };
	}
	return { error: null };
}

// ==========================================
// REORDER
// ==========================================

export async function reorderTasksDb(sb: Sb, updates: { id: string; position: number; list_id?: string }[]) {
	for (const u of updates) {
		const updateData: Record<string, unknown> = { position: u.position };
		if (u.list_id) updateData.list_id = u.list_id;
		const { error } = await sb.from('tasks').update(updateData).eq('id', u.id);
		if (error) return { error };
	}
	return { error: null };
}

// ==========================================
// DIVIDER
// ==========================================

export async function insertDivider(sb: Sb, listId: string, userId: string, label: string, position: number) {
	return sb.from('tasks').insert({
		list_id: listId,
		user_id: userId,
		text: label,
		type: 'divider',
		divider_label: label,
		position
	}).select().single();
}

// ==========================================
// SHARING
// ==========================================

export async function getListShares(sb: Sb, listId: string) {
	return sb.from('list_shares').select('*').eq('list_id', listId);
}

export async function createListShare(sb: Sb, listId: string, userId: string, role: 'editor' | 'viewer') {
	return sb.from('list_shares').insert({ list_id: listId, user_id: userId, role }).select().single();
}

export async function deleteListShare(sb: Sb, shareId: string) {
	return sb.from('list_shares').delete().eq('id', shareId);
}

export async function updateShareRole(sb: Sb, shareId: string, role: 'editor' | 'viewer') {
	return sb.from('list_shares').update({ role }).eq('id', shareId);
}

// ==========================================
// DATA LOADING
// ==========================================

export async function loadUserData(sb: Sb, userId: string) {
	const [listsResult, tasksResult] = await Promise.all([
		sb.from('lists').select('*').eq('user_id', userId).order('position'),
		sb.from('tasks').select('*').eq('user_id', userId).order('position')
	]);
	return {
		lists: (listsResult.data as List[]) ?? [],
		tasks: (tasksResult.data as Task[]) ?? []
	};
}
