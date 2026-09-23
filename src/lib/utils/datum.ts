/**
 * Datums- und Zeitangaben fuer die Oberflaeche.
 *
 * Regel der Spezifikation (Abschnitt 5 und 9): in der Oberflaeche steht
 * NIE ein ISO-String. Die Aufgabenzeile zeigt „heute 12:00",
 * „Sa 20.09. · 09:00", „Fr 30.10." oder „ueberfaellig · Di 16.09.".
 */

const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const TAG_MS = 86400000;

export type Faelligkeit = {
	/** Anzeigefertiger Text; leer, wenn kein oder ein unlesbares Datum vorliegt. */
	text: string;
	ueberfaellig: boolean;
};

function zz(n: number): string {
	return String(n).padStart(2, '0');
}

/**
 * Liest den gespeicherten Wert als LOKALES Datum.
 *
 * `new Date('2026-09-20')` liest eine reine Datumsangabe als UTC-Mitternacht;
 * westlich von Greenwich kippt sie damit auf den Vortag. Deshalb wird dieser
 * Fall von Hand zerlegt. Angaben mit Uhrzeit liest der Browser korrekt.
 */
function lies(wert: string): { datum: Date; hatZeit: boolean } | null {
	const nurDatum = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert.trim());
	if (nurDatum) {
		const datum = new Date(Number(nurDatum[1]), Number(nurDatum[2]) - 1, Number(nurDatum[3]));
		return Number.isNaN(datum.getTime()) ? null : { datum, hatZeit: false };
	}
	const datum = new Date(wert);
	if (Number.isNaN(datum.getTime())) return null;
	// Mitternacht gilt als „ohne Uhrzeit" — so speichert der Datumswaehler
	// einen Tag ohne Termin.
	return { datum, hatZeit: datum.getHours() !== 0 || datum.getMinutes() !== 0 };
}

/** „Sa 20.09." */
function tagUndMonat(d: Date): string {
	return `${TAGE[d.getDay()]} ${zz(d.getDate())}.${zz(d.getMonth() + 1)}.`;
}

/** Ganze Tage zwischen zwei Zeitpunkten, Tagesgrenzen lokal. */
function tagesAbstand(a: Date, b: Date): number {
	const tagA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
	const tagB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
	return Math.round((tagA - tagB) / TAG_MS);
}

/**
 * Faelligkeit fuer die Aufgabenzeile.
 *
 * Ueberfaellig wird tageweise entschieden: eine Aufgabe, die heute um 12:00
 * faellig war, bleibt bis Mitternacht „heute 12:00" und wird erst morgen rot.
 */
export function formatFaellig(
	wert: string | null | undefined,
	jetzt: Date = new Date()
): Faelligkeit {
	if (!wert) return { text: '', ueberfaellig: false };
	const gelesen = lies(wert);
	if (!gelesen) return { text: '', ueberfaellig: false };

	const { datum, hatZeit } = gelesen;
	const uhrzeit = hatZeit ? `${zz(datum.getHours())}:${zz(datum.getMinutes())}` : '';
	const abstand = tagesAbstand(datum, jetzt);

	if (abstand < 0) {
		return { text: `überfällig · ${tagUndMonat(datum)}`, ueberfaellig: true };
	}
	if (abstand === 0) return { text: uhrzeit ? `heute ${uhrzeit}` : 'heute', ueberfaellig: false };
	if (abstand === 1) return { text: uhrzeit ? `morgen ${uhrzeit}` : 'morgen', ueberfaellig: false };
	return {
		text: uhrzeit ? `${tagUndMonat(datum)} · ${uhrzeit}` : tagUndMonat(datum),
		ueberfaellig: false
	};
}

/**
 * Vergangene Zeit fuer die Herkunftszeile („von Ingo · gerade eben").
 * Aeltere Eintraege als gestern bekommen wieder Tag und Monat — nie ISO.
 */
export function formatSeit(wert: string | null | undefined, jetzt: Date = new Date()): string {
	if (!wert) return '';
	const gelesen = lies(wert);
	if (!gelesen) return '';

	const { datum } = gelesen;
	const sekunden = Math.floor((jetzt.getTime() - datum.getTime()) / 1000);
	if (sekunden < 0) return tagUndMonat(datum);
	if (sekunden < 60) return 'gerade eben';
	if (sekunden < 3600) return `vor ${Math.floor(sekunden / 60)} Min.`;

	const abstand = tagesAbstand(datum, jetzt);
	if (abstand === 0) return `vor ${Math.floor(sekunden / 3600)} Std.`;
	if (abstand === -1) return 'gestern';
	return tagUndMonat(datum);
}
