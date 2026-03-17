import type { Database } from '$lib/types/database';

type Task = Database['public']['Tables']['tasks']['Row'];

export type NotePopoverState = { show: boolean; taskId: string; note: string; x: number; y: number };
export type FocusState = { show: boolean; taskId: string };
export type EmojiPickerState = { show: boolean; taskId: string; x: number; y: number };
export type DatePickerState = { show: boolean; taskId: string; x: number; y: number };

export function createPopovers(
	store: {
		tasks: Task[];
		updateTaskNote: (taskId: string, note: string) => void;
		updateTaskEmoji: (taskId: string, emoji: string) => void;
		updateTaskDate: (taskId: string, date: string | null) => void;
	}
) {
	let notePopover = $state<NotePopoverState>({ show: false, taskId: '', note: '', x: 0, y: 0 });
	let focusMode = $state<FocusState>({ show: false, taskId: '' });
	let emojiPicker = $state<EmojiPickerState>({ show: false, taskId: '', x: 0, y: 0 });
	let datePicker = $state<DatePickerState>({ show: false, taskId: '', x: 0, y: 0 });

	let focusTask = $derived(focusMode.show ? store.tasks.find((t) => t.id === focusMode.taskId) ?? null : null);

	function openNotePopover(taskId: string, x: number, y: number) {
		const task = store.tasks.find((t) => t.id === taskId);
		if (!task) return;
		notePopover = { show: true, taskId, note: task.note ?? '', x, y };
	}

	function handleNoteSave(text: string) {
		store.updateTaskNote(notePopover.taskId, text);
	}

	function openFocusMode(taskId: string) {
		focusMode = { show: true, taskId };
	}

	function openEmojiPicker(taskId: string, x: number, y: number) {
		emojiPicker = { show: true, taskId, x, y };
	}

	function handleEmojiSelect(emoji: string) {
		store.updateTaskEmoji(emojiPicker.taskId, emoji);
	}

	function openDatePicker(taskId: string, x: number, y: number) {
		datePicker = { show: true, taskId, x, y };
	}

	function handleDateSelect(date: string | null) {
		store.updateTaskDate(datePicker.taskId, date);
	}

	return {
		get notePopover() { return notePopover; },
		set notePopover(v: NotePopoverState) { notePopover = v; },
		get focusMode() { return focusMode; },
		set focusMode(v: FocusState) { focusMode = v; },
		get emojiPicker() { return emojiPicker; },
		set emojiPicker(v: EmojiPickerState) { emojiPicker = v; },
		get datePicker() { return datePicker; },
		set datePicker(v: DatePickerState) { datePicker = v; },
		get focusTask() { return focusTask; },
		openNotePopover,
		handleNoteSave,
		openFocusMode,
		openEmojiPicker,
		handleEmojiSelect,
		openDatePicker,
		handleDateSelect
	};
}
