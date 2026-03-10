import { writable, derived } from 'svelte/store';

export type PriorityFilter = 'low' | 'normal' | 'high' | 'asap';
export type TimeframeFilter = 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig';

export const priorityFilters = writable<Record<PriorityFilter, boolean>>({
	low: true,
	normal: true,
	high: true,
	asap: true
});

export const timeframeFilters = writable<Record<TimeframeFilter, boolean>>({
	akut: true,
	zeitnah: true,
	mittelfristig: true,
	langfristig: true
});

export const viewFilters = writable<{
	highlighted: boolean;
	withDate: boolean;
	shared: boolean;
}>({
	highlighted: false,
	withDate: false,
	shared: false
});

export function togglePriorityFilter(p: PriorityFilter) {
	priorityFilters.update((f) => ({ ...f, [p]: !f[p] }));
}

export function toggleTimeframeFilter(tf: TimeframeFilter) {
	timeframeFilters.update((f) => ({ ...f, [tf]: !f[tf] }));
}

export function toggleViewFilter(key: 'highlighted' | 'withDate' | 'shared') {
	viewFilters.update((f) => ({ ...f, [key]: !f[key] }));
}

// Whether any filter is active (not all defaults)
export const hasActiveFilter = derived(
	[priorityFilters, timeframeFilters, viewFilters],
	([$pf, $tf, $vf]) => {
		const allPriority = Object.values($pf).every(Boolean);
		const allTimeframe = Object.values($tf).every(Boolean);
		const noView = !$vf.highlighted && !$vf.withDate && !$vf.shared;
		return !(allPriority && allTimeframe && noView);
	}
);

export function resetFilters() {
	priorityFilters.set({ low: true, normal: true, high: true, asap: true });
	timeframeFilters.set({ akut: true, zeitnah: true, mittelfristig: true, langfristig: true });
	viewFilters.set({ highlighted: false, withDate: false, shared: false });
}
