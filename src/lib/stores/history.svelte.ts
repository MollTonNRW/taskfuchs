import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import * as crud from '$lib/services/supabase-crud';
import { toasts } from '$lib/stores/toast';
import {
	EINTRAG_MAX,
	istOffenerWarteEintrag,
	jetztIso,
	neuesteZuerst,
	type Eintrag,
	type Eintragsart
} from '$lib/utils/verlauf';

type Sb = SupabaseClient<Database>;

/**
 * Loeschen wartet so lange auf ein Rueckgaengig — etwas laenger, als der
 * Undo-Toast steht (8 s), damit ein Klick in dessen letztem Augenblick nicht
 * gegen das bereits laufende Loeschen antritt.
 */
const LOESCH_FRIST = 8500;

/**
 * So viele vollstaendig geladene Verlaeufe holt `resync` nach einem
 * Wiederverbinden nach. Aeltere fallen aus dem Zwischenspeicher und werden
 * beim naechsten Oeffnen neu geladen.
 */
const RESYNC_MAX = 30;

const KEINE: Eintrag[] = [];

/**
 * Aufgabenhistorie — Muster wie `tasks.svelte.ts`: Runes, optimistisch
 * aendern, feldgenau zurueckrollen, Fehler als Toast.
 *
 * Geladen wird in zwei Stufen:
 * - beim App-Start EINE Abfrage fuer alle offenen Warte-Eintraege — sie
 *   tragen die Sanduhr in den Zeilen, quer ueber alle Listen;
 * - der vollstaendige Verlauf einer Aufgabe erst, wenn ihr Detail aufgeht
 *   (`ladeVerlauf`), danach aus dem Zwischenspeicher.
 *
 * Alles Bekannte liegt in EINEM Bestand (`eintraege`). Die offenen
 * Warte-Eintraege sind daraus abgeleitet — es gibt keine zweite Wahrheit,
 * die ein Realtime-Ereignis vergessen koennte nachzufuehren.
 */
