import { browser } from '$app/environment';
import { EINKAUF_SCHALTER_KEY, liesEinkaufSchalter } from '$lib/utils/quests';

/**
 * Schalter „Einkaufen in Familien-Quests oeffnen" (Default aus).
 *
 * Lebt im Browser (localStorage), nicht in der Datenbank: ohne Deploy und ohne
 * Migration umschaltbar, pro Geraet. Zusaetzlich per Adresse setzbar:
 * `/app?einkauf-quests=an` bzw. `=aus` (wird gespeichert) — so laesst sich der
 * Schalter beim Umzug auf jedem Geraet per Link setzen.
 */
function lese(): boolean {
	if (!browser) return false;
	try {
		const url = new URL(window.location.href).searchParams.get('einkauf-quests');
		if (url === 'an' || url === 'aus') {
			localStorage.setItem(EINKAUF_SCHALTER_KEY, url);
			return url === 'an';
		}
		return liesEinkaufSchalter(localStorage.getItem(EINKAUF_SCHALTER_KEY));
	} catch {
		return false;
	}
}

function createQuests() {
	let einkaufAn = $state<boolean>(lese());

	return {
		get einkaufAn() {
			return einkaufAn;
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
