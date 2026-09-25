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
	aendereAufgaben(patches: { id: string; felder: Partial<Task> }[], opt?: { leise?: boolean }): Promise<boolean>;
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

	function zeilenVon(listId: string): Task[] {
		return deps.tasks.filter((t) => t.list_id === listId);
	}

	function kategorienVon(listId: string): Task[] {
		return zeilenVon(listId)
			.filter((t) => !t.parent_id && t.type === 'divider')
			.sort((a, b) => a.position - b.position);
	}

	function artikelVon(listId: string): Task[] {
		const kat = new Set(kategorienVon(listId).map((k) => k.id));
		return zeilenVon(listId).filter(
			(t) => t.type !== 'divider' && (!t.parent_id || kat.has(t.parent_id))
		);
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
		await deps.aendereAufgaben([
			{ id: artikelId, felder: { parent_id: kategorieId, position: naechstePosition(a.list_id, kategorieId) } }
		]);
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
		const k = deps.tasks.find((t) => t.id === kategorieId);
		if (!k) return false;
		const kinder = deps.tasks.filter((t) => t.parent_id === kategorieId);
		const vorher = new Set(kategorienVon(k.list_id).map((t) => t.id));
		let ziel: Task | null = null;
		if (kinder.length > 0) {
			if (!istSonstiges(k.text)) ziel = await sonstigesSicherstellen(k.list_id);
			if (!ziel) {
				// „Sonstiges" selbst loeschen: Artikel auf die oberste Ebene (Ohne Kategorie).
				const ok = await deps.aendereAufgaben(kinder.map((t) => ({ id: t.id, felder: { parent_id: null } })));
				if (!ok) return false;
			} else {
				let pos = naechstePosition(k.list_id, ziel.id);
				const ok = await deps.aendereAufgaben(
					kinder.map((t) => ({ id: t.id, felder: { parent_id: ziel!.id, position: pos++ } }))
				);
				if (!ok) return false;
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
					zurueck.map((a) => ({ id: a.id, felder: { parent_id: kategorieId, position: a.position } }))
				);
				if (!ok) return;
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

	/** Zeilen ohne Kategorie (von n8n, G2, anderem Geraet) einsortieren — legt NIE Kategorien an. */
	async function ohneKategorieEinsortieren(listId: string) {
		const kategorien = kategorienVon(listId);
		if (kategorien.length === 0) return;
		const sonst = kategorien.find((k) => istSonstiges(k.text)) ?? null;
		const lose = zeilenVon(listId).filter((t) => !t.parent_id && t.type === 'task');
		const patches: { id: string; felder: Partial<Task> }[] = [];
		const naechste = new Map<string, number>();
		for (const t of lose) {
			const ziel = findeKategorie(t.text, kategorien) ?? sonst;
			if (!ziel) continue;
			const pos = naechste.get(ziel.id) ?? naechstePosition(listId, ziel.id);
			naechste.set(ziel.id, pos + 1);
			patches.push({ id: t.id, felder: { parent_id: ziel.id, position: pos } });
		}
		if (patches.length > 0) await deps.aendereAufgaben(patches, { leise: true });
	}

	async function listeUmstellen(listId: string, kind: ListKind): Promise<boolean> {
		const zeilen = zeilenVon(listId);
		if (kind === 'einkauf') {
			const elternIds = new Set(zeilen.filter((t) => t.parent_id).map((t) => t.parent_id!));
			const patches: { id: string; felder: Partial<Task> }[] = [];
			for (const t of zeilen) {
				if (!t.parent_id && t.type === 'task' && elternIds.has(t.id)) {
					patches.push({ id: t.id, felder: { type: 'divider', done: false } });
				} else if (t.parent_id && t.done && !t.abgelegt) {
					patches.push({ id: t.id, felder: { abgelegt: true } });
				}
			}
			if (!(await deps.aendereAufgaben(patches))) return false;
			if (!(await deps.setzeListenart(listId, 'einkauf'))) return false;
			await ohneKategorieEinsortieren(listId);
			return true;
		}
		const patches: { id: string; felder: Partial<Task> }[] = [];
		for (const t of zeilen) {
			if (!t.parent_id && t.type === 'divider') patches.push({ id: t.id, felder: { type: 'task' } });
			else if (t.abgelegt) patches.push({ id: t.id, felder: { abgelegt: false } });
		}
		if (!(await deps.aendereAufgaben(patches))) return false;
		return deps.setzeListenart(listId, 'aufgaben');
	}

	return {
		kategorienVon,
		artikelHinzufuegen,
		artikelUmschalten,
		wiederDrauf,
		einkaufFertig,
		kategorieWechseln,
		kategorieAnlegen,
		kategorieLoeschen,
		ohneKategorieEinsortieren,
		listeUmstellen
	};
}
export type Einkauf = ReturnType<typeof createEinkauf>;
