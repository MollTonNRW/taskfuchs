import { writable, derived } from 'svelte/store';
import type { Database } from '$lib/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

export const profilesStore = writable<Profile[]>([]);

export const profileMap = derived(profilesStore, ($profiles) => {
	const map = new Map<string, Profile>();
	for (const p of $profiles) {
		map.set(p.id, p);
	}
	return map;
});

export function getInitials(profile: Profile | undefined, fallback: string): string {
	if (profile?.display_name) {
		return profile.display_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
	}
	if (profile?.username) {
		return profile.username.slice(0, 2).toUpperCase();
	}
	return fallback.charAt(0).toUpperCase();
}
