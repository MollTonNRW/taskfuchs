import { writable } from 'svelte/store';
import type { Database } from '$lib/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * Profil-Zwischenspeicher fuer das „gepinnt von"-Abzeichen in der Aufgabenzeile.
 *
 * Der abgeleitete `profileMap` und `getInitials` hingen allein an Pinboard.svelte
 * und sind mit dieser Komponente entfallen. Initialen bildet jetzt
 * `initialeAus` in src/lib/utils/mitnutzer.ts — ein Ort, eine Regel.
 */
export const profilesStore = writable<Profile[]>([]);
