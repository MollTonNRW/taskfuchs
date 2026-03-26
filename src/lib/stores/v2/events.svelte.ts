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

	// Shared header state (Page -> Layout communication)
	let viewMode = $state<'list' | 'kanban'>('list');
	let sortLabel = $state('Position');
	let bulkModeActive = $state(false);

	return {
		get lastEvent() { return lastEvent; },
		get eventCounter() { return eventCounter; },
		get navCounts() { return navCounts; },
		get openTaskCount() { return openTaskCount; },
		get viewMode() { return viewMode; },
		set viewMode(v: 'list' | 'kanban') { viewMode = v; },
		get sortLabel() { return sortLabel; },
		set sortLabel(v: string) { sortLabel = v; },
		get bulkModeActive() { return bulkModeActive; },
		set bulkModeActive(v: boolean) { bulkModeActive = v; },
		setNavCounts(counts: Record<string, { done: number; total: number }>) { navCounts = counts; },
		setOpenTaskCount(count: number) { openTaskCount = count; },
		emit,
		clear() { lastEvent = null; }
	};
}

export const v2Events = createEventBus();
export type V2EventBus = ReturnType<typeof createEventBus>;
