/**
 * Einkaufs-Modus — Aktionen auf einer Einkaufsliste.
 *
 * Bewusst ohne Runes und ohne Datenbank: alles laeuft ueber die Primitive
 * des Task-Stores (`aendereAufgaben`, `fuegeEin`, …), die hier als `deps`
 * hereinkommen. Dadurch ist das Modul mit einem In-Memory-Fake testbar.
 */
import type { Database, ListKind } from '$lib/types/database';
import { artikelZustand, findeArtikel, findeKategorie, istSonstiges } from '$lib/utils/einkauf';

type Task = Database['public']['Tables']['tasks']['Row'];
type List = Database['public']['Tables']['lists']['Row'];

export type EinkaufDeps = {
	readonly tasks: Task[];
	readonly lists: List[];
	aendereAufgaben(
		patches: { id: string; felder: Partial<Task> }[],
		opt?: { leise?: boolean; ruecknahme?: boolean }
	): Promise<boolean>;
	fuegeEin(zeile: { list_id: string; text: string; parent_id?: string | null; type?: 'task' | 'divider'; position?: number }): Promise<Task | null>;
	setzeListenart(listId: string, kind: ListKind): Promise<boolean>;
	loescheMitUndo(geloescht: Task[], meldung: string, nachUndo?: () => Promise<void>): Promise<void>;
	entferne(zeilen: Task[]): Promise<boolean>;
	toast: {
		undo(message: string, onUndo: () => void): unknown;
		aktion(message: string, label: string, onAktion: () => void): unknown;
		show(message: string): void;
	};
};

export type HinzufuegenErgebnis = {
	art: 'neu' | 'reaktiviert' | 'schon-da';
	artikelId: string | null;
	kategorieName: string | null;
};

