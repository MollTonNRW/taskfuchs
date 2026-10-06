// texte.ts — deutsche Meldungstexte (Spec: Texte). Rein, ohne I/O.
import type { Art, Buendel, Verdichtet } from './typen.ts';

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
