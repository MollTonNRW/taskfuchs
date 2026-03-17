// Shared constants for TaskFuchs
// Used in +page.svelte, TaskItem.svelte, Pinboard.svelte, context menus

export type Priority = 'low' | 'normal' | 'high' | 'asap';
export type Timeframe = 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig';

export const priorityLabels: Record<string, string> = {
	low: 'Niedrig',
	normal: 'Normal',
	high: 'Hoch',
	asap: 'ASAP!'
};

export const priorityColors: Record<string, string> = {
	low: '#22c55e',
	normal: '#eab308',
	high: '#ef4444',
	asap: '#dc2626'
};

export const priorityBadgeBg: Record<string, string> = {
	low: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
	normal: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
	high: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
	asap: 'bg-red-500 text-white'
};

export const priorityWeight: Record<string, number> = {
	asap: 0,
	high: 1,
	normal: 2,
	low: 3
};

export const progressLabels = ['Unerledigt', 'Angefangen', 'Fast fertig', 'Fertig'];
export const progressLabelsFull = ['Unerledigt (0%)', 'Angefangen (33%)', 'Fast fertig (66%)', 'Fertig (100%)'];
export const progressColors = ['#9ca3af', '#3b82f6', '#f59e0b', '#22c55e'];

export const priorityOrder: Priority[] = ['low', 'normal', 'high', 'asap'];

export const sortLabels: Record<string, string> = {
	position: 'Frei',
	priority: 'Priorität',
	name: 'Name',
	date: 'Fälligkeitsdatum',
	created: 'Erstelldatum',
	progress: 'Fortschritt'
};