export function createEinkauf(deps: EinkaufDeps) {
	/** Laufende Anlage von „Sonstiges" je Liste — verhindert Doppelte bei schnellen Aufrufen. */
	const sonstigesUnterwegs = new Map<string, Promise<Task | null>>();
	/**
	 * Kategorien, die `kategorieLoeschen` gerade abbaut. Zwischen dem
	 * Umhaengen ihrer Artikel und dem Loeschen wartet es auf den Server; in
	 * dieser Luecke laeuft der Einsortier-Effekt ueber die frisch losen
	 * Artikel. Haengte er sie zurueck, naehme der Server sie beim Loeschen
	 * mit (on delete cascade) — und das Rueckgaengig kennt sie nicht.
	 */
	const wirdGeloescht = new Set<string>();

	function zeilenVon(listId: string): Task[] {
		return deps.tasks.filter((t) => t.list_id === listId);
	}

	function kategorienVon(listId: string): Task[] {
		return zeilenVon(listId)
			.filter((t) => !t.parent_id && t.type === 'divider')
			.sort((a, b) => a.position - b.position);
	}

	/**
	 * Alle Artikel einer Liste — jede Zeile, die kein Trenner ist, auf jeder
	 * Ebene. Dieselbe Menge, die die Ansicht zeigt (`einkaufsAnsicht`) und die
	 * Navigation zaehlt: auch Kinder einer Nicht-Kategorie (eine Aufgabe mit
	 * Unteraufgaben, in die Liste verschoben) sind Artikel.
	 */
	function artikelVon(listId: string): Task[] {
		return zeilenVon(listId).filter((t) => t.type !== 'divider');
	}

	/** Zeilen, unter denen etwas haengt — die sind nie ein einzelner Artikel. */
	function elternIn(zeilen: Task[]): Set<string> {
		return new Set(zeilen.filter((t) => t.parent_id).map((t) => t.parent_id!));
	}

	function naechstePosition(listId: string, parentId: string | null): number {
		const geschwister = zeilenVon(listId).filter((t) => (t.parent_id ?? null) === parentId);
		return geschwister.reduce((m, t) => Math.max(m, t.position + 1), 0);
	}

	async function sonstigesSicherstellen(listId: string): Promise<Task | null> {
		// Erst die laufende Anlage abwarten, dann im Bestand suchen: der Store
		// stellt die neue Zeile sofort (optimistisch) hinein. Faende der zweite
		// Aufruf sie dort, haengte er seinen Artikel an eine Kategorie, die der
		// Server noch nicht kennt — der Insert scheitert am Fremdschluessel.
		const laeuft = sonstigesUnterwegs.get(listId);
		if (laeuft) return laeuft;
		const da = kategorienVon(listId).find((k) => istSonstiges(k.text));
		if (da) return da;
		const neu = deps.fuegeEin({
			list_id: listId,
			text: 'Sonstiges',
			type: 'divider',
			position: naechstePosition(listId, null)
		});
		sonstigesUnterwegs.set(listId, neu);
		try {
			return await neu;
		} finally {
			sonstigesUnterwegs.delete(listId);
		}
	}

	async function artikelHinzufuegen(listId: string, text: string): Promise<HinzufuegenErgebnis> {
		const name = text.trim();
		if (!name) return { art: 'schon-da', artikelId: null, kategorieName: null };
		const vorhanden = findeArtikel(name, artikelVon(listId));
		if (vorhanden) {
			const kategorie = deps.tasks.find((t) => t.id === vorhanden.parent_id)?.text ?? null;
			if (artikelZustand(vorhanden) === 'offen') {
				return { art: 'schon-da', artikelId: vorhanden.id, kategorieName: kategorie };
			}
			await deps.aendereAufgaben([{ id: vorhanden.id, felder: { done: false, abgelegt: false } }]);
			return { art: 'reaktiviert', artikelId: vorhanden.id, kategorieName: kategorie };
		}
		const ziel = findeKategorie(name, kategorienVon(listId)) ?? (await sonstigesSicherstellen(listId));
		if (!ziel) return { art: 'schon-da', artikelId: null, kategorieName: null };
		const neu = await deps.fuegeEin({
			list_id: listId,
			text: name,
			parent_id: ziel.id,
			position: naechstePosition(listId, ziel.id)
		});
		return { art: 'neu', artikelId: neu?.id ?? null, kategorieName: ziel.text };
	}

	/** Tippen auf einen Artikel: offen <-> Wagen; ein abgelegter kommt wieder auf die Liste. */
	async function artikelUmschalten(id: string) {
		const t = deps.tasks.find((x) => x.id === id);
		if (!t) return;
		const z = artikelZustand(t);
		const felder: Partial<Task> =
			z === 'offen' ? { done: true, abgelegt: false } : { done: false, abgelegt: false };
		await deps.aendereAufgaben([{ id, felder }]);
	}

	async function wiederDrauf(id: string) {
		await deps.aendereAufgaben([{ id, felder: { done: false, abgelegt: false } }]);
	}

	async function einkaufFertig(listId: string): Promise<number> {
		const imWagen = artikelVon(listId).filter((t) => artikelZustand(t) === 'wagen');
		if (imWagen.length === 0) return 0;
		// Ein Feldsatz fuer alle: EIN Request, auf dem Server ganz oder gar nicht.
		const ok = await deps.aendereAufgaben(imWagen.map((t) => ({ id: t.id, felder: { abgelegt: true } })));
		if (!ok) return 0;
		const ids = imWagen.map((t) => t.id);
		deps.toast.undo(
			imWagen.length === 1 ? 'Ein Artikel abgelegt' : `${imWagen.length} Artikel abgelegt`,
			() => {
				void deps.aendereAufgaben(ids.map((id) => ({ id, felder: { abgelegt: false } })));
			}
		);
		return imWagen.length;
	}

	async function kategorieWechseln(artikelId: string, kategorieId: string) {
		const a = deps.tasks.find((t) => t.id === artikelId);
		if (!a || a.parent_id === kategorieId) return;
		// Eine Zeile mit Unterpunkten ist kein Artikel — unter einer Kategorie
		// stuenden ihre Kinder auf der dritten Ebene.
		if (deps.tasks.some((t) => t.parent_id === artikelId)) {
			deps.toast.show('Einträge mit Unterpunkten bleiben ohne Kategorie');
			return;
		}
		await deps.aendereAufgaben([
			{ id: artikelId, felder: { parent_id: kategorieId, position: naechstePosition(a.list_id, kategorieId) } }
		]);
	}

	/**
	 * Kategorie per Ziehen an eine neue Stelle — `zielIndex` ist die
	 * Einfuegestelle in der Reihenfolge MIT der gezogenen Kategorie (0 = vor
	 * der ersten, n = hinter der letzten), wie sie die Oberflaeche misst.
	 * Die Kategorien bekommen fortlaufende Positionen ab ihrer bisher
	 * kleinsten; lose Zeilen der obersten Ebene bleiben, wo sie sind.
	 */
	async function kategorieVerschieben(kategorieId: string, zielIndex: number) {
		const k = deps.tasks.find((t) => t.id === kategorieId);
		if (!k || k.type !== 'divider' || k.parent_id) return;
		const alle = kategorienVon(k.list_id);
		const von = alle.findIndex((t) => t.id === kategorieId);
		const rest = alle.filter((t) => t.id !== kategorieId);
		const ziel = Math.max(0, Math.min(zielIndex > von ? zielIndex - 1 : zielIndex, rest.length));
		if (ziel === von) return;
		rest.splice(ziel, 0, k);
		const start = Math.min(...alle.map((t) => t.position));
		const patches = rest
			.map((t, i) => ({ id: t.id, alt: t.position, position: start + i }))
			.filter((p) => p.alt !== p.position)
			.map((p) => ({ id: p.id, felder: { position: p.position } }));
		await deps.aendereAufgaben(patches);
	}

	async function kategorieAnlegen(listId: string, name: string): Promise<Task | null> {
		const text = name.trim();
		if (!text) return null;
		return deps.fuegeEin({ list_id: listId, text, type: 'divider', position: naechstePosition(listId, null) });
	}

	/**
	 * Artikel wandern nach „Sonstiges", dann faellt die Kategorie. Das
	 * Rueckgaengig im Toast nimmt BEIDES zurueck — darum ohne Rueckfrage
	 * (ein Bestaetigungsdialog steht nur, wo es kein Rueckgaengig gibt).
	 */
	async function kategorieLoeschen(kategorieId: string): Promise<boolean> {
		wirdGeloescht.add(kategorieId);
		try {
			return await kategorieAbbauen(kategorieId);
		} finally {
			wirdGeloescht.delete(kategorieId);
		}
	}

	/** Der Ablauf von `kategorieLoeschen` — nur von dort, damit `wirdGeloescht` stimmt. */
	async function kategorieAbbauen(kategorieId: string): Promise<boolean> {
		const k = deps.tasks.find((t) => t.id === kategorieId);
		if (!k) return false;
		const kinder = deps.tasks.filter((t) => t.parent_id === kategorieId);
		const vorher = new Set(kategorienVon(k.list_id).map((t) => t.id));
		let ziel: Task | null = null;
		if (kinder.length > 0) {
			if (!istSonstiges(k.text)) {
				ziel = await sonstigesSicherstellen(k.list_id);
				// „Sonstiges" liess sich nicht anlegen (Netz): NICHT loeschen —
				// sonst naehme der Server die Artikel mit (on delete cascade).
				if (!ziel) return false;
			}
			// Umhaengen als EIN Request (ein Feldsatz): alle oder keiner.
			// „Sonstiges" selbst loeschen: Artikel auf die oberste Ebene (Ohne Kategorie).
			const zielId = ziel?.id ?? null;
			const ok = await deps.aendereAufgaben(kinder.map((t) => ({ id: t.id, felder: { parent_id: zielId } })));
			if (!ok) return false;
			if (ziel) {
				// Ans Ende der Zielkategorie. Scheitert das, stimmt nur die
				// Reihenfolge nicht — darum ohne Ruecknahme.
				let pos = naechstePosition(k.list_id, ziel.id);
				await deps.aendereAufgaben(
					kinder.map((t) => ({ id: t.id, felder: { position: pos++ } })),
					{ leise: true, ruecknahme: false }
				);
			}
		}
		const zielId = ziel?.id ?? null;
		const sonstigesNeu = ziel && !vorher.has(ziel.id) ? ziel.id : null;

		// Rueckgaengig — laeuft, wenn die Kategorie wieder auf dem Server steht.
		// Zurueck an den alten Platz nur, was noch dort steht, wo das Loeschen es
		// hingestellt hat; was inzwischen jemand umgehaengt hat, bleibt. Ein nur
		// dafuer angelegtes „Sonstiges" faellt wieder weg, solange es leer ist.
		async function zuruecknehmen() {
			const zurueck = kinder.filter((a) =>
				deps.tasks.some((t) => t.id === a.id && (t.parent_id ?? null) === zielId)
			);
			if (zurueck.length > 0) {
				const ok = await deps.aendereAufgaben(
					zurueck.map((a) => ({ id: a.id, felder: { parent_id: kategorieId } }))
				);
				if (!ok) return;
				await deps.aendereAufgaben(
					zurueck.map((a) => ({ id: a.id, felder: { position: a.position } })),
					{ leise: true, ruecknahme: false }
				);
			}
			if (!sonstigesNeu || deps.tasks.some((t) => t.parent_id === sonstigesNeu)) return;
			const leer = deps.tasks.find((t) => t.id === sonstigesNeu);
			if (leer) await deps.entferne([leer]);
		}

		await deps.loescheMitUndo(
			[deps.tasks.find((t) => t.id === kategorieId) ?? k],
			'Kategorie gelöscht',
			zuruecknehmen
		);
		return true;
	}

	/**
	 * Zeilen ohne Kategorie (von n8n, G2, anderem Geraet) einsortieren.
	 *
	 * Nur per Stichwort — KEIN Rueckfall auf „Sonstiges": dorthin zeigt das
	 * Hintergrund-Einsortieren nie. Loescht ein zweites Geraet gerade
	 * „Sonstiges", werden dessen Artikel kurz lose; haengte dieses Geraet sie
	 * per Rueckfall zurueck und kaeme sein Schreiben vor dem Loeschen an, naehme
	 * die Kaskade (tasks.parent_id on delete cascade) sie auf dem Server mit.
	 * Eine Stichwort-Kategorie wird dabei nie geloescht. Ohne Treffer bleibt
	 * eine Zeile „Ohne Kategorie".
	 *
	 * Nimmt nur Zeilen OHNE Kinder: eine Zeile mit Unteraufgaben ist nie ein
	 * Artikel (z. B. eine auf einem anderen Geraet gerade wieder zur Aufgabe
	 * gewordene Kategorie, oder eine hierher verschobene Aufgabe mit
	 * Unteraufgaben). Unter eine Kategorie gehaengt, stuenden ihre Kinder
	 * sonst auf der dritten Ebene.
	 *
	 * Legt NIE Kategorien an (Ruling R4) und zielt nie auf eine, die gerade
	 * geloescht wird.
	 */
	async function ohneKategorieEinsortieren(listId: string) {
		const kategorien = kategorienVon(listId).filter((k) => !wirdGeloescht.has(k.id));
		if (kategorien.length === 0) return;
		const zeilen = zeilenVon(listId);
		const eltern = elternIn(zeilen);
		const lose = zeilen.filter((t) => !t.parent_id && t.type === 'task' && !eltern.has(t.id));
		const patches: { id: string; felder: Partial<Task> }[] = [];
		const naechste = new Map<string, number>();
		for (const t of lose) {
			const ziel = findeKategorie(t.text, kategorien);
			if (!ziel) continue;
			const pos = naechste.get(ziel.id) ?? naechstePosition(listId, ziel.id);
			naechste.set(ziel.id, pos + 1);
			patches.push({ id: t.id, felder: { parent_id: ziel.id, position: pos } });
		}
		if (patches.length > 0) await deps.aendereAufgaben(patches, { leise: true });
	}

	/**
	 * Listentyp wechseln — beide Richtungen verlustfrei (Spezifikation
	 * „Listentyp umschalten"), auch im Rundlauf:
	 *
	 * - Artikelzustaende (`done`, `abgelegt`) fasst der Wechsel NIE an. In
	 *   einer Aufgabenliste ist ein abgelegter Artikel eine erledigte
	 *   Unteraufgabe wie einer im Wagen; zurueck in der Einkaufsliste steht
	 *   jeder wieder, wo er war. Frueher setzte der Hinweg `abgelegt=false` und
	 *   der Rueckweg jede erledigte Unteraufgabe auf abgelegt — „im Wagen" ging
	 *   im Rundlauf verloren. Eine erstmals umgestellte Liste hat ihre
	 *   erledigten Unteraufgaben darum im Wagen; „Einkauf fertig" legt sie ab.
	 * - Nur Kategorien MIT Artikeln werden Aufgaben. Eine leere bleibt Trenner
	 *   — in der Aufgabenliste eine Zwischenueberschrift, zurueck wieder
	 *   Kategorie. Als Aufgabe ohne Unteraufgaben kaeme sie als Artikel zurueck.
	 * - Jede Richtung ist EIN Request fuer die Zeilen (ein Feldsatz) plus
	 *   einer fuer die Liste; scheitert der zweite, wird der erste
	 *   zurueckgestellt.
	 */
	async function listeUmstellen(listId: string, kind: ListKind): Promise<boolean> {
		const zeilen = zeilenVon(listId);
		const eltern = elternIn(zeilen);
		if (kind === 'einkauf') {
			const neu = zeilen.filter((t) => !t.parent_id && t.type === 'task' && eltern.has(t.id));
			const alsTyp = (type: 'task' | 'divider') => neu.map((t) => ({ id: t.id, felder: { type } }));
			if (!(await deps.aendereAufgaben(alsTyp('divider')))) return false;
			if (!(await deps.setzeListenart(listId, 'einkauf'))) {
				// Trenner mit Unteraufgaben kann eine Aufgabenliste nicht zeigen.
				await deps.aendereAufgaben(alsTyp('task'));
				return false;
			}
			await ohneKategorieEinsortieren(listId);
			return true;
		}
		// Erst die Listenart: andere Geraete schalten ihren Einsortier-Effekt
		// ab, BEVOR Kategorien zu Aufgaben werden (Realtime kommt je Zeile).
		if (!(await deps.setzeListenart(listId, 'aufgaben'))) return false;
		const kategorien = zeilen.filter((t) => !t.parent_id && t.type === 'divider' && eltern.has(t.id));
		const ok = await deps.aendereAufgaben(kategorien.map((t) => ({ id: t.id, felder: { type: 'task' } })));
		if (!ok) {
			await deps.setzeListenart(listId, 'einkauf');
			return false;
		}
		return true;
	}

	return {
		kategorienVon,
		artikelHinzufuegen,
		artikelUmschalten,
		wiederDrauf,
		einkaufFertig,
		kategorieWechseln,
		kategorieVerschieben,
		kategorieAnlegen,
		kategorieLoeschen,
		ohneKategorieEinsortieren,
		listeUmstellen
	};
}
export type Einkauf = ReturnType<typeof createEinkauf>;
