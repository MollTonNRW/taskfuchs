import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
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
	if (updates.length === 0) return { error: null };
	if (updates.length === 1) {
		return sb.from('lists').update({ position: updates[0].position }).eq('id', updates[0].id);
	}
	// TODO: Nach Migration 007 auf sb.rpc('batch_reorder_lists', ...) umstellen
	const results = await Promise.all(
		updates.map(u => sb.from('lists').update({ position: u.position }).eq('id', u.id))
	);
	return { error: results.find(r => r.error)?.error ?? null };
}

// ==========================================
// TASK CRUD
// ==========================================

export async function insertTask(sb: Sb, data: { list_id: string; user_id: string; text: string; position: number; parent_id?: string }) {
	return sb.from('tasks').insert(data).select().single();
}

export async function updateTaskField(sb: Sb, id: string, fields: TaskUpdate) {
	return sb.from('tasks').update(fields).eq('id', id);
}

export async function deleteTaskDb(sb: Sb, id: string) {
	return sb.from('tasks').delete().eq('id', id);
}

export async function reinsertTask(sb: Sb, task: Task) {
	const { id, created_at, updated_at, version, ...rest } = task;
	return sb.from('tasks').insert({ id, ...rest }).select().single();
}

export async function reinsertTasks(sb: Sb, tasksList: Task[]) {
	if (tasksList.length === 0) return { error: null };
	const rows = tasksList.map(t => {
		const { created_at, updated_at, version, ...rest } = t;
		return rest;
	});
	return sb.from('tasks').insert(rows);
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

export async function bulkUpdateField(sb: Sb, ids: string[], fields: TaskUpdate) {
	return sb.from('tasks').update(fields).in('id', ids);
}

export async function bulkDeleteTasks(sb: Sb, ids: string[]) {
	return sb.from('tasks').delete().in('id', ids);
}


export async function bulkMoveToList(sb: Sb, ids: string[], targetListId: string, basePos: number) {
	const results = await Promise.all(
		ids.map((id, i) => sb.from('tasks').update({ list_id: targetListId, position: basePos + i }).eq('id', id))
	);
	const failed = results.find((r) => r.error);
	return { error: failed?.error ?? null };
}

// ==========================================
// REORDER
// ==========================================

export async function reorderTasksDb(sb: Sb, updates: { id: string; position: number; list_id?: string }[]) {
	if (updates.length === 0) return { error: null };
	if (updates.length === 1) {
		const u = updates[0];
		const updateData: Record<string, unknown> = { position: u.position };
		if (u.list_id) updateData.list_id = u.list_id;
		return sb.from('tasks').update(updateData).eq('id', u.id);
	}
	// TODO: Nach Migration 007 auf sb.rpc('batch_reorder_tasks', ...) umstellen
	const results = await Promise.all(
		updates.map(u => {
			const data: Record<string, unknown> = { position: u.position };
			if (u.list_id) data.list_id = u.list_id;
			return sb.from('tasks').update(data).eq('id', u.id);
		})
	);
	return { error: results.find(r => r.error)?.error ?? null };
}

export async function reorderSubtasksDb(sb: Sb, updates: { id: string; position: number; parent_id?: string }[]) {
	if (updates.length === 0) return { error: null };
	if (updates.length === 1) {
		const u = updates[0];
		const updateData: Record<string, unknown> = { position: u.position };
		if (u.parent_id) updateData.parent_id = u.parent_id;
		return sb.from('tasks').update(updateData).eq('id', u.id);
	}
	// TODO: Nach Migration 007 auf sb.rpc('batch_reorder_subtasks', ...) umstellen
	const results = await Promise.all(
		updates.map(u => {
			const data: Record<string, unknown> = { position: u.position };
			if (u.parent_id) data.parent_id = u.parent_id;
			return sb.from('tasks').update(data).eq('id', u.id);
		})
	);
	return { error: results.find(r => r.error)?.error ?? null };
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
		sb.from('lists').select('*').order('position'),
		sb.from('tasks').select('*').order('position')
	]);
	return {
		lists: (listsResult.data as List[]) ?? [],
		tasks: (tasksResult.data as Task[]) ?? []
	};
}
