import { browser } from '$app/environment';

/**
 * Gemeinsamer Navigationszustand der Richtung A „Klar".
 *
 * Alle drei Spalten lesen daraus: die linke Spalte markiert `activeListId`,
 * die Mitte zeigt genau diese Liste, die rechte Spalte (mobil das Sheet)
 * zeigt `selectedTaskId`. Vorher war die aktive Liste ein lokaler INDEX in
 * `+page.svelte` — beim Loeschen oder Umsortieren zeigte derselbe Index
 * anschliessend auf eine andere Liste. Deshalb hier durchgehend IDs.
 *
 * `mobileTab` und `listOpenMobile` gehoeren zur mobilen Schirm-Hierarchie
 * (Tab-Leiste, Unterschirm „Liste geoeffnet") und werden ab T5 gelesen.
 *
 * SSR: `$effect` und Event-Handler laufen nur im Browser, der Modul-Singleton
 * behaelt auf dem Server also seine Startwerte. localStorage wird zusaetzlich
 * per `browser`-Guard und try/catch abgesichert (privater Modus).
 */

export type MobileTab = 'listen' | 'pins' | 'suche';

/**
 * Smart-Ansicht statt einer Liste in der Mitte (Navigationsspalte oben).
 * `null` = die gewaehlte Liste. Bewusst NICHT persistiert: nach einem
 * Neuladen steht wieder die zuletzt gewaehlte Liste vorn.
 */
export type SmartView = 'pins' | 'dringend' | null;

const KEY = 'tf-active-list';

function createNav() {
	let activeListId = $state<string | null>(null);
	let selectedTaskId = $state<string | null>(null);
	let mobileTab = $state<MobileTab>('listen');
	let listOpenMobile = $state(false);
	let smartView = $state<SmartView>(null);

	/** Zuletzt gesehene Reihenfolge der Listen — Grundlage fuer die Nachfolgersuche. */
	let bekannteListen: string[] = [];
	/** Vor `hydrate` darf `syncLists` nichts entscheiden (Listen sind noch nicht geladen). */
	let hydriert = false;

	function persist(id: string | null) {
		if (!browser) return;
		try {
			if (id) localStorage.setItem(KEY, id);
			else localStorage.removeItem(KEY);
		} catch {
			/* privater Modus — Auswahl gilt nur fuer diese Sitzung */
		}
	}

	function setActive(id: string | null) {
		if (activeListId === id) return;
		activeListId = id;
		// Die Detail-Auswahl gehoerte zur alten Liste und waere jetzt gegenstandslos.
		selectedTaskId = null;
		persist(id);
	}

	/**
	 * Ersatz fuer eine verschwundene Liste: erst die naechste darunter,
	 * sonst die naechste darueber, sonst die erste vorhandene.
	 */
	function nachfolger(verloren: string | null, vorhanden: string[]): string | null {
		const idx = verloren ? bekannteListen.indexOf(verloren) : -1;
		if (idx >= 0) {
			for (let i = idx + 1; i < bekannteListen.length; i++) {
				if (vorhanden.includes(bekannteListen[i])) return bekannteListen[i];
			}
			for (let i = idx - 1; i >= 0; i--) {
				if (vorhanden.includes(bekannteListen[i])) return bekannteListen[i];
			}
		}
		return vorhanden[0] ?? null;
	}

	return {
		get activeListId() {
			return activeListId;
		},
		get selectedTaskId() {
			return selectedTaskId;
		},
		get mobileTab() {
			return mobileTab;
		},
		get listOpenMobile() {
			return listOpenMobile;
		},
		get smartView() {
			return smartView;
		},

		/**
		 * Einmalig nach dem Laden der Listen aufrufen: gespeicherte Auswahl
		 * gegen die vorhandenen Listen pruefen, sonst die erste Liste.
		 * Eine ungueltige gespeicherte ID wird dabei gleich ueberschrieben.
		 */
		hydrate(listIds: string[]) {
			let gespeichert: string | null = null;
			if (browser) {
				try {
					gespeichert = localStorage.getItem(KEY);
				} catch {
					/* privater Modus */
				}
			}
			activeListId = gespeichert && listIds.includes(gespeichert) ? gespeichert : (listIds[0] ?? null);
			bekannteListen = [...listIds];
			hydriert = true;
			if (activeListId !== gespeichert) persist(activeListId);
		},

		/**
		 * Nachfuehren, wenn sich der Listenbestand aendert (Loeschen, Realtime,
		 * erste Liste im Leerzustand). Faellt die aktive Liste weg, ruecken wir
		 * auf die naechste vorhandene; ist keine mehr da, bleibt `null` und die
		 * Mitte zeigt ihren Leerzustand. Ohne das zeigte die Mitte nach dem
		 * Loeschen der aktiven Liste gar nichts mehr.
		 */
		syncLists(listIds: string[]) {
			if (!hydriert) return;
			if (activeListId && listIds.includes(activeListId)) {
				bekannteListen = [...listIds];
				return;
			}
			const ziel = nachfolger(activeListId, listIds);
			bekannteListen = [...listIds];
			setActive(ziel);
			// Ohne Liste gibt es mobil nichts zu zeigen: zurueck zur Uebersicht,
			// sonst stuende dort ein leerer Unterschirm mit blossem Zurueck-Pfeil.
			if (!ziel) listOpenMobile = false;
		},

		selectList(id: string) {
			setActive(id);
			smartView = null;
			listOpenMobile = true;
		},

		/** Smart-Ansicht (Angepinnt/Dringend) statt einer Liste zeigen. */
		selectSmart(view: Exclude<SmartView, null>) {
			smartView = view;
			selectedTaskId = null;
			listOpenMobile = true;
		},

		selectTask(id: string | null) {
			selectedTaskId = id;
		},

		setTab(tab: MobileTab) {
			mobileTab = tab;
			// Das Sheet gehoert zu dem Schirm, auf dem es geoeffnet wurde.
			// Seit die Pinnwand ein eigener Tab mit oeffenbaren Zeilen ist,
			// stuende es sonst beim Tabwechsel ueber dem neuen Schirm.
			// Wer aus der Suche in eine Liste springt, waehlt die Aufgabe
			// danach (siehe `sucheOeffnenMobil`) — die Reihenfolge stimmt.
			selectedTaskId = null;
			if (tab !== 'listen') {
				listOpenMobile = false;
				smartView = null;
			}
		},

		/** Mobile-Zurueck: Sheet → Liste/Smart-Ansicht → Uebersicht. */
		back() {
			if (selectedTaskId) {
				selectedTaskId = null;
				return;
			}
			if (listOpenMobile) {
				listOpenMobile = false;
				smartView = null;
			}
		}
	};
}

export const nav = createNav();
export type Navigation = ReturnType<typeof createNav>;
