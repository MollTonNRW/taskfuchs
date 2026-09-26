/**
 * Langes Tippen am Finger — das Menue einer Zeile ohne ⋮.
 *
 * Auf dem Mobilgeraet traegt eine Zeile kein ⋮ (Spezifikation Abschnitt 5);
 * das Menue kommt ueber langes Tippen. Android meldet das zwar selbst als
 * `contextmenu`, iOS nicht — und nach dem Loslassen schickt Android noch
 * einen Klick hinterher, der sonst wie ein Tippen wirkte (Aufgabe oeffnen,
 * Artikel in den Wagen). Darum: selbst messen, Menue beim Loslassen, den
 * folgenden Klick schlucken.
 *
 * Das Ziehen beginnt laut Gesten-Modell nach 300 ms Halten UND Bewegung
 * (siehe touchDrag.ts) — Halten ohne Bewegung ist dort eine Leerstelle und
 * gehoert hier dem Menue.
 *
 * Eine Instanz darf viele Zeilen bedienen (ein Finger, eine Geste): das
 * Ziel kommt bei `ende` und `kontextmenue` mit herein.
 *
 * Nutzung:
 *   const tippen = createLangesTippen<Task>((p, t) => onMenu(p, t));
 *   <div ontouchstart={tippen.start} ontouchmove={tippen.bewegt}
 *        ontouchend={(e) => tippen.ende(e, t)}
 *        oncontextmenu={(e) => tippen.kontextmenue(e, t)}
 *        onclick={() => { if (!tippen.klickGeschluckt()) … }}>
 */
import { get } from 'svelte/store';
import { dragState } from './touchDrag';
import type { Zeigerpunkt } from '$lib/composables/tf/useContextMenus.svelte';

/** Ab hier gilt ein Tippen als Halten und oeffnet das Menue. */
export const LANGES_TIPPEN = 450;
/** So lange nach einer Beruehrung ist ein `contextmenu` das native Menue. */
export const NATIV_SPERRE = 700;
/** Ab dieser Strecke war es kein Halten, sondern ein Wischen. */
export const WACKELN = 8;

export function createLangesTippen<T>(onMenue: (p: Zeigerpunkt, ziel: T) => void) {
	let tippStart = 0;
	let tippX = 0;
	let tippY = 0;
	let gewischt = false;
	/** Das Halten hat das Menue geoeffnet — der folgende Klick entfaellt. */
	let menueGeoeffnet = false;

	function start(e: TouchEvent) {
		tippStart = Date.now();
		gewischt = false;
		menueGeoeffnet = false;
		const t = e.touches[0];
		if (!t) return;
		tippX = t.clientX;
		tippY = t.clientY;
	}

	function bewegt(e: TouchEvent) {
		const t = e.touches[0];
		if (!t) return;
		if (Math.abs(t.clientX - tippX) > WACKELN || Math.abs(t.clientY - tippY) > WACKELN)
			gewischt = true;
	}

	function ende(e: TouchEvent, ziel: T) {
		if (gewischt || Date.now() - tippStart < LANGES_TIPPEN) return;
		// Laeuft gerade ein Umsortieren, gehoert das Halten dem Ziehen.
		if (get(dragState).active) return;
		const t = e.changedTouches[0];
		if (!t) return;
		menueGeoeffnet = true;
		onMenue({ clientX: t.clientX, clientY: t.clientY, preventDefault() {} }, ziel);
	}

	function kontextmenue(e: MouseEvent, ziel: T) {
		e.preventDefault();
		// Android feuert `contextmenu` selbst beim langen Tippen; dort hat das
		// Halten bereits gewirkt und das native Menue stoert nur.
		if (Date.now() - tippStart < NATIV_SPERRE) return;
		onMenue(e, ziel);
	}

	/** Im Klick-Handler zuerst fragen: true heisst, dieser Klick folgte dem Menue und entfaellt. */
	function klickGeschluckt(): boolean {
		if (!menueGeoeffnet) return false;
		menueGeoeffnet = false;
		return true;
	}

	return { start, bewegt, ende, kontextmenue, klickGeschluckt };
}
