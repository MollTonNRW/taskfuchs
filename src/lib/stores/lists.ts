import { writable } from 'svelte/store';
import type { Database } from '$lib/types/database';

type List = Database['public']['Tables']['lists']['Row'];

export const listsStore = writable<List[]>([]);
