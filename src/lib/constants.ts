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
	low: '#9ca3af',
	normal: '#3b82f6',
	high: '#f97316',
	asap: '#ef4444'
};

export const priorityBadgeBg: Record<string, string> = {
	low: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
	normal: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
	high: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
	asap: 'bg-red-500 text-white'
};

export const priorityWeight: Record<string, number> = {
	asap: 0,
	high: 1,
	normal: 2,
	low: 3
};

export const timeframeLabels: Record<string, string> = {
	akut: 'Akut',
	zeitnah: 'Zeitnah',
	mittelfristig: 'Mittelfristig',
	langfristig: 'Langfristig'
};

export const timeframeColors: Record<string, string> = {
	akut: '#dc2626',
	zeitnah: '#ea580c',
	mittelfristig: '#d97706',
	langfristig: '#16a34a'
};

export const timeframeClasses: Record<string, string> = {
	akut: 'badge-tf-akut',
	zeitnah: 'badge-tf-zeitnah',
	mittelfristig: 'badge-tf-mittelfristig',
	langfristig: 'badge-tf-langfristig'
};

export const progressLabels = ['Unerledigt', 'Angefangen', 'Fast fertig', 'Fertig'];
export const progressLabelsFull = ['Unerledigt (0%)', 'Angefangen (33%)', 'Fast fertig (66%)', 'Fertig (100%)'];
export const progressColors = ['#9ca3af', '#3b82f6', '#f59e0b', '#22c55e'];

export const priorityOrder: Priority[] = ['low', 'normal', 'high', 'asap'];

export const sortLabels: Record<string, string> = {
	position: 'Standard',
	priority: 'Priorität',
	name: 'Name',
	date: 'Fälligkeitsdatum',
	created: 'Erstelldatum'
};
