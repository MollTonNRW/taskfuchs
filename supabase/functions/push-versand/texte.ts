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

// Kürzt auf höchstens `max` Zeichen (Codepoints, damit Emoji-Paare nicht zerrissen werden);
// Whitespace wird zusammengezogen, Kürzung endet auf „…“.
function kuerzen(s: string, max: number): string {
	const t = s.replace(/\s+/g, ' ').trim();
	const zeichen = Array.from(t);
	if (zeichen.length <= max) return t;
	return zeichen.slice(0, max - 1).join('').trimEnd() + '…';
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
