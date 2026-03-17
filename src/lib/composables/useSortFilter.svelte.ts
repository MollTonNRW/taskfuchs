import type { Database } from '$lib/types/database';
import { priorityWeight, sortLabels, type Priority } from '$lib/constants';
import { priorityFilters, viewFilters } from '$lib/stores/filters';
import { get } from 'svelte/store';

type Task = Database['public']['Tables']['tasks']['Row'];

export type SortMode = 'position' | 'priority' | 'name' | 'date' | 'created' | 'progress';
export const validSortModes: SortMode[] = ['position', 'priority', 'name', 'date', 'created', 'progress'];

function loadSortMode(): SortMode {
	if (typeof localStorage === 'undefined') return 'position';
	const saved = localStorage.getItem('taskfuchs-sort-mode');
	return saved && validSortModes.includes(saved as SortMode) ? (saved as SortMode) : 'position';
}

export function createSortFilter(
	store: { tasks: Task[]; reorderTask: (taskId: string, targetListId: string, newPosition: number) => void },
	toasts: { show: (message: string, type: 'info' | 'error' | 'success', duration?: number) => void }
) {
	let sortMode = $state<SortMode>(loadSortMode());
	let sortMenuOpen = $state(false);

	$effect(() => {
		if (typeof localStorage !== 'undefined') localStorage.setItem('taskfuchs-sort-mode', sortMode);
	});

	function handleReorderTask(taskId: string, targetListId: string, newPosition: number) {
		if (sortMode !== 'position') {
			sortMode = 'position';
			toasts.show('Sortierung auf \u201eFrei\u201c gewechselt', 'info', 2000);
		}
		store.reorderTask(taskId, targetListId, newPosition);
	}

	function sortTasks(taskList: Task[]): Task[] {
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

	function filteredTasksForList(listId: string): Task[] {
		const pf = get(priorityFilters);
		const vf = get(viewFilters);
		const listTasks = store.tasks.filter((t) => t.list_id === listId);
		const filtered = listTasks.filter((t) => {
			if (t.type === 'divider') return true;
			if (!pf[t.priority]) return false;
			if (vf.highlighted && !t.highlighted) return false;
			if (vf.withDate && !t.due_date) return false;
			return true;
		});
		return sortTasks(filtered);
	}

	return {
		get sortMode() { return sortMode; },
		set sortMode(v: SortMode) { sortMode = v; },
		get sortMenuOpen() { return sortMenuOpen; },
		set sortMenuOpen(v: boolean) { sortMenuOpen = v; },
		handleReorderTask,
		sortTasks,
		filteredTasksForList
	};
}

export { sortLabels };
