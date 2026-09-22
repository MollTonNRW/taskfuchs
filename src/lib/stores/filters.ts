import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// ==========================================
// SUBTASK VISIBILITY SETTING
// ==========================================
const savedSubtaskDefault = browser ? localStorage.getItem('tf-subtasks-collapsed') === 'true' : false;
export const subtasksCollapsedByDefault = writable<boolean>(savedSubtaskDefault);

subtasksCollapsedByDefault.subscribe((val) => {
	if (browser) localStorage.setItem('tf-subtasks-collapsed', String(val));
});

export function toggleSubtasksDefault() {
	subtasksCollapsedByDefault.update((v) => !v);
}
