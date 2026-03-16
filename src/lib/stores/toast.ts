import { writable } from 'svelte/store';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
}

const { subscribe, update } = writable<Toast[]>([]);

let counter = 0;

export const toasts = {
	subscribe,
	show(message: string, type: ToastType = 'info', duration = 4000) {
		const id = `toast-${++counter}`;
		update((all) => [...all, { id, message, type }]);
		setTimeout(() => {
			update((all) => all.filter((t) => t.id !== id));
		}, duration);
	},
	error(message: string) {
		this.show(message, 'error', 5000);
	},
	success(message: string) {
		this.show(message, 'success', 3000);
	},
	dismiss(id: string) {
		update((all) => all.filter((t) => t.id !== id));
	}
};

/**
 * Ersetzt window.confirm() mit einem Promise-basierten Ansatz.
 * Für den Moment nutzen wir weiterhin confirm(), aber über diese
 * Funktion zentralisiert, damit es später leicht ersetzt werden kann.
 */
export function confirmAction(message: string): boolean {
	return confirm(message);
}
