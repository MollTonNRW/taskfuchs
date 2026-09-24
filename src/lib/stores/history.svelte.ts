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
	type Eintragsart,
	type Entwurf
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

	/**
	 * Was sich lokal an einem Eintrag getan hat, WAEHREND eine Abfrage lief
	 * (`resync`, `ladeVerlauf`) — fortlaufend gezaehlt. Die Antwort zeigt den
	 * Stand bei ihrem Start. Ein inzwischen bestaetigtes „Ist da", ein neuer
	 * oder geaenderter Eintrag, ein Realtime-DELETE ist neuer als sie und darf
	 * von ihr nicht ueberschrieben werden — sonst kaeme etwa die Sanduhr nach
	 * einem Tipp auf „Ist da" zurueck und bliebe bis zum Neuladen stehen.
	 * Gezaehlt wird nur, solange eine Abfrage laeuft; danach ist alles leer.
	 */
	let takt = 0;
	let laufendeAbfragen = 0;
	const geaendert: Record<string, number> = {};

	function vermerke(id: string) {
		if (laufendeAbfragen > 0) geaendert[id] = ++takt;
	}

	/** Hat sich der Eintrag seit `start` lokal geaendert? */
	function neuerAls(id: string, start: number): boolean {
		return (geaendert[id] ?? 0) > start;
	}

	function abfrageBeginnt(): number {
		laufendeAbfragen++;
		return takt;
	}

	function abfrageEndet() {
		laufendeAbfragen--;
		if (laufendeAbfragen === 0) for (const id of Object.keys(geaendert)) delete geaendert[id];
	}

	/**
	 * Angefangene Eingaben je Aufgabe. Sie liegen hier und nicht in der
	 * Verlaufsgruppe: die verschwindet, sobald Detail oder Sheet schliessen
	 * (am Handy bei jedem Aufgabenwechsel) und naehme sie mit.
	 * Bewusst KEIN $state: nur die Eingabe liest und schreibt sie.
	 */
	const entwuerfe: Record<string, Entwurf> = {};

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

	function entwurf(taskId: string): Entwurf | null {
		return entwuerfe[taskId] ?? null;
	}

	/** Leerer Text: der Entwurf faellt weg. */
	function merkeEntwurf(taskId: string, e: Entwurf | null) {
		if (e && e.text.trim()) entwuerfe[taskId] = e;
		else delete entwuerfe[taskId];
	}

	// ==========================================
	// BESTAND FUEHREN
	// ==========================================
	/** Einsetzen oder ersetzen — dieselbe ID ist immer derselbe Eintrag. */
	function einsetzen(e: Eintrag) {
		vermerke(e.id);
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
		vermerke(id);
		if (eintraege.some((e) => e.id === id)) eintraege = eintraege.filter((e) => e.id !== id);
	}

	/** Felder sofort setzen und die Ruecknahme dazu liefern (wie in tasks.svelte.ts). */
	function setzeFelder(id: string, felder: Partial<Eintrag>): () => void {
		const alt = eintraege.find((e) => e.id === id);
		if (!alt) return () => {};
		const vorher: Record<string, unknown> = {};
		for (const k of Object.keys(felder)) vorher[k] = (alt as unknown as Record<string, unknown>)[k];
		vermerke(id);
		eintraege = eintraege.map((e) => (e.id === id ? { ...e, ...felder } : e));
		return () => {
			vermerke(id);
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
		const start = abfrageBeginnt();
		const { data, error } = await crud.loadHistory(sb, [taskId]);
		delete laedt[taskId];
		if (error || !data) {
			abfrageEndet();
			console.error('Verlauf laden fehlgeschlagen:', error);
			toasts.error('Verlauf konnte nicht geladen werden.');
			return;
		}
		// Was sich waehrend des Ladens lokal getan hat, ist neuer als die
		// Antwort — auch ein inzwischen geloeschter Eintrag kommt nicht zurueck.
		const frisch = (data as Eintrag[]).filter((e) => !vorgemerkt[e.id] && !neuerAls(e.id, start));
		const frischIds: Record<string, true> = {};
		for (const e of frisch) frischIds[e.id] = true;
		// Vereinigen statt ersetzen: was waehrend des Ladens per Realtime oder
		// optimistisch hinzukam, bleibt stehen.
		eintraege = [...eintraege.filter((e) => !frischIds[e.id]), ...frisch];
		geladen = [...geladen, taskId];
		abfrageEndet();
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
		const start = abfrageBeginnt();
		const [offen, verlaeufe] = await Promise.all([
			crud.loadOpenWaits(sb),
			voll.length > 0 ? crud.loadHistory(sb, voll) : Promise.resolve({ data: [] as Eintrag[], error: null })
		]);
		if (offen.error || verlaeufe.error) {
			abfrageEndet();
			console.error('Verlauf abgleichen fehlgeschlagen:', offen.error ?? verlaeufe.error);
			return;
		}
		const frisch: Record<string, Eintrag> = {};
		for (const e of [...((offen.data as Eintrag[]) ?? []), ...((verlaeufe.data as Eintrag[]) ?? [])]) {
			if (!vorgemerkt[e.id] && !neuerAls(e.id, start)) frisch[e.id] = e;
		}
		// Ueberleben: was sich waehrend dieser Abfrage lokal geaendert hat
		// (bestaetigt, per Realtime, optimistisch — die Antwort ist aelter),
		// noch unbestaetigte eigene Eintraege und Verlaeufe, die waehrend
		// dieser Abfrage erst geladen wurden. Lokal waehrenddessen Geloeschtes
		// steht weder hier noch in `frisch` und bleibt weg.
		const inzwischen = geladen.filter((id) => !voll.includes(id));
		const bleiben = eintraege.filter(
			(e) =>
				!frisch[e.id] &&
				(neuerAls(e.id, start) || schwebend[e.id] || inzwischen.includes(e.task_id))
		);
		eintraege = [...Object.values(frisch), ...bleiben];
		abfrageEndet();
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
		einsetzen(optimistisch);
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
		// Ab hier nicht mehr vorgemerkt: ein laufender Abgleich darf den
		// Eintrag trotzdem nicht aus seiner aelteren Antwort zurueckholen.
		vermerke(id);
		const { data, error } = await crud.deleteHistory(sb, id);
		if (!error && data && data.length > 0) return;
		// Keine Zeile geloescht und kein Fehler: entweder hat RLS abgelehnt —
		// die eigene Rolle ist inzwischen „nur lesen", `darfSchreiben` kennt
		// nur den Ladestand — oder jemand anderes hat ihn schon geloescht. Nur
		// im ersten Fall steht er noch.
		if (!error) {
			const { data: noch, error: pruefFehler } = await crud.historyExists(sb, id);
			if (!pruefFehler && (!noch || noch.length === 0)) return;
		}
		console.error('Eintrag loeschen fehlgeschlagen:', error ?? 'keine Berechtigung');
		einsetzen(v.eintrag);
		toasts.error('Eintrag konnte nicht gelöscht werden.');
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
	 * Datenbank hat `on delete cascade` sie bereits entfernt — und fuer ein
	 * Rueckgaengig in den Papierkorb gelegt (siehe `aufgabenZurueck`).
	 */
	function verwerfeAufgaben(gibtEs: (taskId: string) => boolean) {
		if (eintraege.some((e) => !gibtEs(e.task_id))) eintraege = eintraege.filter((e) => gibtEs(e.task_id));
		if (geladen.some((id) => !gibtEs(id))) geladen = geladen.filter((id) => gibtEs(id));
	}

	/**
	 * Aufgaben sind nach einem Loeschen wieder da — ihr Verlauf soll es auch
	 * sein. Der Zwischenspeicher hat ihn verworfen, als sie aus dem Bestand
	 * fielen (`verwerfeAufgaben`); `tasks.svelte.ts` meldet sich hier.
	 * - `wiedereingefuegt` (Rueckgaengig): die Kaskade hat den Verlauf auf
	 *   dem Server in den Papierkorb gelegt; `restore_task_history` setzt ihn
	 *   mit Autor, Zeiten und „Ist da" zurueck (Migration 022, Abschnitt 6).
	 *   Ein Neu-Einfuegen vom Client aus stempelte der Trigger um.
	 * - sonst (Loeschen fehlgeschlagen): auf dem Server ist nichts passiert,
	 *   hier fehlen nur die offenen Warte-Eintraege — die Sanduhr. Den vollen
	 *   Verlauf laedt das Detail beim naechsten Oeffnen ohnehin neu.
	 */
	async function aufgabenZurueck(taskIds: string[], wiedereingefuegt: boolean) {
		if (!sb || taskIds.length === 0) return;
		const betroffen: Record<string, true> = {};
		for (const id of taskIds) betroffen[id] = true;
		const { data, error } = wiedereingefuegt
			? await crud.restoreHistory(sb, taskIds)
			: await crud.loadOpenWaits(sb);
		if (error || !data) {
			console.error('Verlauf wiederherstellen fehlgeschlagen:', error);
			if (wiedereingefuegt) toasts.error('Verlauf der Aufgabe konnte nicht wiederhergestellt werden.');
			return;
		}
		for (const e of data as Eintrag[]) {
			if (betroffen[e.task_id] && !vorgemerkt[e.id]) einsetzen(e);
		}
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
		entwurf, merkeEntwurf,
		add, edit, resolve, unresolve, remove,
		loescheVorgemerkte, verwerfeAufgaben, aufgabenZurueck,
		handleRealtime
	};
}
