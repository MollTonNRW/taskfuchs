// Reine Hilfen der Seite /app/benachrichtigungen (kein Browser, kein Svelte).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushStatus } from './abo';

interface ListeKurz {
	id: string;
	user_id: string;
	position: number;
}

interface FreigabeKurz {
	list_id: string;
	user_id: string;
}

/**
 * Die Listen, für die es Meldungen geben kann: geteilt, sortiert wie die
 * Navigation (nach `position`), jede nur einmal.
 *
 * - Eigene Liste: geteilt, wenn es eine Freigabe an JEMAND ANDEREN gibt
 *   (dieselbe Regel wie der Trigger in Migration 027: `s.user_id <> l.user_id`).
 * - Fremde Liste: geteilt, wenn ich selbst eine Freigabe habe. Was RLS mir zeigt,
 *   sind nur Listen, die ich besitze oder mit mir geteilt wurden.
 */
export function geteilteListen<L extends ListeKurz>(lists: L[], shares: FreigabeKurz[], uid: string | null): L[] {
	if (!uid) return [];
	const gesehen = new Set<string>();
	const treffer: L[] = [];
	for (const l of lists) {
		if (gesehen.has(l.id)) continue;
		const geteilt =
			l.user_id === uid
				? shares.some((s) => s.list_id === l.id && s.user_id !== l.user_id)
				: shares.some((s) => s.list_id === l.id && s.user_id === uid);
		if (!geteilt) continue;
		gesehen.add(l.id);
		treffer.push(l);
	}
	return treffer.sort((a, b) => a.position - b.position);
}

const STATUS_TEXT: Record<PushStatus, string> = {
	'nicht-unterstuetzt': 'Dieses Gerät kann keine Benachrichtigungen empfangen.',
	verweigert:
		'Benachrichtigungen sind für Taskfuchs blockiert. Erlaube sie in den Android-Einstellungen unter Apps › Taskfuchs › Benachrichtigungen.',
	aus: 'Auf diesem Gerät aus.',
	an: 'Auf diesem Gerät an.'
};

export function statusText(status: PushStatus): string {
	return STATUS_TEXT[status];
}

/**
 * Meldungen für eine Liste aus- oder einschalten. Standard ist „an"; eine
 * Zeile in `list_notification_mutes` heißt „stumm". Wirft bei einem Fehler,
 * damit die Seite die Anzeige zurücknehmen kann.
 */
export async function setzeStumm(sb: SupabaseClient, userId: string, listId: string, stumm: boolean): Promise<void> {
	const tabelle = sb.from('list_notification_mutes');
	if (stumm) {
		const { error } = await tabelle.insert({ user_id: userId, list_id: listId });
		// 23505: schon stumm (zweites Gerät, Doppeltipp) — das Ziel ist erreicht.
		if (error && error.code !== '23505') throw new Error(error.message);
		return;
	}
	const { error } = await tabelle.delete().eq('user_id', userId).eq('list_id', listId);
	if (error) throw new Error(error.message);
}
