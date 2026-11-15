/**
 * Crossover Taskfuchs × Familien-Quests — reine Logik, eine Stelle fuer URLs.
 *
 * - Liste „Familie": oeffnet immer Familien-Quests (Aufgaben dort).
 * - Liste „Einkaufen" (Typ Einkauf): nur wenn der Schalter an ist, Default aus,
 *   bis der Umzug der Einkaufsliste live ist.
 *
 * Erkennung ueber Name (getrimmt, ohne Gross-/Kleinschreibung) UND Listentyp:
 * die Datenbank hat kein Kennzeichen fuer „diese Liste", und der Name allein
 * wuerde auch eine Einkaufsliste „Familie" treffen. Nur exakte Namen, damit
 * „Familienurlaub" in Taskfuchs bleibt.
 */

export const QUESTS_URL = 'https://familien-quests.pages.dev';
export const QUESTS_AUFTRAEGE_URL = `${QUESTS_URL}/auftraege`;
export const QUESTS_EINKAUF_URL = `${QUESTS_URL}/einkauf`;

/** localStorage-Schluessel des Einkaufs-Schalters (pro Geraet). */
export const EINKAUF_SCHALTER_KEY = 'tf-einkauf-quests';

type ListeKurz = { title: string; kind: 'aufgaben' | 'einkauf' };

function name(l: ListeKurz): string {
	return l.title.trim().toLowerCase();
}

export function istFamilieListe(l: ListeKurz): boolean {
	return l.kind === 'aufgaben' && name(l) === 'familie';
}

export function istEinkaufListe(l: ListeKurz): boolean {
	return l.kind === 'einkauf' && name(l) === 'einkaufen';
}

/** Ziel-URL in Familien-Quests oder null, wenn die Liste in Taskfuchs bleibt. */
export function questsZiel(l: ListeKurz, einkaufAn: boolean): string | null {
	if (istFamilieListe(l)) return QUESTS_AUFTRAEGE_URL;
	if (einkaufAn && istEinkaufListe(l)) return QUESTS_EINKAUF_URL;
	return null;
}

/** Gespeicherter Wert -> Schalter. Nur der Wert „an" schaltet ein, sonst aus. */
export function liesEinkaufSchalter(wert: string | null): boolean {
	return wert === 'an';
}
