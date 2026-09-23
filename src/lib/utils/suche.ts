import type { Database } from '$lib/types/database';
import { timeframeLabels } from '$lib/constants';

type Task = Database['public']['Tables']['tasks']['Row'];
type List = Database['public']['Tables']['lists']['Row'];

/**
 * Suche ueber alle Listen — Spezifikation Abschnitt 6.
 *
 * Gesucht wird in DREI Quellen: Aufgabentiteln, Unteraufgaben und Notizen.
 * Die alte Fassung (`components/v2/SearchOverlay.svelte`) kannte nur Titel
 * und Notiz, zeigte die Notiz aber nirgends an — ein Treffer aus einer Notiz
 * war von einem Titeltreffer nicht zu unterscheiden. Deshalb traegt jeder
 * Treffer hier seine Herkunft mit: `quelle` fuer die Logik, `pfad` als
 * fertige Zeile fuer die Oberflaeche.
 *
 * Die Fundstelle wird nicht als Index zurueckgegeben, sondern als bereits
 * zerlegtes `Stueck` (vor / treffer / nach). Die Oberflaeche setzt daraus
 * `<mark>` — ohne Regex im Markup und ohne `{@html}`.
 */

export type Quelle = 'titel' | 'unteraufgabe' | 'notiz';

/** Ein Text mit genau einer markierten Fundstelle. `treffer` leer = keine. */
export type Stueck = { vor: string; treffer: string; nach: string };

export type Treffer = {
	/**
	 * Die Aufgabe, die beim Oeffnen markiert wird. Bei einem Treffer in einer
	 * Unteraufgabe ist das die ELTERNaufgabe — Unteraufgaben haben kein
	 * eigenes Detail, `nav.selectTask` erwartet eine Aufgabe oberster Ebene.
	 */
	task: Task;
	listId: string;
	listName: string;
	/** Listen-Symbol (Emoji) fuer die linke Seite der Trefferzeile. */
	emoji: string;
	quelle: Quelle;
	/** Titelzeile des Treffers — bei `unteraufgabe` der Text der Unteraufgabe. */
	titel: Stueck;
	/** Herkunftszeile darunter; bei `notiz` steckt die Fundstelle hier. */
	pfad: Stueck;
	/** Stabiler Schluessel: eine Aufgabe kann mehrfach treffen. */
	id: string;
};

export type Suchergebnis = { offen: Treffer[]; erledigt: Treffer[] };

/** Unter zwei Zeichen traefe jede Eingabe fast alles. */
export const MIN_ZEICHEN = 2;

/** Obergrenze je Abschnitt — die Palette soll blaetterbar bleiben. */
const MAX_TREFFER = 40;

/** Zeichen, die der Notiz-Ausschnitt vor und nach der Fundstelle mitnimmt. */
const UMFELD_VOR = 24;
const UMFELD_NACH = 44;

const LEER: Suchergebnis = { offen: [], erledigt: [] };

function roh(text: string): Stueck {
	return { vor: text, treffer: '', nach: '' };
}

/** Fundstelle im vollen Text markieren, sonst `null`. */
function markiere(text: string, begriff: string): Stueck | null {
	const i = text.toLowerCase().indexOf(begriff);
	if (i < 0) return null;
	return {
		vor: text.slice(0, i),
		treffer: text.slice(i, i + begriff.length),
		nach: text.slice(i + begriff.length)
	};
}

/**
 * Ausschnitt aus einer mehrzeiligen Notiz: Zeilenumbrueche werden zu
 * Leerzeichen, links und rechts wird auf ein Umfeld gekuerzt. Abgeschnittene
 * Seiten bekommen Auslassungspunkte („… ELSTER-Login liegt im …").
 */
function ausschnitt(text: string, begriff: string): Stueck | null {
	const flach = text.replace(/\s+/g, ' ').trim();
	const i = flach.toLowerCase().indexOf(begriff);
	if (i < 0) return null;
	let von = Math.max(0, i - UMFELD_VOR);
	let bis = Math.min(flach.length, i + begriff.length + UMFELD_NACH);
	// An Wortgrenzen schneiden. Der feste Abstand traf sonst mitten in ein
	// Wort und die Trefferzeile begann mit einem Rumpf („… üge Q4 fehlen
	// noch, der ELSTER-Login …").
	if (von > 0) {
		const luecke = flach.indexOf(' ', von);
		if (luecke >= 0 && luecke < i) von = luecke + 1;
	}
	if (bis < flach.length) {
		const luecke = flach.lastIndexOf(' ', bis);
		if (luecke > i + begriff.length) bis = luecke;
	}
	return {
		vor: (von > 0 ? '… ' : '') + flach.slice(von, i),
		treffer: flach.slice(i, i + begriff.length),
		nach: flach.slice(i + begriff.length, bis) + (bis < flach.length ? ' …' : '')
	};
}

