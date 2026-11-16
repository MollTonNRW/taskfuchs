// texte.ts — deutsche Meldungstexte (Spec: Texte). Rein, ohne I/O.
import type { Art, Buendel, Tagesmeldung, Termin, Verdichtet } from './typen.ts';

export interface Nachricht {
	titel: string;
	text: string;
	tag: string;
	url: string;
}

const MAX_TEXT = 180;
const MAX_AUFGABE = 60;
const MAX_NAME = 40;
const MAX_TITEL = 60;

const VERB = {
	aufgaben: {
		neu: 'hinzugefügt',
		erledigt: 'erledigt',
		wieder_offen: 'wieder geöffnet',
		geaendert: 'geändert',
		geloescht: 'gelöscht',
	},
	einkauf: {
		neu: 'hinzugefügt',
		erledigt: 'in den Wagen gelegt',
		wieder_offen: 'wieder auf die Liste gesetzt',
		geaendert: 'geändert',
		geloescht: 'gelöscht',
	},
} as const satisfies Record<string, Record<Art, string>>;

const LABEL = {
	aufgaben: {
		neu: 'neu',
		erledigt: 'erledigt',
		wieder_offen: 'wieder offen',
		geaendert: 'geändert',
		geloescht: 'gelöscht',
	},
	einkauf: {
		neu: 'neu',
		erledigt: 'in den Wagen',
		wieder_offen: 'wieder auf der Liste',
		geaendert: 'geändert',
		geloescht: 'gelöscht',
	},
} as const satisfies Record<string, Record<Art, string>>;

const REIHENFOLGE: Art[] = ['neu', 'erledigt', 'wieder_offen', 'geaendert', 'geloescht'];

const SEGMENTER = typeof Intl.Segmenter === 'function'
	? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
	: null;

// Lazy: bricht kuerzen() früh ab, wird auch ein sehr langer Listentitel nicht komplett segmentiert.
function* graphemes(t: string): Generator<string> {
	if (!SEGMENTER) return yield* Array.from(t);
	for (const x of SEGMENTER.segment(t)) yield x.segment;
}

// Kürzt auf höchstens `max` Codepoints (harte Grenze, auch bei riesigen Graphemen) und schneidet nie in ein
// Graphem (ZWJ-Emoji, Flaggen, Kombinationszeichen): was nicht ganz passt, entfällt ganz.
// Whitespace wird zusammengezogen, Kürzung endet auf „…“. Null/undefined (kaputte Daten) ergibt "".
function kuerzen(s: string | null | undefined, max: number): string {
	const t = String(s ?? '').replace(/\s+/g, ' ').trim();
	if (Array.from(t).length <= max) return t;
	let aus = '';
	let belegt = 0;
	for (const g of graphemes(t)) {
		const n = Array.from(g).length;
		if (belegt + n > max - 1) break;
		aus += g;
		belegt += n;
	}
	return aus.trimEnd() + '…';
}

export function nachrichtBauen(b: Buendel, v: Verdichtet): Nachricht | null {
	if (v.gesamt === 0) return null;
	const art = b.list_kind === 'einkauf' ? 'einkauf' : 'aufgaben';
	const wer = `${kuerzen(b.actor_name || 'Jemand', MAX_NAME) || 'Jemand'}${b.via_agent ? ' (Agent)' : ''}`;

	let text: string;
	if (v.einzig) {
		const aufgabe = kuerzen(v.einzig.text, MAX_AUFGABE);
		text = `${wer} hat ${aufgabe ? `„${aufgabe}“` : 'eine Aufgabe'} ${VERB[art][v.einzig.art]}`;
	} else {
		const teile = REIHENFOLGE.filter((a) => v.anzahl[a] > 0).map((a) => {
			const basis = `${v.anzahl[a]} ${LABEL[art][a]}`;
			if (a !== 'neu' || v.beispiele.neu.length === 0) return basis;
			return `${basis} (${v.beispiele.neu.map((t) => kuerzen(t, MAX_AUFGABE)).join(', ')})`;
		});
		text = `${wer}: ${teile.join(', ')}`;
	}

	return {
		titel: kuerzen(b.list_title || 'Taskfuchs', MAX_TITEL) || 'Taskfuchs',
		text: kuerzen(text, MAX_TEXT),
		tag: `tf-${b.list_id}-${b.actor_id}`,
		url: `/app?liste=${encodeURIComponent(b.list_id)}`,
	};
}

// ---------------------------------------------------------------------------
// Erinnerungen an Fristen (Migration 028)
// ---------------------------------------------------------------------------

const MAX_BEISPIELE = 3;

/** „2026-11-19T09:00“ → „09:00“; ohne (gültige) Uhrzeit null. */
function uhrzeit(due: string | null | undefined): string | null {
	const m = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(String(due ?? ''));
	if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
	return `${m[1]}:${m[2]}`;
}

