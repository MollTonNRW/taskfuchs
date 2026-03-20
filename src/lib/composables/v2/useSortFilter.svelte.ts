import { browser } from '$app/environment';
import type { Database } from '$lib/types/database';
import { priorityWeight } from '$lib/constants';

type Task = Database['public']['Tables']['tasks']['Row'];

export type SortMode = 'position' | 'priority' | 'name' | 'date' | 'created' | 'progress';
export const validSortModes: SortMode[] = ['position', 'priority', 'name', 'date', 'created', 'progress'];

export const sortLabels: Record<SortMode, string> = {
	position: 'Frei',
	priority: 'Prioritaet',
	name: 'Name',
	date: 'Faelligkeitsdatum',
	created: 'Erstelldatum',
	progress: 'Fortschritt'
};

function loadSortMode(): SortMode {
	if (!browser) return 'position';
	const saved = localStorage.getItem('v2-sort-mode');
	return saved && validSortModes.includes(saved as SortMode) ? (saved as SortMode) : 'position';
}

export function createSortFilter(
	store: { tasks: Task[]; reorderTask: (taskId: string, targetListId: string, newPosition: number) => void },
	toasts: { show: (message: string, type: 'info' | 'error' | 'success', duration?: number) => void }
) {
	let sortMode = $state<SortMode>(loadSortMode());
	let sortMenuOpen = $state(false);

	$effect(() => {
		if (browser) localStorage.setItem('v2-sort-mode', sortMode);
	});

	function handleReorderTask(taskId: string, targetListId: string, newPosition: number) {
		if (sortMode !== 'position') {
			sortMode = 'position';
			toasts.show('Sortierung auf \u201eFrei\u201c gewechselt', 'info', 2000);
		}
		store.reorderTask(taskId, targetListId, newPosition);
	}

	function sortTasks(taskList: Task[], _listId?: string): Task[] {
		if (sortMode === 'position') {
			return [...taskList].sort((a, b) => {
				if (a.highlighted && !b.highlighted) return -1;
				if (!a.highlighted && b.highlighted) return 1;
				return a.position - b.position;
			});
		}
		return [...taskList].sort((a, b) => {
			if (a.type === 'divider' || b.type === 'divider') return a.position - b.position;
			switch (sortMode) {
				case 'priority': return (priorityWeight[a.priority] ?? 2) - (priorityWeight[b.priority] ?? 2);
				case 'name': return a.text.localeCompare(b.text, 'de');
				case 'date': {
					if (!a.due_date && !b.due_date) return 0;
					if (!a.due_date) return 1;
					if (!b.due_date) return -1;
					return a.due_date.localeCompare(b.due_date);
				}
				case 'created': return a.created_at.localeCompare(b.created_at);
				case 'progress': return (b.progress ?? 0) - (a.progress ?? 0);
				default: return 0;
			}
		});
	}

	function tasksForList(listId: string): Task[] {
		const listTasks = store.tasks.filter((t) => t.list_id === listId);
		return sortTasks(listTasks, listId);
	}

	return {
		get sortMode() { return sortMode; },
		set sortMode(v: SortMode) { sortMode = v; },
		get sortMenuOpen() { return sortMenuOpen; },
		set sortMenuOpen(v: boolean) { sortMenuOpen = v; },
		handleReorderTask,
		sortTasks,
		tasksForList
	};
}