/** Text eines Stuecks ohne Markierung — fuer Titel-Attribute. */
export function klartext(s: Stueck): string {
	return s.vor + s.treffer + s.nach;
}

/**
 * Pfadzeile eines Titeltreffers: dieselben Angaben wie die Metazeile der
 * Aufgabenzeile, nur als Text („Familie · Langfristig · 0/2", „Moll GmbH ·
 * Notiz"). Erledigte tragen statt dessen „· erledigt".
 *
 * Ein Datum steht hier bewusst NICHT: die Tabelle `tasks` fuehrt keinen
 * Erledigt-Zeitstempel (`updated_at` aendert sich bei jeder Bearbeitung),
 * und ein erfundenes Datum waere schlimmer als keines.
 */
function pfadMeta(task: Task, unteraufgaben: Task[], listName: string): string {
	const teile = [listName];
	if (task.done) {
		teile.push('erledigt');
		return teile.join(' · ');
	}
	if (task.timeframe) teile.push(timeframeLabels[task.timeframe] ?? task.timeframe);
	if (unteraufgaben.length > 0) {
		const fertig = unteraufgaben.filter((s) => s.done).length;
		teile.push(`${fertig}/${unteraufgaben.length}`);
	}
	if (task.note && task.note.trim()) teile.push('Notiz');
	return teile.join(' · ');
}

function sortiereNachPosition(a: Task, b: Task): number {
	return a.position - b.position;
}

/**
 * Sucht ueber alle Listen. `tasks` ist die flache Tabelle inklusive
 * Unteraufgaben (`parent_id` gesetzt) — die Zuordnung baut die Funktion
 * selbst, damit kein Aufrufer sie mitliefern muss.
 *
 * Reihenfolge ist die Reihenfolge des Bestands (Liste, dann Position). Eine
 * Aufgabe liefert hoechstens einen Titel- ODER Notiztreffer (der Titel
 * gewinnt) und zusaetzlich je einen Treffer pro passender Unteraufgabe.
 */
export function suchen(tasks: Task[], lists: List[], q: string): Suchergebnis {
	const begriff = q.trim().toLowerCase();
	if (begriff.length < MIN_ZEICHEN) return LEER;

	const listen = new Map(lists.map((l) => [l.id, l]));

	const kinder = new Map<string, Task[]>();
	for (const t of tasks) {
		if (!t.parent_id) continue;
		const bisher = kinder.get(t.parent_id);
		if (bisher) bisher.push(t);
		else kinder.set(t.parent_id, [t]);
	}
	for (const liste of kinder.values()) liste.sort(sortiereNachPosition);

	const offen: Treffer[] = [];
	const erledigt: Treffer[] = [];

	for (const task of tasks) {
		if (task.parent_id || task.type === 'divider') continue;
		const liste = listen.get(task.list_id);
		if (!liste) continue;

		const ziel = task.done ? erledigt : offen;
		if (ziel.length >= MAX_TREFFER) continue;

		const unter = kinder.get(task.id) ?? [];
		const gemeinsam = {
			task,
			listId: liste.id,
			listName: liste.title,
			emoji: liste.icon
		};

		const imTitel = markiere(task.text, begriff);
		if (imTitel) {
			ziel.push({
				...gemeinsam,
				quelle: 'titel',
				titel: imTitel,
				pfad: roh(pfadMeta(task, unter, liste.title)),
				id: `${task.id}:titel`
			});
		} else if (task.note) {
			const inNotiz = ausschnitt(task.note, begriff);
			if (inNotiz) {
				ziel.push({
					...gemeinsam,
					quelle: 'notiz',
					titel: roh(task.text),
					pfad: {
						vor: `Notiz: „${inNotiz.vor}`,
						treffer: inNotiz.treffer,
						nach: `${inNotiz.nach}“ · ${liste.title}`
					},
					id: `${task.id}:notiz`
				});
			}
		}

		for (const kind of unter) {
			if (ziel.length >= MAX_TREFFER) break;
			const imKind = markiere(kind.text, begriff);
			if (!imKind) continue;
			ziel.push({
				...gemeinsam,
				quelle: 'unteraufgabe',
				titel: imKind,
				pfad: roh(`Unteraufgabe von „${task.text}“ · ${liste.title}`),
				id: `${task.id}:${kind.id}`
			});
		}
	}

	return { offen, erledigt };
}

/**
 * Sektionslabel der mobilen Suche: „3 Treffer in 2 Listen".
 * „Treffer" ist im Deutschen formgleich, nur die Liste wird gebeugt.
 */
export function trefferLabel(treffer: Treffer[]): string {
	const listen = new Set(treffer.map((t) => t.listId)).size;
	return `${treffer.length} Treffer in ${listen} ${listen === 1 ? 'Liste' : 'Listen'}`;
}
