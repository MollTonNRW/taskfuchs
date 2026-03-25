// Simple event emitter for cross-component communication (Layout <-> Page)
// Uses Svelte 5 $state runes for reactivity

export interface TaskEvent {
	type: 'task_done' | 'subtask_done' | 'task_undone';
	taskId: string;
	parentId: string | null;
	timestamp: number;
}

function createEventBus() {
	let lastEvent = $state<TaskEvent | null>(null);
	let eventCounter = $state(0);

	function emit(type: TaskEvent['type'], taskId: string, parentId: string | null = null) {
		lastEvent = {
			type,
			taskId,
			parentId,
			timestamp: Date.now()
		};
		eventCounter += 1;
	}

	// Nav counts: listId -> { done, total }
	let navCounts = $state<Record<string, { done: number; total: number }>>({});
	// Open task count (all lists)
	let openTaskCount = $state(0);

	return {
		get lastEvent() { return lastEvent; },
		get eventCounter() { return eventCounter; },
		get navCounts() { return navCounts; },
		get openTaskCount() { return openTaskCount; },
		setNavCounts(counts: Record<string, { done: number; total: number }>) { navCounts = counts; },
		setOpenTaskCount(count: number) { openTaskCount = count; },
		emit,
		clear() { lastEvent = null; }
	};
}

export const v2Events = createEventBus();
export type V2EventBus = ReturnType<typeof createEventBus>;
