import { browser } from '$app/environment';
import { EINKAUF_SCHALTER_KEY, liesEinkaufSchalter } from '$lib/utils/quests';

/**
 * Schalter „Einkaufen in Familien-Quests oeffnen" (Default an seit 15.11.2026).
 *
 * Lebt im Browser (localStorage), nicht in der Datenbank: ohne Deploy und ohne
 * Migration umschaltbar, pro Geraet. Geaendert wird er nur ueber die
 * Einstellung in der App. Der gespeicherte Wert wird erst im Browser nach dem
 * Mounten gelesen (`laden`), damit Server- und Client-Render identisch beginnen
 * (kein Hydration-Mismatch).
 */
function createQuests() {
	let einkaufAn = $state<boolean>(true);

	return {
		get einkaufAn() {
			return einkaufAn;
		},
		/** Im onMount der Shell aufrufen. */
		laden() {
			if (!browser) return;
			try {
				einkaufAn = liesEinkaufSchalter(localStorage.getItem(EINKAUF_SCHALTER_KEY));
			} catch {
				/* privater Modus — Default an */
			}
		},
		toggleEinkauf() {
			if (!browser) return;
			einkaufAn = !einkaufAn;
			try {
				localStorage.setItem(EINKAUF_SCHALTER_KEY, einkaufAn ? 'an' : 'aus');
			} catch {
				/* privater Modus — gilt nur fuer diese Sitzung */
			}
		}
	};
}

export const quests = createQuests();
