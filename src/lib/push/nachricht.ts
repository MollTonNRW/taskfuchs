// Push-Nachricht lesen und Ziel prüfen — rein, ohne I/O. Vom Service Worker genutzt.
// Beides darf nie werfen: ein Ausnahmefall im `push`-Handler ließe den Browser eine
// generische „Die Website wurde im Hintergrund aktualisiert“-Meldung zeigen.

export interface PushAnzeige {
	titel: string;
	text: string;
	tag?: string;
	url: string;
}

const MAX_TEXT = 300;
const MAX_TAG = 200;
const MAX_URL = 500;
const STANDARD_ZIEL = '/app';

function kuerzen(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

/** Eine nicht leere Zeichenkette (nach Trim) oder `undefined`. */
function text(wert: unknown): string | undefined {
	return typeof wert === 'string' && wert.trim() !== '' ? wert : undefined;
}

/**
 * Liest die Nutzlast einer Push-Nachricht (`event.data.text()`).
 * Kaputtes, Leeres oder Fremdes ergibt den Rückfall „Taskfuchs“ / „Neue Änderungen“.
 */
export function leseNachricht(roh: string | null | undefined): PushAnzeige {
	let daten: unknown;
	try {
		daten = roh ? JSON.parse(roh) : null;
	} catch {
		daten = null;
	}
	const obj =
		daten !== null && typeof daten === 'object' && !Array.isArray(daten) ? (daten as Record<string, unknown>) : {};

	const anzeige: PushAnzeige = {
		titel: kuerzen(text(obj.titel) ?? 'Taskfuchs', MAX_TEXT),
		text: kuerzen(text(obj.text) ?? 'Neue Änderungen', MAX_TEXT),
		url: kuerzen(text(obj.url) ?? STANDARD_ZIEL, MAX_URL)
	};
	const tag = text(obj.tag);
	if (tag) anzeige.tag = kuerzen(tag, MAX_TAG);
	return anzeige;
}

/**
 * Ziel eines Tipps auf die Meldung: nur gleiche Origin, als Pfad mit Abfrage.
 * Alles andere (fremde Origin, `//host`, `javascript:`, Müll) → `/app`.
 * Die Prüfung läuft über den URL-Parser, der Tabulatoren und `\` genauso
 * auflöst wie der Browser — keine eigene Zeichenketten-Logik. Geprüft wird
 * auch das Ergebnis selbst, nicht nur die Eingabe: der Service Worker löst
 * es ein zweites Mal gegen die Origin auf.
 */
export function zielUrl(url: unknown, origin: string): string {
	const roh = text(url);
	if (!roh) return STANDARD_ZIEL;
	try {
		const ziel = new URL(roh, origin);
		if (ziel.origin !== origin) return STANDARD_ZIEL;
		const pfad = ziel.pathname + ziel.search + ziel.hash;
		// Der Parser faltet `/.//boese.de` zu dem Pfad `//boese.de` — als Ergebnis wäre das
		// wieder ein protokollrelativer Verweis. Der Service Worker löst es erneut gegen die
		// Origin auf, also muss auch das Ergebnis dort bleiben.
		if (new URL(pfad, origin).origin !== origin) return STANDARD_ZIEL;
		return pfad;
	} catch {
		return STANDARD_ZIEL;
	}
}
