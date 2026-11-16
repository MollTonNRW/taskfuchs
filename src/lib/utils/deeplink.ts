/**
 * Deep Links — Ziele einer Push-Benachrichtigung:
 *   `/app?liste=<id>`        eine Liste (Änderungen, Termin-Erinnerung)
 *   `/app?ansicht=dringend`  die Ansicht „Dringend" (Tagesmeldung über mehrere Listen)
 *
 * `listeAusUrl`:
 * Gibt die Listen-ID zurück, wenn der Parameter eine UUID ist, sonst `null`
 * (kein Parameter, Müll, Demo-ID der Vorschau). Ob die Liste existiert und
 * für diese Person sichtbar ist, prüft der Aufrufer gegen die geladenen Listen.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function listeAusUrl(search: string): string | null {
	const wert = new URLSearchParams(search).get('liste');
	return wert && UUID.test(wert) ? wert.toLowerCase() : null;
}

/** Smart-Ansichten, die ein Deep Link öffnen darf. */
export type AnsichtAusUrl = 'dringend' | 'pins';

/** Ansicht aus `?ansicht=`; nur bekannte Werte, sonst `null`. */
export function ansichtAusUrl(search: string): AnsichtAusUrl | null {
	const wert = new URLSearchParams(search).get('ansicht');
	return wert === 'dringend' || wert === 'pins' ? wert : null;
}
