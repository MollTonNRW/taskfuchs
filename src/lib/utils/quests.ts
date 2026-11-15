/**
 * Crossover Taskfuchs × Familien-Quests — reine Logik, eine Stelle fuer URLs.
 *
 * - Liste „Familie": oeffnet immer Familien-Quests (Aufgaben dort).
 * - Liste „Einkaufen" (Typ Einkauf): nur wenn der Schalter an ist, Default aus,
 *   bis der Umzug der Einkaufsliste live ist.
 *
 * Erkennung ueber Name (getrimmt, ohne Gross-/Kleinschreibung), Listentyp UND Besitzer:
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
 * Nur EIGENE Listen (Besitzer = angemeldeter Nutzer): eine mit mir geteilte
 * Liste einer fremden Person, die zufaellig „Familie" heisst, bleibt in
 * Taskfuchs. Ohne bekannten Nutzer wird nie umgeleitet.
 */
function istMeine(benutzerId: string | null, l: ListeKurz): boolean {
	return !!benutzerId && l.user_id === benutzerId;
}

export function istFamilieListe(benutzerId: string | null, l: ListeKurz): boolean {
	return istMeine(benutzerId, l) && l.kind === 'aufgaben' && name(l) === 'familie';
}

export function istEinkaufListe(benutzerId: string | null, l: ListeKurz): boolean {
	return istMeine(benutzerId, l) && l.kind === 'einkauf' && name(l) === 'einkaufen';
}

/** Ziel-URL in Familien-Quests oder null, wenn die Liste in Taskfuchs bleibt. */
export function questsZiel(l: ListeKurz, einkaufAn: boolean, benutzerId: string | null): string | null {
	if (istFamilieListe(benutzerId, l)) return QUESTS_AUFTRAEGE_URL;
	if (einkaufAn && istEinkaufListe(benutzerId, l)) return QUESTS_EINKAUF_URL;
	return null;
}

/** Gespeicherter Wert -> Schalter. Nur der Wert „an" schaltet ein, sonst aus. */
export function liesEinkaufSchalter(wert: string | null): boolean {
	return wert === 'an';
}
