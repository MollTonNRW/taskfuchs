// Simple event emitter for cross-component communication (Layout <-> Page)
// Uses Svelte 5 $state runes for reactivity
// SSR-safe: state is only relevant client-side (UI interactions)

import { browser } from '$app/environment';

function createEventBus() {
	// Guard: $state runes are only initialized in the browser to prevent
	// SSR state leaks (module-level singletons are shared between requests)

	// Shared header state (Page -> Layout communication)
	let sortLabel = $state('Position');
	let bulkModeActive = $state(false);

	// Layout -> Page action signals (increment = trigger)
	let searchToggle = $state(0);
	let sortToggle = $state(0);
	let bulkToggle = $state(0);
	let addListSignal = $state(0);

	return {
		get sortLabel() { return sortLabel; },
		set sortLabel(v: string) { sortLabel = v; },
		get bulkModeActive() { return bulkModeActive; },
		set bulkModeActive(v: boolean) { bulkModeActive = v; },
		// Layout -> Page action signals
		get searchToggle() { return searchToggle; },
		get sortToggle() { return sortToggle; },
		get bulkToggle() { return bulkToggle; },
		get addListSignal() { return addListSignal; },
		toggleSearch() { if (!browser) return; searchToggle++; },
		toggleSort() { if (!browser) return; sortToggle++; },
		toggleBulk() { if (!browser) return; bulkToggle++; },
		triggerAddList() { if (!browser) return; addListSignal++; }
	};
}

export const v2Events = createEventBus();
export type V2EventBus = ReturnType<typeof createEventBus>;
