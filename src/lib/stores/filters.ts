import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// ==========================================
// SUBTASK VISIBILITY SETTING
// ==========================================
// Einzige Voreinstellung, die den Rueckbau ueberlebt hat: sind Unteraufgaben
// beim Oeffnen einer Liste auf- oder zugeklappt. Gelesen von tf/TaskList und
// tf/SmartList. Der Umschalter dazu ist mit der alten Kopfzeile entfallen und
// hatte seither keinen Aufrufer mehr.
const savedSubtaskDefault = browser ? localStorage.getItem('tf-subtasks-collapsed') === 'true' : false;
export const subtasksCollapsedByDefault = writable<boolean>(savedSubtaskDefault);

subtasksCollapsedByDefault.subscribe((val) => {
	if (browser) localStorage.setItem('tf-subtasks-collapsed', String(val));
});
