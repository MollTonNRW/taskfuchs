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

	return {
		get lastEvent() { return lastEvent; },
		get eventCounter() { return eventCounter; },
		emit,
		clear() { lastEvent = null; }
	};
}

export const v2Events = createEventBus();
export type V2EventBus = ReturnType<typeof createEventBus>;
