import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// ==========================================
// SUBTASK VISIBILITY SETTING
// ==========================================
// Einzige Voreinstellung, die den Rueckbau ueberlebt hat: sind Unteraufgaben
// beim Oeffnen einer Liste auf- oder zugeklappt. Gelesen von tf/TaskList und
// tf/SmartList. Der Umschalter dazu ist mit der alten Kopfzeile entfallen und
// hatte seither keinen Aufrufer mehr.
// Voreinstellung: EINGEKLAPPT. Jede Zeile traegt ihren Zaehler („2/4"), und
// erst ein Tippen darauf klappt ihre Unteraufgaben aus. Ausgeklappt als
// Grundzustand fiel in der Abnahme auf: eine Liste mit vier Aufgaben, die
// Unteraufgaben haben, schob den Erledigt-Balken aus dem Bild, und Punkt 5 der
// Checkliste (eine ausgeklappte UND eine eingeklappte Aufgabe in einer Ansicht)
// war gar nicht herstellbar. Das Mockup zeigt in jedem Frame hoechstens eine
// ausgeklappte Aufgabe.
const gespeichert = browser ? localStorage.getItem('tf-subtasks-collapsed') : null;
export const subtasksCollapsedByDefault = writable<boolean>(gespeichert === null ? true : gespeichert === 'true');

subtasksCollapsedByDefault.subscribe((val) => {
	if (browser) localStorage.setItem('tf-subtasks-collapsed', String(val));
});