/** Kalendertag „YYYY-MM-DD“ einer Frist (nur die Form, die Datenbank hat schon gefiltert). */
function kalendertag(due: string | null | undefined): string {
	const t = String(due ?? '').slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

function dauer(minuten: number): string {
	if (minuten % 60 === 0) {
		const stunden = minuten / 60;
		return stunden === 1 ? 'einer Stunde' : `${stunden} Stunden`;
	}
	return `${minuten} Minuten`;
}

/**
 * Tagesmeldung: „Heute fällig“ (sonst „Überfällig“, sonst „Morgen fällig“), im Text bis zu drei
 * Aufgaben der wichtigsten Gruppe, danach die übrigen als Zahl. Tipp öffnet die Liste, wenn alle
 * Aufgaben in einer liegen, sonst die Ansicht „Dringend“ (heute fällig und überfällig).
 */
export function tagesNachricht(t: Tagesmeldung): Nachricht | null {
	const heute = kalendertag(t.heute);
	const aufgaben = (t.aufgaben ?? []).filter((a) => a && kalendertag(a.due_date) !== '');
	if (!heute || aufgaben.length === 0) return null;

	const ueber = aufgaben.filter((a) => kalendertag(a.due_date) < heute);
	const jetzt = aufgaben.filter((a) => kalendertag(a.due_date) === heute);
	const morgen = aufgaben.filter((a) => kalendertag(a.due_date) > heute);
	const haupt = jetzt.length > 0 ? jetzt : ueber.length > 0 ? ueber : morgen;
	const titel = jetzt.length > 0 ? 'Heute fällig' : ueber.length > 0 ? 'Überfällig' : 'Morgen fällig';

	const beispiele = haupt.slice(0, MAX_BEISPIELE).map((a) => {
		const name = kuerzen(a.text, MAX_AUFGABE) || 'Aufgabe';
		const zeit = uhrzeit(a.due_date);
		return zeit ? `„${name}“ (${zeit})` : `„${name}“`;
	});
	const zusatz: string[] = [];
	if (haupt !== ueber && ueber.length > 0) zusatz.push(`${ueber.length} überfällig`);
	if (haupt !== morgen && morgen.length > 0) zusatz.push(`${morgen.length} morgen`);
	// Die Datenbank liefert höchstens 20 Aufgaben, `anzahl` zählt alle: der Rest zählt zur Hauptgruppe
	const gesamt = Math.max(Number(t.anzahl) || 0, aufgaben.length);
	const sonstige = (haupt !== ueber ? ueber.length : 0) + (haupt !== morgen ? morgen.length : 0);
	const weitere = Math.max(0, gesamt - beispiele.length - sonstige);
	const kopf = weitere > 0 ? `${beispiele.join(', ')} und ${weitere} weitere` : beispiele.join(', ');

	const listen = new Set(aufgaben.map((a) => a.list_id));
	const eineListe = listen.size === 1 ? [...listen][0] : null;
	return {
		titel,
		text: kuerzen([kopf, ...zusatz].join(' · '), MAX_TEXT),
		tag: `tf-frist-${heute}`,
		url: eineListe ? `/app?liste=${encodeURIComponent(eineListe)}` : '/app?ansicht=dringend',
	};
}

/**
 * Termin: Titel ist die Aufgabe, Text etwa „In 30 Minuten, um 09:00 · Familie“.
 * Pünktlich (bis 2 Minuten nach dem Erinnerungszeitpunkt) nennt der Text den Vorlauf; kommt die
 * Meldung später (Ausfall), nennt er nur die Uhrzeit: „Um 09:00 fällig“, ab der Frist „Jetzt, 09:00“,
 * ab 5 Minuten danach „Seit 09:00 fällig“.
 */
export function terminNachricht(t: Termin): Nachricht | null {
	const zeit = uhrzeit(t.due_date);
	if (!zeit) return null;
	const vorlauf = Math.max(0, Number(t.vorlauf) || 0);
	const roh = Number(t.minuten_bis);
	const bis = Number.isFinite(roh) ? roh : vorlauf;
	let wann: string;
	if (bis > 0 && bis >= vorlauf - 2) wann = `In ${dauer(vorlauf)}, um ${zeit}`;
	else if (bis > 0) wann = `Um ${zeit} fällig`;
	else if (bis > -5) wann = `Jetzt, ${zeit}`;
	else wann = `Seit ${zeit} fällig`;
	const liste = kuerzen(t.list_title, MAX_TITEL);
	return {
		titel: kuerzen(t.text, MAX_TITEL) || 'Aufgabe',
		text: kuerzen(liste ? `${wann} · ${liste}` : wann, MAX_TEXT),
		tag: `tf-termin-${t.task_id}`,
		url: `/app?liste=${encodeURIComponent(t.list_id)}`,
	};
}
