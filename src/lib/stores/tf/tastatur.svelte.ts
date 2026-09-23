/**
 * Hoehe der eingeblendeten Bildschirmtastatur.
 *
 * `src/app.html` setzt `interactive-widget=resizes-visual`: die Tastatur
 * verkleinert nur das sichtbare Fenster, nicht das Layout. Ein Element mit
 * `position:fixed; bottom:0` liegt damit HINTER der Tastatur. Das angedockte
 * Quick-Add-Feld (Spezifikation Abschnitt 4, Screen „mobile-quickadd") muss
 * darueber sitzen — dafuer braucht es die gemessene Hoehe.
 *
 * Der Zaehler haelt genau einen Satz Ereignis-Hoerer, egal wie viele
 * Komponenten gerade zusehen.
 */

/** Darunter ist es die ein- und ausfahrende Browserleiste, keine Tastatur. */
const SCHWELLE = 120;

let hoehe = $state(0);
let zuschauer = 0;
let abmelden: (() => void) | null = null;

function messen() {
	const vv = window.visualViewport;
	if (!vv) {
		hoehe = 0;
		return;
	}
	const rest = Math.round(window.innerHeight - vv.height - vv.offsetTop);
	hoehe = rest > SCHWELLE ? rest : 0;
}

/**
 * Meldet einen Zuschauer an und gibt die Abmeldung zurueck — direkt als
 * Rueckgabewert eines `$effect` verwendbar.
 */
export function beobachteTastatur(): () => void {
	if (typeof window === 'undefined') return () => {};

	zuschauer += 1;
	if (zuschauer === 1) {
		const vv = window.visualViewport;
		if (vv) {
			vv.addEventListener('resize', messen);
			vv.addEventListener('scroll', messen);
			abmelden = () => {
				vv.removeEventListener('resize', messen);
				vv.removeEventListener('scroll', messen);
			};
		}
		messen();
	}

	return () => {
		zuschauer -= 1;
		if (zuschauer > 0) return;
		abmelden?.();
		abmelden = null;
		hoehe = 0;
	};
}

export const tastatur = {
	get hoehe() {
		return hoehe;
	},
	get offen() {
		return hoehe > 0;
	}
};
