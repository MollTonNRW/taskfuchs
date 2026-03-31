import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { Priority } from '$lib/constants';
import * as crud from '$lib/services/supabase-crud';
import { toasts, confirmAction } from '$lib/stores/toast';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type Sb = SupabaseClient<Database>;

export function createTaskStore() {
	let tasks = $state<Task[]>([]);
	let lists = $state<List[]>([]);
	let sb: Sb;
	let userId: string;
	let pendingTaskIds = new Set<string>();
	let pendingListIds = new Set<string>();
	/** Fingerprint für Duplikat-Erkennung: text|list_id|parent_id (verhindert Duplikate wenn Realtime vor HTTP-Response kommt) */
	let pendingFingerprints = new Set<string>();
	function taskFingerprint(t: { text: string; list_id: string; parent_id?: string | null }): string {
		return `${t.text}|${t.list_id}|${t.parent_id ?? ''}`;
	}

	function init(supabase: Sb, uid: string, initialLists: List[], initialTasks: Task[]) {
		sb = supabase;
		userId = uid;
		lists = initialLists;
		tasks = initialTasks;
	}

	function setLists(newLists: List[]) { lists = newLists; }
	function setTasks(newTasks: Task[]) { tasks = newTasks; }

	/** Alle Nachkommen eines Tasks rekursiv sammeln (Unteraufgaben + Unter-Unteraufgaben) */
	function getDescendantIds(parentId: string): Set<string> {
		const ids = new Set<string>();
		const children = tasks.filter((t) => t.parent_id === parentId);
		for (const child of children) {
			ids.add(child.id);
			for (const grandId of getDescendantIds(child.id)) {
				ids.add(grandId);
			}
		}
		return ids;
	}

	// ==========================================
	// LIST CRUD
	// ==========================================
	async function createList() {
		const position = lists.length;
		pendingListIds.add('creating');
		const { data: newList, error } = await crud.createList(sb, userId, position);
		pendingListIds.delete('creating');
		if (error) {
			console.error('Liste erstellen fehlgeschlagen:', error);
			toasts.error('Fehler beim Erstellen der Liste.');
			return -1;
		}
		if (newList && !lists.some((l) => l.id === newList.id)) {
			lists = [...lists, newList as List];
		}
		return newList ? lists.findIndex((l) => l.id === newList.id) : lists.length - 1;
	}

	async function renameList(id: string, title: string) {
		const oldLists = lists;
		lists = lists.map((l) => (l.id === id ? { ...l, title } : l));
		const { error } = await crud.renameList(sb, id, title);
		if (error) lists = oldLists;
	}

	async function deleteList(id: string): Promise<boolean> {
		if (!await confirmAction('Liste wirklich löschen? Alle Aufgaben werden gelöscht.')) return false;
		const oldLists = lists;
		const oldTasks = tasks;
		lists = lists.filter((l) => l.id !== id);
		tasks = tasks.filter((t) => t.list_id !== id);
		const { error } = await crud.deleteList(sb, id);
		if (error) { lists = oldLists; tasks = oldTasks; return false; }
		return true;
	}

	async function changeListIcon(id: string, icon: string) {
		const oldLists = lists;
		lists = lists.map((l) => (l.id === id ? { ...l, icon } : l));
		const { error } = await crud.changeListIcon(sb, id, icon);
		if (error) lists = oldLists;
	}

	async function reorderList(listId: string, newPosition: number) {
		const oldLists = [...lists];
		const listToMove = lists.find((l) => l.id === listId);
		if (!listToMove) return;
		const reordered = lists.filter((l) => l.id !== listId);
		reordered.splice(newPosition, 0, listToMove);
		const updates: { id: string; position: number }[] = [];
		lists = reordered.map((l, i) => {
			if (l.position !== i) updates.push({ id: l.id, position: i });
			return { ...l, position: i };
		});
		const { error } = await crud.reorderListDb(sb, updates);
		if (error) lists = oldLists;
	}

	// ==========================================
	// TASK CRUD
	// ==========================================
	async function addTask(listId: string, text: string) {
		const listTasks = tasks.filter((t) => t.list_id === listId && !t.parent_id);
		const position = listTasks.length;
		const optimisticTask: Task = {
			id: crypto.randomUUID(), list_id: listId, user_id: userId, parent_id: null,
			text, type: 'task', divider_label: null, done: false, priority: 'normal',
			timeframe: null, highlighted: false, pinned: false, emoji: null, note: null,
			due_date: null, progress: 0, assigned_to: null, position,
			created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1
		};
		tasks = [...tasks, optimisticTask];
		pendingTaskIds.add(optimisticTask.id);
		const fp = taskFingerprint(optimisticTask);
		pendingFingerprints.add(fp);
		const { data: newTask, error } = await crud.insertTask(sb, { list_id: listId, user_id: userId, text, position });
		pendingTaskIds.delete(optimisticTask.id);
		pendingFingerprints.delete(fp);
		if (error) { tasks = tasks.filter((t) => t.id !== optimisticTask.id); return; }
		if (newTask) {
			const serverId = (newTask as Task).id;
			tasks = tasks.filter((t) => t.id === optimisticTask.id || t.id !== serverId);
			tasks = tasks.map((t) => (t.id === optimisticTask.id ? (newTask as Task) : t));
		}
	}

	async function addTaskAfter(afterTaskId: string, text: string) {
		const afterTask = tasks.find((t) => t.id === afterTaskId);
		if (!afterTask) return;
		const listId = afterTask.list_id;
		const newPosition = afterTask.position + 1;
		// Nachfolgende Tasks um 1 nach hinten verschieben
		const toShift = tasks
			.filter((t) => t.list_id === listId && !t.parent_id && t.position >= newPosition)
			.map((t) => ({ id: t.id, position: t.position + 1 }));
		const optimisticTask: Task = {
			id: crypto.randomUUID(), list_id: listId, user_id: userId, parent_id: null,
			text, type: 'task', divider_label: null, done: false, priority: 'normal',
			timeframe: null, highlighted: false, pinned: false, emoji: null, note: null,
			due_date: null, progress: 0, assigned_to: null, position: newPosition,
			created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1
		};
		tasks = tasks.map((t) => {
			const shift = toShift.find((s) => s.id === t.id);
			return shift ? { ...t, position: shift.position } : t;
		});
		tasks = [...tasks, optimisticTask];
		pendingTaskIds.add(optimisticTask.id);
		const fp = taskFingerprint(optimisticTask);
		pendingFingerprints.add(fp);
		if (toShift.length > 0) {
			await crud.reorderTasksDb(sb, toShift);
		}
		const { data: newTask, error } = await crud.insertTask(sb, { list_id: listId, user_id: userId, text, position: newPosition });
		pendingTaskIds.delete(optimisticTask.id);
		pendingFingerprints.delete(fp);
		if (error) { tasks = tasks.filter((t) => t.id !== optimisticTask.id); return; }
		if (newTask) {
			const serverId = (newTask as Task).id;
			tasks = tasks.filter((t) => t.id === optimisticTask.id || t.id !== serverId);
			tasks = tasks.map((t) => (t.id === optimisticTask.id ? (newTask as Task) : t));
		}
	}

	async function toggleTask(id: string, done: boolean) {
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, done } : t));
		if (done) {
			const subtaskIds = tasks.filter((t) => t.parent_id === id).map((t) => t.id);
			if (subtaskIds.length > 0) {
				tasks = tasks.map((t) => (subtaskIds.includes(t.id) ? { ...t, done: true } : t));
				const { error: subError } = await crud.bulkUpdateField(sb, subtaskIds, { done: true });
				if (subError) { tasks = oldTasks; return; }
			}
		}
		const { error } = await crud.updateTaskField(sb, id, { done });
		if (error) { tasks = oldTasks; return; }
		if (done) {
			toasts.undo('Aufgabe erledigt', () => {
				toggleTask(id, false);
			});
		}
	}

	async function updateTask(id: string, text: string) {
		const oldTasks = tasks;
		const task = tasks.find((t) => t.id === id);
		const isDivider = task?.type === 'divider';
		const fields = isDivider ? { text, divider_label: text } : { text };
		tasks = tasks.map((t) => (t.id === id ? { ...t, ...fields } : t));
		const { error } = await crud.updateTaskField(sb, id, fields);
		if (error) tasks = oldTasks;
	}

	async function deleteTask(id: string) {
		if (!await confirmAction('Aufgabe wirklich löschen?')) return;
		const deletedTask = tasks.find((t) => t.id === id);
		const deletedSubtasks = tasks.filter((t) => t.parent_id === id);
		const subtaskIds = deletedSubtasks.map((t) => t.id);
		tasks = tasks.filter((t) => t.id !== id && t.parent_id !== id);
		const { error } = await crud.deleteTaskWithSubtasks(sb, id, subtaskIds);
		if (error) {
			if (deletedTask) tasks = [...tasks, deletedTask, ...deletedSubtasks];
			return;
		}
		if (deletedTask) {
			toasts.undo('Aufgabe gelöscht', async () => {
				pendingTaskIds.add(deletedTask.id);
				for (const sub of deletedSubtasks) pendingTaskIds.add(sub.id);
				const { error: reErr } = await crud.reinsertTask(sb, deletedTask);
				if (reErr) {
					pendingTaskIds.delete(deletedTask.id);
					for (const sub of deletedSubtasks) pendingTaskIds.delete(sub.id);
					toasts.error('Wiederherstellen fehlgeschlagen.');
					return;
				}
				if (deletedSubtasks.length > 0) await crud.reinsertTasks(sb, deletedSubtasks);
				tasks = [...tasks, deletedTask, ...deletedSubtasks];
				setTimeout(() => {
					pendingTaskIds.delete(deletedTask.id);
					for (const sub of deletedSubtasks) pendingTaskIds.delete(sub.id);
				}, 3000);
			});
		}
	}

	async function changeTaskPriority(id: string, priority: Priority) {
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, priority } : t));
		const { error } = await crud.updateTaskField(sb, id, { priority });
		if (error) tasks = oldTasks;
	}

	async function changeTaskTimeframe(id: string, timeframe: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null) {
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, timeframe } : t));
		const { error } = await crud.updateTaskField(sb, id, { timeframe });
		if (error) tasks = oldTasks;
	}

	async function changeTaskProgress(id: string, progress: number) {
		const oldTasks = tasks;
		const autoDone = progress === 3;
		tasks = tasks.map((t) => {
			if (t.id !== id) return t;
			const updated = { ...t, progress };
			if (autoDone) updated.done = true;
			return updated;
		});
		if (autoDone) {
			tasks = tasks.map((t) => (t.parent_id === id ? { ...t, done: true } : t));
		}
		const update: { progress: number; done?: boolean } = { progress };
		if (autoDone) update.done = true;
		const { error } = await crud.updateTaskField(sb, id, update);
		if (error) { tasks = oldTasks; return; }
		if (autoDone) {
			const { error: subErr } = await sb.from('tasks').update({ done: true }).eq('parent_id', id);
			if (subErr) tasks = oldTasks;
		}
	}

	async function toggleHighlight(id: string) {
		const task = tasks.find((t) => t.id === id);
		if (!task) return;
		const highlighted = !task.highlighted;
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, highlighted } : t));
		const { error } = await crud.updateTaskField(sb, id, { highlighted });
		if (error) tasks = oldTasks;
	}

	async function togglePin(id: string) {
		const task = tasks.find((t) => t.id === id);
		if (!task) return;
		const pinned = !task.pinned;
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, pinned } : t));
		const { error } = await crud.updateTaskField(sb, id, { pinned });
		if (error) tasks = oldTasks;
	}

	async function clearPinboard() {
		const pinnedIds = tasks.filter((t) => t.pinned).map((t) => t.id);
		if (pinnedIds.length === 0) return;
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.pinned ? { ...t, pinned: false } : t));
		const { error } = await crud.bulkUpdateField(sb, pinnedIds, { pinned: false });
		if (error) tasks = oldTasks;
	}

	async function updateTaskNote(id: string, note: string) {
		const noteValue = note.trim() || null;
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, note: noteValue } : t));
		const { error } = await crud.updateTaskField(sb, id, { note: noteValue });
		if (error) tasks = oldTasks;
	}

	async function assignTask(id: string, assignedTo: string | null) {
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, assigned_to: assignedTo } : t));
		const { error } = await crud.updateTaskField(sb, id, { assigned_to: assignedTo });
		if (error) tasks = oldTasks;
	}

	async function moveTaskToList(taskId: string, targetListId: string) {
		const oldTasks = tasks;
		const targetListTasks = tasks.filter((t) => t.list_id === targetListId && !t.parent_id);
		const position = targetListTasks.length;
		// Alle Nachkommen sammeln (rekursiv)
		const descendantIds = getDescendantIds(taskId);
		// Optimistisch: Haupt-Task + alle Nachkommen verschieben
		tasks = tasks.map((t) => {
			if (t.id === taskId) return { ...t, list_id: targetListId, position };
			if (descendantIds.has(t.id)) return { ...t, list_id: targetListId };
			return t;
		});
		// DB: Haupt-Task verschieben
		const { error } = await crud.updateTaskField(sb, taskId, { list_id: targetListId, position });
		if (error) { tasks = oldTasks; return; }
		// DB: Nachkommen verschieben
		if (descendantIds.size > 0) {
			const { error: subErr } = await crud.bulkUpdateField(sb, [...descendantIds], { list_id: targetListId });
			if (subErr) tasks = oldTasks;
		}
	}

	async function updateTaskEmoji(taskId: string, emoji: string) {
		const emojiVal = emoji || null;
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === taskId ? { ...t, emoji: emojiVal } : t));
		const { error } = await crud.updateTaskField(sb, taskId, { emoji: emojiVal });
		if (error) tasks = oldTasks;
	}

	async function updateTaskDate(taskId: string, dueDate: string | null) {
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === taskId ? { ...t, due_date: dueDate } : t));
		const { error } = await crud.updateTaskField(sb, taskId, { due_date: dueDate });
		if (error) tasks = oldTasks;
	}

	// ==========================================
	// SUBTASK CRUD
	// ==========================================
	async function addSubtask(parentId: string, text: string) {
		const parentTask = tasks.find((t) => t.id === parentId);
		if (!parentTask) return;
		const siblings = tasks.filter((t) => t.parent_id === parentId);
		const position = siblings.length;
		const optimisticSub: Task = {
			id: crypto.randomUUID(), list_id: parentTask.list_id, user_id: userId, parent_id: parentId,
			text, type: 'task', divider_label: null, done: false, priority: 'normal',
			timeframe: null, highlighted: false, pinned: false, emoji: null, note: null,
			due_date: null, progress: 0, assigned_to: null, position,
			created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1
		};
		tasks = [...tasks, optimisticSub];
		pendingTaskIds.add(optimisticSub.id);
		const fp = taskFingerprint(optimisticSub);
		pendingFingerprints.add(fp);
		const { data: newSub, error } = await crud.insertTask(sb, {
			list_id: parentTask.list_id, user_id: userId, parent_id: parentId, text, position
		});
		pendingTaskIds.delete(optimisticSub.id);
		pendingFingerprints.delete(fp);
		if (newSub && !error) {
			const serverId = (newSub as Task).id;
			tasks = tasks.filter((t) => t.id === optimisticSub.id || t.id !== serverId);
			tasks = tasks.map((t) => (t.id === optimisticSub.id ? (newSub as Task) : t));
		} else if (error) {
			tasks = tasks.filter((t) => t.id !== optimisticSub.id);
		}
	}

	async function toggleSubtask(id: string, done: boolean) {
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, done } : t));
		const { error } = await crud.updateTaskField(sb, id, { done });
		if (error) { tasks = oldTasks; return; }
	}

	async function updateSubtask(id: string, text: string) {
		const oldTasks = tasks;
		tasks = tasks.map((t) => (t.id === id ? { ...t, text } : t));
		const { error } = await crud.updateTaskField(sb, id, { text });
		if (error) tasks = oldTasks;
	}

	async function deleteSubtask(id: string) {
		const oldTasks = tasks;
		tasks = tasks.filter((t) => t.id !== id);
		const { error } = await crud.deleteTaskDb(sb, id);
		if (error) tasks = oldTasks;
	}

	// ==========================================
	// BULK OPERATIONS
	// ==========================================
	async function bulkToggleDone(ids: string[], done: boolean) {
		const oldTasks = tasks;
		const idSet = new Set(ids);
		tasks = tasks.map((t) => (idSet.has(t.id) ? { ...t, done } : t));
		const { error } = await crud.bulkUpdateField(sb, ids, { done });
		if (error) tasks = oldTasks;
	}

	async function bulkChangePriority(ids: string[], priority: Priority) {
		const oldTasks = tasks;
		const idSet = new Set(ids);
		tasks = tasks.map((t) => (idSet.has(t.id) ? { ...t, priority } : t));
		const { error } = await crud.bulkUpdateField(sb, ids, { priority });
		if (error) tasks = oldTasks;
	}

	async function bulkDelete(ids: string[]) {
		if (!await confirmAction(`${ids.length} Aufgaben wirklich löschen?`)) return;
		const oldTasks = tasks;
		const idSet = new Set(ids);
		tasks = tasks.filter((t) => !idSet.has(t.id) && !idSet.has(t.parent_id ?? ''));
		const { error } = await crud.bulkDeleteTasks(sb, ids);
		if (error) tasks = oldTasks;
	}

	async function bulkMoveToList(ids: string[], targetListId: string) {
		const oldTasks = tasks;
		const basePos = tasks.filter((t) => t.list_id === targetListId && !t.parent_id).length;
		// Alle Nachkommen der ausgewaehlten Tasks sammeln
		const allDescendantIds = new Set<string>();
		for (const id of ids) {
			for (const dId of getDescendantIds(id)) {
				allDescendantIds.add(dId);
			}
		}
		const idsSet = new Set(ids);
		tasks = tasks.map((t) => {
			if (idsSet.has(t.id)) return { ...t, list_id: targetListId, position: basePos + ids.indexOf(t.id) };
			if (allDescendantIds.has(t.id)) return { ...t, list_id: targetListId };
			return t;
		});
		// Haupt-Tasks verschieben
		const { error } = await crud.bulkMoveToList(sb, ids, targetListId, basePos);
		if (error) { tasks = oldTasks; return; }
		// Nachkommen verschieben
		if (allDescendantIds.size > 0) {
			const { error: descError } = await crud.bulkUpdateField(sb, [...allDescendantIds], { list_id: targetListId });
			if (descError) tasks = oldTasks;
		}
	}

	// ==========================================
	// REORDER
	// ==========================================
	async function reorderTask(taskId: string, targetListId: string, newPosition: number) {
		const task = tasks.find((t) => t.id === taskId);
		if (!task) return;
		const oldTasks = [...tasks];
		const sourceListId = task.list_id;
		const isMoving = sourceListId !== targetListId;

		// Visuelle Sortierung (gleich wie activeTasks in ListPanel): highlighted zuerst, dann position
		const visualSort = (a: Task, b: Task) => {
			if (a.highlighted && !b.highlighted) return -1;
			if (!a.highlighted && b.highlighted) return 1;
			return a.position - b.position;
		};

		// 1. Off-by-one Fix: Bei Same-List-Moves den visuellen Ursprungsindex ermitteln
		let adjustedPos = newPosition;
		if (!isMoving) {
			const allVisual = tasks
				.filter((t) => t.list_id === targetListId && !t.parent_id)
				.filter((t) => t.type === 'divider' || !t.done)
				.sort(visualSort);
			const origIdx = allVisual.findIndex((t) => t.id === taskId);
			// UI-dropIdx basiert auf Liste MIT dem gedraggten Element.
			// targetItems hat es schon entfernt → Indizes ab origIdx verschieben sich.
			if (origIdx !== -1 && origIdx < newPosition) {
				adjustedPos = newPosition - 1;
			}
		}

		// 2. ALLE Top-Level-Items in der Zielliste, OHNE den gezogenen Task, visuell sortiert
		const targetItems = tasks
			.filter((t) => t.list_id === targetListId && !t.parent_id && t.id !== taskId)
			.filter((t) => t.type === 'divider' || !t.done)
			.sort(visualSort);

		// 3. Task an neuer (korrigierter) Position einfügen
		const clampedPos = Math.max(0, Math.min(adjustedPos, targetItems.length));
		targetItems.splice(clampedPos, 0, { ...task, list_id: targetListId } as Task);

		// 3. Neue Positionen zuweisen — ALLE Items (Tasks + Divider) sequentiell 0, 1, 2, ...
		const updates: { id: string; position: number; list_id?: string }[] = [];
		targetItems.forEach((t, i) => {
			const needsListUpdate = t.id === taskId && isMoving;
			if (t.position !== i || needsListUpdate) {
				updates.push({ id: t.id, position: i, ...(needsListUpdate ? { list_id: targetListId } : {}) });
			}
		});

		// 4. Bei Listwechsel: Quell-Liste komplett neu nummerieren (inkl. Divider)
		if (isMoving) {
			const sourceItems = tasks
				.filter((t) => t.list_id === sourceListId && !t.parent_id && t.id !== taskId)
				.filter((t) => t.type === 'divider' || !t.done)
				.sort((a, b) => a.position - b.position);
			sourceItems.forEach((t, i) => {
				if (t.position !== i) {
					updates.push({ id: t.id, position: i });
				}
			});
		}

		// 5. Bei Listwechsel: Nachkommen mitnehmen
		const descendantIds = isMoving ? getDescendantIds(taskId) : new Set<string>();
		if (isMoving && descendantIds.size > 0) {
			for (const dId of descendantIds) {
				updates.push({ id: dId, position: 0, list_id: targetListId });
			}
		}

		// 6. Optimistisch lokalen State aktualisieren
		const posMap = new Map(updates.map((u) => [u.id, u]));
		tasks = tasks.map((t) => {
			const u = posMap.get(t.id);
			if (!u) return t;
			const updated = { ...t, position: u.position };
			if (u.list_id) updated.list_id = u.list_id;
			return updated;
		});

		// 7. DB-Updates persistieren
		if (updates.length > 0) {
			const { error } = await crud.reorderTasksDb(sb, updates);
			if (error) tasks = oldTasks;
		}
	}

	async function reorderSubtask(subtaskId: string, targetParentId: string, newPosition: number) {
		const subtask = tasks.find((t) => t.id === subtaskId);
		if (!subtask || !subtask.parent_id) return;
		const oldTasks = [...tasks];
		const sourceParentId = subtask.parent_id;
		const isMoving = sourceParentId !== targetParentId;

		// Get siblings in target parent (excluding dragged subtask), sorted by position
		const targetSiblings = tasks
			.filter((t) => t.parent_id === targetParentId && t.id !== subtaskId)
			.sort((a, b) => a.position - b.position);

		// Off-by-one fix for same-parent moves
		let adjustedPos = newPosition;
		if (!isMoving) {
			const allSiblings = tasks
				.filter((t) => t.parent_id === targetParentId)
				.sort((a, b) => a.position - b.position);
			const origIdx = allSiblings.findIndex((t) => t.id === subtaskId);
			if (origIdx !== -1 && origIdx < newPosition) {
				adjustedPos = newPosition - 1;
			}
		}

		const clampedPos = Math.max(0, Math.min(adjustedPos, targetSiblings.length));
		targetSiblings.splice(clampedPos, 0, { ...subtask, parent_id: targetParentId });

		// Build updates
		const updates: { id: string; position: number; parent_id?: string }[] = [];
		targetSiblings.forEach((t, i) => {
			const needsParentUpdate = t.id === subtaskId && isMoving;
			if (t.position !== i || needsParentUpdate) {
				updates.push({ id: t.id, position: i, ...(needsParentUpdate ? { parent_id: targetParentId } : {}) });
			}
		});

		// Renumber source parent siblings if cross-parent move
		if (isMoving) {
			const sourceSiblings = tasks
				.filter((t) => t.parent_id === sourceParentId && t.id !== subtaskId)
				.sort((a, b) => a.position - b.position);
			sourceSiblings.forEach((t, i) => {
				if (t.position !== i) {
					updates.push({ id: t.id, position: i });
				}
			});
		}

		// Optimistic update
		const posMap = new Map(updates.map((u) => [u.id, u]));
		tasks = tasks.map((t) => {
			const u = posMap.get(t.id);
			if (!u) return t;
			const updated = { ...t, position: u.position };
			if (u.parent_id) updated.parent_id = u.parent_id;
			return updated;
		});

		// Persist
		if (updates.length > 0) {
			const { error } = await crud.reorderSubtasksDb(sb, updates);
			if (error) tasks = oldTasks;
		}
	}

	// ==========================================
	// TASK-LEVEL OPERATIONS
	// ==========================================
	async function deleteAllSubtasksOfTask(taskId: string) {
		const subtaskIds = tasks.filter(t => t.parent_id === taskId).map(t => t.id);
		if (subtaskIds.length === 0) return;
		const oldTasks = tasks;
		tasks = tasks.filter(t => t.parent_id !== taskId);
		const { error } = await crud.bulkDeleteTasks(sb, subtaskIds);
		if (error) tasks = oldTasks;
	}

	// ==========================================
	// LIST-LEVEL OPERATIONS
	// ==========================================
	async function deleteAllSubtasksInList(listId: string) {
		const subtaskIds = tasks.filter(t => t.list_id === listId && t.parent_id !== null).map(t => t.id);
		if (subtaskIds.length === 0) return;
		const oldTasks = tasks;
		tasks = tasks.filter(t => !(t.list_id === listId && t.parent_id !== null));
		const { error } = await crud.bulkDeleteTasks(sb, subtaskIds);
		if (error) tasks = oldTasks;
	}

	async function deleteDoneInList(listId: string) {
		const doneIds = tasks.filter(t => t.list_id === listId && t.done).map(t => t.id);
		if (doneIds.length === 0) return;
		const oldTasks = tasks;
		tasks = tasks.filter(t => !(t.list_id === listId && t.done));
		const { error } = await crud.bulkDeleteTasks(sb, doneIds);
		if (error) tasks = oldTasks;
	}

	async function checkAllInList(listId: string) {
		const uncheckedIds = tasks.filter(t => t.list_id === listId && !t.done && t.type !== 'divider').map(t => t.id);
		if (uncheckedIds.length === 0) return;
		const oldTasks = tasks;
		tasks = tasks.map(t => (t.list_id === listId && !t.done && t.type !== 'divider') ? { ...t, done: true } : t);
		const { error } = await crud.bulkUpdateField(sb, uncheckedIds, { done: true });
		if (error) tasks = oldTasks;
	}

	async function duplicateList(listId: string): Promise<number> {
		const sourceList = lists.find(l => l.id === listId);
		if (!sourceList) return -1;
		const position = lists.length;

		// Quelldaten VOR Mutation sammeln
		const sourceTasks = tasks.filter(t => t.list_id === listId && !t.parent_id).sort((a, b) => a.position - b.position);
		const sourceSubtasks = tasks.filter(t => t.list_id === listId && t.parent_id !== null).sort((a, b) => a.position - b.position);

		// Neue Liste erstellen
		const { data: newList, error: listErr } = await sb.from('lists').insert({
			user_id: userId, title: sourceList.title + ' (Kopie)', icon: sourceList.icon, position
		}).select().single();
		if (listErr || !newList) return -1;
		lists = [...lists, newList as List];

		// Top-Level Tasks kopieren
		const idMap = new Map<string, string>();
		for (const task of sourceTasks) {
			const { data: newTask } = await crud.insertTask(sb, {
				list_id: newList.id, user_id: userId, text: task.text, position: task.position
			});
			if (newTask) {
				idMap.set(task.id, newTask.id);
				tasks = [...tasks, newTask as Task];
			}
		}

		// Subtasks kopieren
		for (const sub of sourceSubtasks) {
			const newParentId = idMap.get(sub.parent_id!);
			if (!newParentId) continue;
			const { data: newSub } = await crud.insertTask(sb, {
				list_id: newList.id, user_id: userId, text: sub.text, position: sub.position, parent_id: newParentId
			});
			if (newSub) {
				tasks = [...tasks, newSub as Task];
			}
		}

		return lists.findIndex(l => l.id === newList.id);
	}

	async function convertTaskToList(taskId: string): Promise<number> {
		const task = tasks.find(t => t.id === taskId);
		if (!task) return -1;
		const subtasks = tasks.filter(t => t.parent_id === taskId).sort((a, b) => a.position - b.position);

		// Neue Liste erstellen
		const position = lists.length;
		const { data: newList, error: listErr } = await sb.from('lists').insert({
			user_id: userId, title: task.text, icon: task.emoji || '📝', position
		}).select().single();
		if (listErr || !newList) {
			toasts.error('Fehler beim Erstellen der Liste.');
			return -1;
		}
		lists = [...lists, newList as List];

		// Subtasks als Top-Level-Tasks in die neue Liste einfuegen
		for (let i = 0; i < subtasks.length; i++) {
			const sub = subtasks[i];
			const { data: newTask } = await crud.insertTask(sb, {
				list_id: newList.id, user_id: userId, text: sub.text, position: i
			});
			if (newTask) {
				tasks = [...tasks, newTask as Task];
			}
		}

		// Original-Task + Subtasks loeschen
		const subtaskIds = subtasks.map(s => s.id);
		const oldTasks = tasks;
		tasks = tasks.filter(t => t.id !== taskId && t.parent_id !== taskId);
		const { error: delErr } = await crud.deleteTaskWithSubtasks(sb, taskId, subtaskIds);
		if (delErr) {
			tasks = oldTasks;
			toasts.error('Fehler beim Löschen der Original-Aufgabe.');
		}

		toasts.success(`„${task.text}" in Liste umgewandelt.`);
		return lists.findIndex(l => l.id === newList.id);
	}

	// ==========================================
	// DIVIDER
	// ==========================================
	async function createDivider(listId: string, position: number, label: string) {
		const { data: newDiv } = await crud.insertDivider(sb, listId, userId, label, position);
		if (newDiv) tasks = [...tasks, newDiv as Task];
	}

	// ==========================================
	// REALTIME HANDLERS
	// ==========================================
	function handleRealtimeList(eventType: string, payload: any) {
		if (eventType === 'INSERT') {
			const newList = payload as List;
			if (!lists.some((l) => l.id === newList.id) && !pendingListIds.has(newList.id)) {
				lists = [...lists, newList];
			}
		} else if (eventType === 'UPDATE') {
			const updated = payload as List;
			lists = lists.map((l) => (l.id === updated.id ? updated : l));
		} else if (eventType === 'DELETE') {
			const old = payload as { id: string };
			lists = lists.filter((l) => l.id !== old.id);
		}
	}

	function handleRealtimeTask(eventType: string, payload: any) {
		if (eventType === 'INSERT') {
			const newTask = payload as Task;
			// Exakte ID-Match (Server-ID bereits bekannt)
			if (pendingTaskIds.has(newTask.id)) {
				pendingTaskIds.delete(newTask.id);
				tasks = tasks.map((t) => (t.id === newTask.id ? newTask : t));
				return;
			}
			// Duplikat-Check: ID bereits im State
			if (tasks.some((t) => t.id === newTask.id)) return;
			// Fingerprint-Check: Realtime-Event kam vor HTTP-Response → optimistische Task existiert bereits
			const fp = taskFingerprint(newTask);
			if (pendingFingerprints.has(fp)) {
				const optimistic = tasks.find((t) => pendingTaskIds.has(t.id) && taskFingerprint(t) === fp);
				if (optimistic) {
					pendingTaskIds.delete(optimistic.id);
					pendingFingerprints.delete(fp);
					tasks = tasks.map((t) => (t.id === optimistic.id ? newTask : t));
					return;
				}
			}
			tasks = [...tasks, newTask];
		} else if (eventType === 'UPDATE') {
			const updated = payload as Task;
			tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
		} else if (eventType === 'DELETE') {
			const old = payload as { id: string };
			tasks = tasks.filter((t) => t.id !== old.id);
		}
	}

	// Delete task without confirmation (for context menu inline delete)
	async function deleteTaskDirect(id: string) {
		const deletedTask = tasks.find((t) => t.id === id);
		const deletedSubtasks = tasks.filter((t) => t.parent_id === id);
		const subtaskIds = deletedSubtasks.map((t) => t.id);
		tasks = tasks.filter((t) => t.id !== id && t.parent_id !== id);
		const { error } = await crud.deleteTaskWithSubtasks(sb, id, subtaskIds);
		if (error) {
			if (deletedTask) tasks = [...tasks, deletedTask, ...deletedSubtasks];
			return;
		}
		if (deletedTask) {
			toasts.undo('Aufgabe gelöscht', async () => {
				// Pending-IDs setzen BEVOR der Insert an Supabase geht,
				// damit das Realtime-INSERT-Event dedupliziert wird
				pendingTaskIds.add(deletedTask.id);
				for (const sub of deletedSubtasks) pendingTaskIds.add(sub.id);
				const { error: reErr } = await crud.reinsertTask(sb, deletedTask);
				if (reErr) {
					pendingTaskIds.delete(deletedTask.id);
					for (const sub of deletedSubtasks) pendingTaskIds.delete(sub.id);
					toasts.error('Wiederherstellen fehlgeschlagen.');
					return;
				}
				if (deletedSubtasks.length > 0) await crud.reinsertTasks(sb, deletedSubtasks);
				tasks = [...tasks, deletedTask, ...deletedSubtasks];
				// Pending-IDs nach kurzer Verzögerung aufräumen (Realtime-Event kann verzögert kommen)
				setTimeout(() => {
					pendingTaskIds.delete(deletedTask.id);
					for (const sub of deletedSubtasks) pendingTaskIds.delete(sub.id);
				}, 3000);
			});
		}
	}

	return {
		get tasks() { return tasks; },
		get lists() { return lists; },
		get sb() { return sb; },
		get userId() { return userId; },
		init, setLists, setTasks,
		// List operations
		createList, renameList, deleteList, changeListIcon, reorderList,
		// Task operations
		addTask, addTaskAfter, toggleTask, updateTask, deleteTask, deleteTaskDirect,
		changeTaskPriority, changeTaskTimeframe, changeTaskProgress,
		toggleHighlight, togglePin, clearPinboard,
		updateTaskNote, assignTask, moveTaskToList,
		updateTaskEmoji, updateTaskDate,
		// Subtask operations
		addSubtask, toggleSubtask, updateSubtask, deleteSubtask, deleteAllSubtasksOfTask,
		// List-level operations
		deleteAllSubtasksInList, deleteDoneInList, checkAllInList, duplicateList, convertTaskToList,
		// Bulk operations
		bulkToggleDone, bulkChangePriority, bulkDelete, bulkMoveToList,
		// Reorder
		reorderTask, reorderSubtask,
		// Divider
		createDivider,
		// Realtime
		handleRealtimeList, handleRealtimeTask
	};
}
