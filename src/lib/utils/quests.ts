/**
 * Crossover Taskfuchs × Familien-Quests — reine Logik, eine Stelle fuer URLs.
 *
 * - Liste „Familie": oeffnet immer Familien-Quests (Aufgaben dort).
 * - Liste „Einkaufen" (Typ Einkauf): nur wenn der Schalter an ist, Default aus,
 *   bis der Umzug der Einkaufsliste live ist.
 *
 * Erkennung ueber Name (getrimmt, ohne Gross-/Kleinschreibung), Listentyp UND Beteiligung (eigen oder mit mir geteilt):
 * die Datenbank hat kein Kennzeichen fuer „diese Liste", und der Name allein
 * wuerde auch eine Einkaufsliste „Familie" treffen. Nur exakte Namen, damit
 * „Familienurlaub" in Taskfuchs bleibt.
 */

export const QUESTS_URL = 'https://familien-quests.pages.dev';
export const QUESTS_AUFTRAEGE_URL = `${QUESTS_URL}/auftraege`;
export const QUESTS_EINKAUF_URL = `${QUESTS_URL}/einkauf`;

/** localStorage-Schluessel des Einkaufs-Schalters (pro Geraet). */
export const EINKAUF_SCHALTER_KEY = 'tf-einkauf-quests';

type ListeKurz = { title: string; kind: 'aufgaben' | 'einkauf'; user_id: string };

function name(l: ListeKurz): string {
	return l.title.trim().toLowerCase();
}

/**
 * Die Liste gehoert mir ODER ist per list_shares mit mir geteilt (auch als
 * Editor). Eine Liste, die gar nicht meine ist, wird nie umgeleitet. Ohne
 * bekannten Nutzer ebenfalls nicht.
 */
function istBeteiligt(benutzerId: string | null, l: ListeKurz, geteiltMitMir: boolean): boolean {
	return !!benutzerId && (l.user_id === benutzerId || geteiltMitMir);
}

export function istFamilieListe(benutzerId: string | null, l: ListeKurz, geteiltMitMir = false): boolean {
	return istBeteiligt(benutzerId, l, geteiltMitMir) && l.kind === 'aufgaben' && name(l) === 'familie';
}

export function istEinkaufListe(benutzerId: string | null, l: ListeKurz, geteiltMitMir = false): boolean {
	return istBeteiligt(benutzerId, l, geteiltMitMir) && l.kind === 'einkauf' && name(l) === 'einkaufen';
}

/** Ziel-URL in Familien-Quests oder null, wenn die Liste in Taskfuchs bleibt. */
export function questsZiel(
	l: ListeKurz,
	einkaufAn: boolean,
	benutzerId: string | null,
	geteiltMitMir = false
): string | null {
	if (istFamilieListe(benutzerId, l, geteiltMitMir)) return QUESTS_AUFTRAEGE_URL;
	if (einkaufAn && istEinkaufListe(benutzerId, l, geteiltMitMir)) return QUESTS_EINKAUF_URL;
	return null;
}

/** Gespeicherter Wert -> Schalter. Nur der Wert „an" schaltet ein, sonst aus. */
export function liesEinkaufSchalter(wert: string | null): boolean {
	return wert === 'an';
}
