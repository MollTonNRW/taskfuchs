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

/**
 * Erinnerungen an Fristen (Migration 028), je Person, für alle Geräte.
 * `uhrzeit` der Tagesmeldung als „HH:MM", `vorlauf` in Minuten vor einer Aufgabe mit Uhrzeit.
 */
export interface FristenEinstellungen {
	aktiv: boolean;
	uhrzeit: string;
	vortag: boolean;
	vorlauf: number;
}

/** Was gilt, solange jemand nichts eingestellt hat (keine Zeile in `push_fristen_einstellungen`). */
export const FRISTEN_STANDARD: Readonly<FristenEinstellungen> = Object.freeze({
	aktiv: true,
	uhrzeit: '08:00',
	vortag: false,
	vorlauf: 30
});

/** 05:00 bis 22:00 im Halbstundentakt — dasselbe Raster prüft die Datenbank. */
export const FRISTEN_UHRZEITEN: readonly string[] = Array.from({ length: 35 }, (_, i) => {
	const minuten = 5 * 60 + i * 30;
	return `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`;
});

/** Die erlaubten Vorläufe (Check-Constraint der Datenbank) mit ihrem Text in der Auswahl. */
export const FRISTEN_VORLAEUFE: readonly { minuten: number; text: string }[] = [
	{ minuten: 0, text: 'Zur Uhrzeit' },
	{ minuten: 15, text: '15 Minuten vorher' },
	{ minuten: 30, text: '30 Minuten vorher' },
	{ minuten: 60, text: '1 Stunde vorher' },
	{ minuten: 120, text: '2 Stunden vorher' }
];

/**
 * Zeile aus `push_fristen_einstellungen` (oder keine) als Einstellungen.
 * Die Datenbank liefert die Uhrzeit als „08:00:00"; Unbekanntes fällt auf den Standard.
 */
export function fristenAusZeile(
	zeile: { aktiv?: unknown; uhrzeit?: unknown; vortag?: unknown; vorlauf?: unknown } | null | undefined
): FristenEinstellungen {
	if (!zeile) return { ...FRISTEN_STANDARD };
	const uhrzeit = typeof zeile.uhrzeit === 'string' ? zeile.uhrzeit.slice(0, 5) : '';
	const vorlauf = typeof zeile.vorlauf === 'number' ? zeile.vorlauf : NaN;
	return {
		aktiv: typeof zeile.aktiv === 'boolean' ? zeile.aktiv : FRISTEN_STANDARD.aktiv,
		uhrzeit: FRISTEN_UHRZEITEN.includes(uhrzeit) ? uhrzeit : FRISTEN_STANDARD.uhrzeit,
		vortag: typeof zeile.vortag === 'boolean' ? zeile.vortag : FRISTEN_STANDARD.vortag,
		vorlauf: FRISTEN_VORLAEUFE.some((v) => v.minuten === vorlauf) ? vorlauf : FRISTEN_STANDARD.vorlauf
	};
}

/**
 * Einstellungen speichern (RPC `push_fristen_einstellen`, prüft Anmeldung und Werte).
 * Wirft bei einem Fehler, damit die Seite die Anzeige zurücknehmen kann.
 */
export async function speichereFristen(sb: SupabaseClient, e: FristenEinstellungen): Promise<void> {
	const { error } = await sb.rpc('push_fristen_einstellen', {
		p_aktiv: e.aktiv,
		p_uhrzeit: e.uhrzeit,
		p_vortag: e.vortag,
		p_vorlauf: e.vorlauf
	});
	if (error) throw new Error(error.message);
}

/**
 * Ruft `aktualisieren` jedes Mal auf, wenn die Seite wieder sichtbar wird.
 *
 * Wer die Benachrichtigungen in den Android-Einstellungen erlaubt oder sperrt,
 * kehrt danach in dieselbe, noch offene Seite zurück. Ohne diesen Anstoß zeigte
 * sie weiter den alten Stand („blockiert", kein Knopf), bis man sie verließe
 * und neu öffnete. Liefert die Abmeldefunktion.
 */
export function beiRueckkehr(
	dokument: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>,
	aktualisieren: () => void
): () => void {
	function beiSichtbarkeit() {
		if (dokument.visibilityState === 'visible') aktualisieren();
	}
	dokument.addEventListener('visibilitychange', beiSichtbarkeit);
	return () => dokument.removeEventListener('visibilitychange', beiSichtbarkeit);
}

/**
 * Wohin der Zurück-Pfeil der Seite führt.
 *
 * Kam man aus der App (`/app`), liegt sie schon im Verlauf: ein Link auf `/app`
 * legte einen neuen Eintrag an (`/app`, Seite, `/app`), und die Zurück-Taste von
 * Android führte danach wieder auf diese Seite statt aus der App. Dann also
 * einen Schritt im Verlauf zurück (`'verlauf'`). Bei direktem Aufruf oder
 * Herkunft von anderswo ist der Link richtig (`'app'`).
 *
 * @param vonPfad Pfad der Seite davor (`navigation.from?.url.pathname`), sonst `null`
 * @param appPfad Pfad der App (Standard `/app`; die Dev-Vorschau liegt woanders)
 */
export function zurueckWeg(vonPfad: string | null | undefined, appPfad: string): 'verlauf' | 'app' {
	return vonPfad === appPfad ? 'verlauf' : 'app';
}

/**
 * Pfad der Seite davor aus dem Argument von `afterNavigate`; `null`, wenn es keinen gibt.
 * Wirft nie: bei einem Direktaufruf einer Seite mit `ssr = false` ruft SvelteKit den
 * Callback mit einem `from` auf, dessen `url` noch leer ist.
 */
export function vonPfadAus(nav: { from: { url?: { pathname: string } | null } | null }): string | null {
	return nav.from?.url?.pathname ?? null;
}
