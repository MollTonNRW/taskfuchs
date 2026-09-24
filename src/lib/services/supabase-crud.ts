import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type HistoryInsert = Database['public']['Tables']['task_history']['Insert'];
type HistoryUpdate = Database['public']['Tables']['task_history']['Update'];
type Sb = SupabaseClient<Database>;

// ==========================================
// LIST CRUD
// ==========================================

export async function createList(
	sb: Sb,
	userId: string,
	position: number,
	title: string,
	icon: string
) {
	return sb.from('lists').insert({ user_id: userId, title, position, icon }).select().single();
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

/**
 * Zeile fuer das Wiedereinfuegen nach „Rueckgaengig" — nur die Spalten, die
 * der Client kennt.
 *
 * Vorher ging die ganze geladene Zeile zurueck (`...rest`). Eine Zeile aus
 * einem aelteren Ladestand traegt aber Spalten, die es inzwischen nicht mehr
 * gibt (die mit Migration 023 entfernte Fortschrittsspalte) — PostgREST
 * lehnt das Einfuegen dann ab und das Rueckgaengig schlaegt fehl.
 * `created_at`, `updated_at` und `version` setzt die Datenbank neu.
 */
function zeileZumWiedereinfuegen(t: Task): TaskInsert {
	return {
		id: t.id,
		list_id: t.list_id,
		user_id: t.user_id,
		parent_id: t.parent_id,
		text: t.text,
		type: t.type,
		divider_label: t.divider_label,
		done: t.done,
		priority: t.priority,
		timeframe: t.timeframe,
		highlighted: t.highlighted,
		pinned: t.pinned,
		pinned_by: t.pinned_by,
		emoji: t.emoji,
		note: t.note,
		due_date: t.due_date,
		position: t.position,
		assigned_to: t.assigned_to,
		calendar_event_id: t.calendar_event_id
	};
}

export async function reinsertTask(sb: Sb, task: Task) {
	return sb.from('tasks').insert(zeileZumWiedereinfuegen(task)).select().single();
}

export async function reinsertTasks(sb: Sb, tasksList: Task[]) {
	if (tasksList.length === 0) return { error: null };
	return sb.from('tasks').insert(tasksList.map(zeileZumWiedereinfuegen));
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
// PROFILES
// ==========================================

// Laedt Profile (Name/Avatar) fuer eine Menge User-IDs -- z.B. die pinned_by-User
// fuer das "gepinnt von"-Badge. profiles-RLS erlaubt SELECT auf alle Profile.
export async function getProfilesByIds(sb: Sb, userIds: string[]) {
	if (userIds.length === 0) return { data: [], error: null };
	return sb.from('profiles').select('*').in('id', userIds);
}

// ==========================================
// AUFGABENHISTORIE (task_history, Migration 022)
// ==========================================
// Autor, Zeiten und „Ist da" stempelt der Trigger in der Datenbank — der
// Client schickt nur, was er meint: Art und Text beim Anlegen, den Text beim
// Bearbeiten, einen gesetzten bzw. leeren `resolved_at` fuer „Ist da" und
// dessen Ruecknahme. Sortiert wird im Store, nicht in der Abfrage.

/** Alle offenen Warte-Eintraege aller sichtbaren Aufgaben — EINE Abfrage beim App-Start. */
export async function loadOpenWaits(sb: Sb) {
	return sb.from('task_history').select('*').eq('kind', 'wartet').is('resolved_at', null);
}

/** Der vollstaendige Verlauf einer oder mehrerer Aufgaben. */
export async function loadHistory(sb: Sb, taskIds: string[]) {
	if (taskIds.length === 1) return sb.from('task_history').select('*').eq('task_id', taskIds[0]);
	return sb.from('task_history').select('*').in('task_id', taskIds);
}

export async function insertHistory(sb: Sb, row: HistoryInsert) {
	return sb.from('task_history').insert(row).select().single();
}

export async function updateHistory(sb: Sb, id: string, fields: HistoryUpdate) {
	return sb.from('task_history').update(fields).eq('id', id).select().single();
}

/**
 * Mit `.select('id')`: lehnt RLS das Loeschen ab (Rolle inzwischen „nur
 * lesen"), loescht PostgREST null Zeilen OHNE Fehler. Erst die leere
 * Antwort verraet das.
 */
export async function deleteHistory(sb: Sb, id: string) {
	return sb.from('task_history').delete().eq('id', id).select('id');
}

/** Steht der Eintrag noch? Leere Antwort: weg (oder nicht mehr sichtbar). */
export async function historyExists(sb: Sb, id: string) {
	return sb.from('task_history').select('id').eq('id', id);
}

/**
 * Verlauf wieder eingefuegter Aufgaben zurueckholen — nach dem Rueckgaengig
 * eines Loeschens. Die Kaskade hat ihn in den Papierkorb gelegt; die RPC
 * setzt ihn mit Autor, Zeiten und „Ist da" zurueck und liefert die Zeilen.
 */
export async function restoreHistory(sb: Sb, taskIds: string[]) {
	return sb.rpc('restore_task_history', { p_task_ids: taskIds });
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