export function createHistoryStore() {
	let eintraege = $state<Eintrag[]>([]);
	/** Aufgaben mit vollstaendig geladenem Verlauf; zuletzt geoeffnete hinten. */
	let geladen = $state<string[]>([]);
	let sb: Sb | null = null;
	let userId = '';

	/** Laufende Ladevorgaenge je Aufgabe — gegen doppeltes Laden. */
	const laedt: Record<string, true> = {};
	/** Optimistisch angelegt, vom Server noch nicht bestaetigt. */
	const schwebend: Record<string, true> = {};
	/**
	 * Zum Loeschen vorgemerkt: lokal schon weg, auf dem Server erst nach
	 * Ablauf des Rueckgaengig (siehe `remove`).
	 */
	const vorgemerkt: Record<string, { eintrag: Eintrag; uhr: ReturnType<typeof setTimeout> }> = {};

	/** taskId -> offene Warte-Eintraege, neueste zuerst. */
	const offenNachAufgabe = $derived.by(() => {
		const zuordnung: Record<string, Eintrag[]> = {};
		for (const e of eintraege) {
			if (istOffenerWarteEintrag(e)) (zuordnung[e.task_id] ??= []).push(e);
		}
		for (const liste of Object.values(zuordnung)) liste.sort(neuesteZuerst);
		return zuordnung;
	});

	function init(supabase: Sb, uid: string) {
		sb = supabase;
		userId = uid;
		void resync();
	}

	// ==========================================
	// LESEN
	// ==========================================
	function offeneWarte(taskId: string): Eintrag[] {
		return offenNachAufgabe[taskId] ?? KEINE;
	}

	function verlauf(taskId: string): Eintrag[] {
		return eintraege.filter((e) => e.task_id === taskId).sort(neuesteZuerst);
	}

	function istGeladen(taskId: string): boolean {
		return geladen.includes(taskId);
	}

	// ==========================================
	// BESTAND FUEHREN
	// ==========================================
	/** Einsetzen oder ersetzen — dieselbe ID ist immer derselbe Eintrag. */
	function einsetzen(e: Eintrag) {
		if (eintraege.some((x) => x.id === e.id)) {
			eintraege = eintraege.map((x) => (x.id === e.id ? e : x));
		} else {
			eintraege = [...eintraege, e];
		}
	}

	/**
	 * Antwort des Servers uebernehmen — aber nur, wenn der Eintrag noch da
	 * ist. Kam inzwischen ein Realtime-DELETE, bliebe er sonst als Leiche
	 * stehen.
	 */
	function uebernehmen(e: Eintrag) {
		if (vorgemerkt[e.id]) {
			vorgemerkt[e.id].eintrag = e;
			return;
		}
		if (eintraege.some((x) => x.id === e.id)) einsetzen(e);
	}

	function entfernen(id: string) {
		if (eintraege.some((e) => e.id === id)) eintraege = eintraege.filter((e) => e.id !== id);
	}

	/** Felder sofort setzen und die Ruecknahme dazu liefern (wie in tasks.svelte.ts). */
	function setzeFelder(id: string, felder: Partial<Eintrag>): () => void {
		const alt = eintraege.find((e) => e.id === id);
		if (!alt) return () => {};
		const vorher: Record<string, unknown> = {};
		for (const k of Object.keys(felder)) vorher[k] = (alt as unknown as Record<string, unknown>)[k];
		eintraege = eintraege.map((e) => (e.id === id ? { ...e, ...felder } : e));
		return () => {
			eintraege = eintraege.map((e) => (e.id === id ? { ...e, ...(vorher as Partial<Eintrag>) } : e));
		};
	}

	// ==========================================
	// LADEN
	// ==========================================
	/** Vollstaendiger Verlauf einer Aufgabe — beim ersten Oeffnen ihres Details. */
	async function ladeVerlauf(taskId: string) {
		if (!sb || laedt[taskId]) return;
		if (geladen.includes(taskId)) {
			// Nach hinten ruecken: `resync` haelt die zuletzt geoeffneten.
			if (geladen[geladen.length - 1] !== taskId) {
				geladen = [...geladen.filter((id) => id !== taskId), taskId];
			}
			return;
		}
		laedt[taskId] = true;
		const { data, error } = await crud.loadHistory(sb, [taskId]);
		delete laedt[taskId];
		if (error || !data) {
			console.error('Verlauf laden fehlgeschlagen:', error);
			toasts.error('Verlauf konnte nicht geladen werden.');
			return;
		}
		const frisch = (data as Eintrag[]).filter((e) => !vorgemerkt[e.id]);
		const frischIds: Record<string, true> = {};
		for (const e of frisch) frischIds[e.id] = true;
		// Vereinigen statt ersetzen: was waehrend des Ladens per Realtime oder
		// optimistisch hinzukam, bleibt stehen.
		eintraege = [...eintraege.filter((e) => !frischIds[e.id]), ...frisch];
		geladen = [...geladen, taskId];
	}

	/**
	 * Bestand nach dem (Wieder-)Verbinden neu holen: offene Warte-Eintraege
	 * aller Aufgaben plus die vollstaendig geladenen Verlaeufe. Realtime holt
	 * verpasste Ereignisse nicht nach — dasselbe Muster wie `resync` in
	 * tasks.svelte.ts. Beim App-Start ist `geladen` leer; dann ist das genau
	 * die eine Abfrage nach den offenen Warte-Eintraegen.
	 */
	async function resync() {
		if (!sb) return;
		if (geladen.length > RESYNC_MAX) geladen = geladen.slice(-RESYNC_MAX);
		const voll = [...geladen];
		const [offen, verlaeufe] = await Promise.all([
			crud.loadOpenWaits(sb),
			voll.length > 0 ? crud.loadHistory(sb, voll) : Promise.resolve({ data: [] as Eintrag[], error: null })
		]);
		if (offen.error || verlaeufe.error) {
			console.error('Verlauf abgleichen fehlgeschlagen:', offen.error ?? verlaeufe.error);
			return;
		}
		const frisch: Record<string, Eintrag> = {};
		for (const e of [...((offen.data as Eintrag[]) ?? []), ...((verlaeufe.data as Eintrag[]) ?? [])]) {
			if (!vorgemerkt[e.id]) frisch[e.id] = e;
		}
		// Ueberleben: noch unbestaetigte eigene Eintraege und Verlaeufe, die
		// waehrend dieser Abfrage erst geladen wurden.
		const inzwischen = geladen.filter((id) => !voll.includes(id));
		const bleiben = eintraege.filter(
			(e) => !frisch[e.id] && (schwebend[e.id] || inzwischen.includes(e.task_id))
		);
		eintraege = [...Object.values(frisch), ...bleiben];
	}

	// ==========================================
	// SCHREIBEN — optimistisch, mit Ruecknahme
	// ==========================================
	/**
	 * Neuer Eintrag. Die ID vergibt der Client: Antwort und Realtime-INSERT
	 * treffen damit dieselbe Zeile, egal wer zuerst ankommt — kein
	 * Fingerabdruck wie bei den Aufgaben noetig. Autor und Zeitpunkt setzt
	 * der Trigger; die optimistische Zeile nimmt sie vorweg.
	 *
	 * Rueckgabe: ob gespeichert wurde. Die Eingabe stellt bei `false` den
	 * Text wieder her.
	 */
	async function add(taskId: string, art: Eintragsart, text: string): Promise<boolean> {
		const body = text.trim().slice(0, EINTRAG_MAX);
		if (!sb || !body) return false;
		const id = crypto.randomUUID();
		const optimistisch: Eintrag = {
			id,
			task_id: taskId,
			kind: art,
			body,
			created_by: userId,
			created_at: jetztIso(),
			edited_at: null,
			edited_by: null,
			resolved_at: null,
			resolved_by: null
		};
		schwebend[id] = true;
		eintraege = [...eintraege, optimistisch];
		const { data, error } = await crud.insertHistory(sb, { id, task_id: taskId, kind: art, body });
		delete schwebend[id];
		if (error || !data) {
			console.error('Eintrag anlegen fehlgeschlagen:', error);
			entfernen(id);
			toasts.error('Eintrag konnte nicht gespeichert werden.');
			return false;
		}
		uebernehmen(data as Eintrag);
		return true;
	}

	/** Text aendern. Leer oder unveraendert: nichts tun. */
	async function edit(id: string, text: string) {
		const alt = eintraege.find((e) => e.id === id);
		const body = text.trim().slice(0, EINTRAG_MAX);
		if (!sb || !alt || !body || body === alt.body) return;
		const zurueck = setzeFelder(id, { body, edited_at: jetztIso(), edited_by: userId });
		const { data, error } = await crud.updateHistory(sb, id, { body });
		if (error || !data) {
			console.error('Eintrag bearbeiten fehlgeschlagen:', error);
			zurueck();
			toasts.error('Änderung konnte nicht gespeichert werden.');
			return;
		}
		uebernehmen(data as Eintrag);
	}

	/**
	 * „Ist da" setzen bzw. zuruecknehmen. Geschickt wird nur `resolved_at`;
	 * den echten Zeitpunkt und `resolved_by` stempelt der Trigger.
	 */
	async function setzeIstDa(id: string, istDa: boolean) {
		const alt = eintraege.find((e) => e.id === id);
		if (!sb || !alt || alt.kind !== 'wartet' || !!alt.resolved_at === istDa) return;
		const jetzt = jetztIso();
		const zurueck = setzeFelder(
			id,
			istDa ? { resolved_at: jetzt, resolved_by: userId } : { resolved_at: null, resolved_by: null }
		);
		const { data, error } = await crud.updateHistory(sb, id, { resolved_at: istDa ? jetzt : null });
		if (error || !data) {
			console.error('„Ist da" speichern fehlgeschlagen:', error);
			zurueck();
			toasts.error('Änderung konnte nicht gespeichert werden.');
			return;
		}
		uebernehmen(data as Eintrag);
	}

	function resolve(id: string) {
		return setzeIstDa(id, true);
	}

	function unresolve(id: string) {
		return setzeIstDa(id, false);
	}

	/**
	 * Loeschen mit Rueckgaengig — hier bewusst VERZOEGERT.
	 *
	 * Aufgaben werden sofort geloescht und beim Rueckgaengig neu eingefuegt
	 * (tasks.svelte.ts, `loescheMitUndo`). Fuer Verlaufseintraege geht das
	 * nicht: der Trigger aus Migration 022 setzt beim INSERT Autor, Zeitpunkt
	 * und „Ist da" neu. Ein wieder eingefuegter Eintrag stuende dann unter dem
	 * Namen dessen, der Rueckgaengig drueckt, mit der aktuellen Uhrzeit ganz
	 * oben, und ein eingeloester Warte-Eintrag waere wieder offen.
	 *
	 * Darum verschwindet der Eintrag sofort aus der Oberflaeche, geloescht
	 * wird erst nach Ablauf des Toasts. Wird die Seite vorher verlassen,
	 * loescht `loescheVorgemerkte` sofort; geht auch das verloren, bleibt der
	 * Eintrag stehen — die harmlose Richtung.
	 */
	function remove(id: string) {
		const eintrag = eintraege.find((e) => e.id === id);
		if (!eintrag || vorgemerkt[id]) return;
		entfernen(id);
		vorgemerkt[id] = { eintrag, uhr: setTimeout(() => void endgueltigLoeschen(id), LOESCH_FRIST) };
		toasts.undo(eintrag.kind === 'wartet' ? 'Warte-Eintrag gelöscht' : 'Eintrag gelöscht', () =>
			zuruecknehmen(id)
		);
	}

	function zuruecknehmen(id: string) {
		const v = vorgemerkt[id];
		if (!v) return;
		clearTimeout(v.uhr);
		delete vorgemerkt[id];
		einsetzen(v.eintrag);
	}

	async function endgueltigLoeschen(id: string) {
		const v = vorgemerkt[id];
		if (!v || !sb) return;
		delete vorgemerkt[id];
		const { error } = await crud.deleteHistory(sb, id);
		if (error) {
			console.error('Eintrag loeschen fehlgeschlagen:', error);
			einsetzen(v.eintrag);
			toasts.error('Eintrag konnte nicht gelöscht werden.');
		}
	}

	/** Seite wird verlassen: vorgemerkte Loeschungen sofort ausfuehren. */
	function loescheVorgemerkte() {
		for (const id of Object.keys(vorgemerkt)) {
			clearTimeout(vorgemerkt[id].uhr);
			void endgueltigLoeschen(id);
		}
	}

	/**
	 * Aufgaben sind weg (geloescht, auch „Erledigte loeschen", Liste
	 * geloescht, per Realtime verschwunden): ihre Eintraege verwerfen. In der
	 * Datenbank hat `on delete cascade` sie bereits entfernt.
	 */
	function verwerfeAufgaben(gibtEs: (taskId: string) => boolean) {
		if (eintraege.some((e) => !gibtEs(e.task_id))) eintraege = eintraege.filter((e) => gibtEs(e.task_id));
		if (geladen.some((id) => !gibtEs(id))) geladen = geladen.filter((id) => gibtEs(id));
	}

	// ==========================================
	// REALTIME
	// ==========================================
	/**
	 * INSERT/UPDATE bringen die ganze Zeile, DELETE bei aktivem RLS nur die
	 * ID — entfernt wird darum per ID.
	 */
	function handleRealtime(eventType: string, payload: unknown) {
		const zeile = payload as Partial<Eintrag> | null;
		const id = zeile?.id;
		if (!id) return;
		if (eventType === 'DELETE') {
			// Jemand anderes war schneller: ein Rueckgaengig gibt es nicht mehr.
			if (vorgemerkt[id]) {
				clearTimeout(vorgemerkt[id].uhr);
				delete vorgemerkt[id];
			}
			entfernen(id);
			return;
		}
		if (eventType !== 'INSERT' && eventType !== 'UPDATE') return;
		const e = zeile as Eintrag;
		if (vorgemerkt[id]) {
			vorgemerkt[id].eintrag = e;
			return;
		}
		einsetzen(e);
	}

	return {
		get eintraege() { return eintraege; },
		init, resync,
		offeneWarte, verlauf, istGeladen, ladeVerlauf,
		add, edit, resolve, unresolve, remove,
		loescheVorgemerkte, verwerfeAufgaben,
		handleRealtime
	};
}
