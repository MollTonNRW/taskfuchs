import { writable, get } from 'svelte/store';

export type ToastType = 'error' | 'success' | 'info' | 'undo';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	onUndo?: () => void;
	/** Beschriftung des Aktionsknopfes; ohne Angabe „Rueckgaengig". */
	aktionLabel?: string;
}

const { subscribe, update } = writable<Toast[]>([]);

let counter = 0;
/** Laufende Ausblend-Uhren je Toast — ohne sie liefen abgeloeste weiter. */
const uhren = new Map<string, ReturnType<typeof setTimeout>>();

function entfernen(id: string) {
	const uhr = uhren.get(id);
	if (uhr) {
		clearTimeout(uhr);
		uhren.delete(id);
	}
	update((all) => all.filter((t) => t.id !== id));
}

function anzeigen(toast: Toast, duration: number) {
	update((all) => [...all, toast]);
	uhren.set(
		toast.id,
		setTimeout(() => entfernen(toast.id), duration)
	);
}

export const toasts = {
	subscribe,
	show(message: string, type: ToastType = 'info', duration = 4000) {
		anzeigen({ id: `toast-${++counter}`, message, type }, duration);
	},
	error(message: string) {
		this.show(message, 'error', 5000);
	},
	success(message: string) {
		this.show(message, 'success', 3000);
	},
	/**
	 * Undo-Toast — EIN Toast je Aktion, nicht pro Haekchen.
	 *
	 * Ein neuer Undo-Toast loest den vorherigen ab (Spezifikation
	 * Abschnitt 6: „Ein Toast pro Aktion"). Vorher stapelten sich beim
	 * Abhaken mehrerer Aufgaben bis zu acht Sekunden lang mehrere
	 * uebereinander — und welcher davon welches Rueckgaengig trug, war der
	 * Reihenfolge nach zu raten.
	 */
	undo(message: string, onUndo: () => void, duration = 8000) {
		update((all) => {
			for (const offen of all) {
				if (offen.type !== 'undo') continue;
				const uhr = uhren.get(offen.id);
				if (uhr) {
					clearTimeout(uhr);
					uhren.delete(offen.id);
				}
			}
			return all.filter((t) => t.type !== 'undo');
		});
		const id = `toast-${++counter}`;
		anzeigen({ id, message, type: 'undo', onUndo }, duration);
		return { id, cancel: () => entfernen(id) };
	},
	/** Hinweis mit EINER Aktion unter eigenem Label (z. B. „Aendern"). */
	aktion(message: string, label: string, onAktion: () => void, duration = 6000) {
		const id = `toast-${++counter}`;
		anzeigen({ id, message, type: 'info', onUndo: onAktion, aktionLabel: label }, duration);
		return { id, cancel: () => entfernen(id) };
	},
	dismiss(id: string) {
		entfernen(id);
	}
};

// ==========================================
// BESTAETIGUNGSDIALOG
// ==========================================
// Nur dort, wo es kein Rueckgaengig gibt — praktisch nur „Liste loeschen".
// Eine einzelne Aufgabe und „Erledigte loeschen" bekommen einen Undo-Toast
// (A-klar-spec.md, Abschnitt 6). Darum traegt der Zustand jetzt Titel, Text,
// die Beschriftung des bestaetigenden Knopfes und dessen Gefaehrlichkeit —
// die alte Fassung hatte nur eine Meldung und einen Knopf „Bestaetigen".
export interface ConfirmState {
	show: boolean;
	titel: string;
	text: string;
	knopf: string;
	destruktiv: boolean;
	resolve: ((value: boolean) => void) | null;
}

const LEER: ConfirmState = {
	show: false,
	titel: '',
	text: '',
	knopf: '',
	destruktiv: false,
	resolve: null
};

export const confirmStore = writable<ConfirmState>({ ...LEER });

/**
 * Zeigt den Bestaetigungsdialog und wartet auf die Antwort.
 * true = bestaetigt, false = abgebrochen.
 */
export function bestaetigen(opt: {
	titel: string;
	text?: string;
	knopf?: string;
	destruktiv?: boolean;
}): Promise<boolean> {
	// Falls bereits ein Dialog offen ist, den vorherigen ablehnen.
	const current = get(confirmStore);
	if (current.resolve) current.resolve(false);

	return new Promise<boolean>((resolve) => {
		confirmStore.set({
			show: true,
			titel: opt.titel,
			text: opt.text ?? '',
			knopf: opt.knopf ?? 'Bestaetigen',
			destruktiv: opt.destruktiv ?? false,
			resolve
		});
	});
}

export function resolveConfirm(value: boolean) {
	const current = get(confirmStore);
	if (current.resolve) current.resolve(value);
	confirmStore.set({ ...LEER });
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
	show: false,
	title: '',
	message: '',
	defaultValue: '',
	placeholder: '',
	resolve: null
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
