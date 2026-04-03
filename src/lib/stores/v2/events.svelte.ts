// Simple event emitter for cross-component communication (Layout <-> Page)
// Uses Svelte 5 $state runes for reactivity
// SSR-safe: state is only relevant client-side (UI interactions)

import { browser } from '$app/environment';

export interface TaskEvent {
	type: 'task_done' | 'subtask_done' | 'task_undone';
	taskId: string;
	parentId: string | null;
	timestamp: number;
}

function createEventBus() {
	// Guard: $state runes are only initialized in the browser to prevent
	// SSR state leaks (module-level singletons are shared between requests)
	let lastEvent = $state<TaskEvent | null>(null);
	let eventCounter = $state(0);

	function emit(type: TaskEvent['type'], taskId: string, parentId: string | null = null) {
		if (!browser) return;
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
	let viewMode = $state<'list' | 'kanban' | 'scroll'>('list');
	let sortLabel = $state('Position');
	let bulkModeActive = $state(false);

	// Layout -> Page action signals (increment = trigger)
	let searchToggle = $state(0);
	let sortToggle = $state(0);
	let bulkToggle = $state(0);
	let viewSignal = $state<{ counter: number; mode: string }>({ counter: 0, mode: 'list' });
	let addListSignal = $state(0);

	return {
		get lastEvent() { return lastEvent; },
		get eventCounter() { return eventCounter; },
		get navCounts() { return navCounts; },
		get openTaskCount() { return openTaskCount; },
		get viewMode() { return viewMode; },
		set viewMode(v: 'list' | 'kanban' | 'scroll') { viewMode = v; },
		get sortLabel() { return sortLabel; },
		set sortLabel(v: string) { sortLabel = v; },
		get bulkModeActive() { return bulkModeActive; },
		set bulkModeActive(v: boolean) { bulkModeActive = v; },
		setNavCounts(counts: Record<string, { done: number; total: number }>) {
			if (!browser) return;
			navCounts = counts;
		},
		setOpenTaskCount(count: number) {
			if (!browser) return;
			openTaskCount = count;
		},
		emit,
		clear() { lastEvent = null; },
		// Layout -> Page action signals
		get searchToggle() { return searchToggle; },
		get sortToggle() { return sortToggle; },
		get bulkToggle() { return bulkToggle; },
		get viewSignal() { return viewSignal; },
		get addListSignal() { return addListSignal; },
		toggleSearch() { if (!browser) return; searchToggle++; },
		toggleSort() { if (!browser) return; sortToggle++; },
		toggleBulk() { if (!browser) return; bulkToggle++; },
		setView(mode: string) { if (!browser) return; viewSignal = { counter: viewSignal.counter + 1, mode }; },
		triggerAddList() { if (!browser) return; addListSignal++; }
	};
}

export const v2Events = createEventBus();
export type V2EventBus = ReturnType<typeof createEventBus>;
