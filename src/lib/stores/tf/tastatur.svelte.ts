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
import { untrack } from 'svelte';

/** Darunter ist es die ein- und ausfahrende Browserleiste, keine Tastatur. */
const SCHWELLE = 120;

let hoehe = $state(0);
let zuschauer = 0;
/** Wie viele Quick-Add-Felder gerade angedockt sind (hoechstens eins). */
let angedockt = $state(0);
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

/**
 * Das angedockte Quick-Add-Feld meldet sich an, solange es steht — der
 * Toast-Stapel weicht ihm aus (ToastContainer). Rueckgabe: die Abmeldung.
 */
export function meldeAndocken(): () => void {
	// untrack: aufgerufen aus einem `$effect` — das Lesen fuer `+= 1` machte
	// den Zaehler sonst zu dessen Abhaengigkeit, und der Effekt liefe endlos.
	untrack(() => (angedockt += 1));
	return () => {
		untrack(() => (angedockt -= 1));
	};
}

/** Unterkante des angedockten Feldes: ueber der Tastatur, sonst ueber der Tab-Leiste. */
export function dockUnten(): string {
	return hoehe > 0 ? `${hoehe}px` : 'calc(var(--tf-tabbar) + env(safe-area-inset-bottom))';
}

/** Hoehe des angedockten Feldes: 6 + 48 + 8 Polster/Zeile plus 1 px Rand. */
export const DOCK_HOEHE = 63;

export const tastatur = {
	get hoehe() {
		return hoehe;
	},
	get offen() {
		return hoehe > 0;
	},
	get angedockt() {
		return angedockt > 0;
	}
};
