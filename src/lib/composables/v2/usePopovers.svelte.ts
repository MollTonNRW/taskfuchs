import type { Database } from '$lib/types/database';

type Task = Database['public']['Tables']['tasks']['Row'];

export type EmojiPickerState = { show: boolean; taskId: string; x: number; y: number };
export type DatePickerState = { show: boolean; taskId: string; x: number; y: number };
export type PriorityPickerState = { show: boolean; taskId: string; x: number; y: number; current: string };

export function createPopovers(
	store: {
		tasks: Task[];
		updateTaskEmoji: (taskId: string, emoji: string) => void;
		updateTaskDate: (taskId: string, date: string | null) => void;
		changeTaskPriority: (taskId: string, priority: 'low' | 'normal' | 'high' | 'asap') => void;
	}
) {
	let emojiPicker = $state<EmojiPickerState>({ show: false, taskId: '', x: 0, y: 0 });
	let datePicker = $state<DatePickerState>({ show: false, taskId: '', x: 0, y: 0 });
	let priorityPicker = $state<PriorityPickerState>({ show: false, taskId: '', x: 0, y: 0, current: 'normal' });

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

	function openPriorityPicker(taskId: string, x: number, y: number) {
		const task = store.tasks.find((t) => t.id === taskId);
		if (!task) return;
		priorityPicker = { show: true, taskId, x, y, current: task.priority };
	}

	function handlePrioritySelect(priority: 'low' | 'normal' | 'high' | 'asap') {
		store.changeTaskPriority(priorityPicker.taskId, priority);
	}

	function closeAll() {
		emojiPicker = { show: false, taskId: '', x: 0, y: 0 };
		datePicker = { show: false, taskId: '', x: 0, y: 0 };
		priorityPicker = { show: false, taskId: '', x: 0, y: 0, current: 'normal' };
	}

	return {
		get emojiPicker() { return emojiPicker; },
		set emojiPicker(v: EmojiPickerState) { emojiPicker = v; },
		get datePicker() { return datePicker; },
		set datePicker(v: DatePickerState) { datePicker = v; },
		get priorityPicker() { return priorityPicker; },
		set priorityPicker(v: PriorityPickerState) { priorityPicker = v; },
		openEmojiPicker,
		handleEmojiSelect,
		openDatePicker,
		handleDateSelect,
		openPriorityPicker,
		handlePrioritySelect,
		closeAll
	};
}
