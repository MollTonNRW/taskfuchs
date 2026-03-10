import { writable } from 'svelte/store';

// Client-side list visibility toggle (sidebar hide/show)
export const hiddenListIds = writable<Set<string>>(new Set());

export function toggleListVisibility(listId: string) {
	hiddenListIds.update((s) => {
		const next = new Set(s);
		if (next.has(listId)) {
			next.delete(listId);
		} else {
			next.add(listId);
		}
		return next;
	});
}
