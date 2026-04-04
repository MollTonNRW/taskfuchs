import { writable, get } from 'svelte/store';

export type ToastType = 'error' | 'success' | 'info' | 'undo';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	onUndo?: () => void;
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
	undo(message: string, onUndo: () => void, duration = 8000) {
		const id = `toast-${++counter}`;
		update((all) => [...all, { id, message, type: 'undo' as ToastType, onUndo }]);
		const timeout = setTimeout(() => {
			update((all) => all.filter((t) => t.id !== id));
		}, duration);
		return { id, cancel: () => clearTimeout(timeout) };
	},
	dismiss(id: string) {
		update((all) => all.filter((t) => t.id !== id));
	}
};

// ==========================================
// CONFIRM DIALOG (ersetzt window.confirm)
// ==========================================
export interface ConfirmState {
	show: boolean;
	message: string;
	resolve: ((value: boolean) => void) | null;
}

export const confirmStore = writable<ConfirmState>({ show: false, message: '', resolve: null });

/**
 * Zeigt einen nicht-blockierenden Bestaetigungsdialog.
 * Gibt ein Promise<boolean> zurueck (true = bestaetigt, false = abgebrochen).
 */
export function confirmAction(message: string): Promise<boolean> {
	// Falls bereits ein Dialog offen ist, vorherigen ablehnen
	const current = get(confirmStore);
	if (current.resolve) current.resolve(false);

	return new Promise<boolean>((resolve) => {
		confirmStore.set({ show: true, message, resolve });
	});
}

export function resolveConfirm(value: boolean) {
	const current = get(confirmStore);
	if (current.resolve) current.resolve(value);
	confirmStore.set({ show: false, message: '', resolve: null });
}

// ==========================================
// INPUT DIALOG (ersetzt window.prompt)
// ==========================================
export interface InputDialogState {
	show: boolean;
	title: string;
	message: string;
	defaultValue: string;
	placeholder: string;
	resolve: ((value: string | null) => void) | null;
}

export const inputDialogStore = writable<InputDialogState>({
	show: false, title: '', message: '', defaultValue: '', placeholder: '', resolve: null
});

/**
 * Zeigt einen nicht-blockierenden Input-Dialog.
 * Gibt ein Promise<string | null> zurueck (string = Eingabe, null = abgebrochen).
 */
export function showInputDialog(
	title: string,
	message: string,
	defaultValue = '',
	placeholder = ''
): Promise<string | null> {
	const current = get(inputDialogStore);
	if (current.resolve) current.resolve(null);

	return new Promise<string | null>((resolve) => {
		inputDialogStore.set({ show: true, title, message, defaultValue, placeholder, resolve });
	});
}

export function resolveInput(value: string | null) {
	const current = get(inputDialogStore);
	if (current.resolve) current.resolve(value);
	inputDialogStore.set({ show: false, title: '', message: '', defaultValue: '', placeholder: '', resolve: null });
}
