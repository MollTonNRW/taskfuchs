import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import type { Priority } from '$lib/constants';
import { browser } from '$app/environment';
import * as crud from '$lib/services/supabase-crud';
import { toasts } from '$lib/stores/toast';

type List = Database['public']['Tables']['lists']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type Sb = SupabaseClient<Database>;

/** Wer hatte eine Aufgabe angepinnt — Merkzettel fuer das Rueckgaengig von „Alle loesen". */
export type PinStand = { id: string; pinned_by: string | null };

/** Merkzettel je Liste: wann sie zuletzt gesehen wurde (Millisekunden). */
const GESEHEN_KEY = 'tf-gesehen';

/**
 * Rueckmeldungen an Nachbar-Stores. `aufgabenZurueck`: Aufgaben stehen nach
 * einem Loeschen wieder im Bestand — `wiedereingefuegt` nach „Rueckgaengig"
 * (auf dem Server neu eingefuegt), sonst nach einem gescheiterten Loeschen
 * (auf dem Server nie weg gewesen). Die Aufgabenhistorie holt daran ihren
 * Verlauf zurueck.
 */
export type TaskStoreOptionen = {
	aufgabenZurueck?: (taskIds: string[], wiedereingefuegt: boolean) => void;
};

export function createTaskStore(optionen: TaskStoreOptionen = {}) {
	let tasks = $state<Task[]>([]);
	let lists = $state<List[]>([]);
	let sb: Sb;
	let userId: string;
	let pendingTaskIds = new Set<string>();
	let pendingListIds = new Set<string>();
	/** Fingerprint für Duplikat-Erkennung: text|list_id|parent_id (verhindert Duplikate wenn Realtime vor HTTP-Response kommt) */
	let pendingFingerprints = new Set<string>();
	function taskFingerprint(t: { text: string; list_id: string; parent_id?: string | null }): string {
		return `${t.text}|${t.list_id}|${t.parent_id ?? ''}`;
	}

	// ==========================================
	// „NEU" — was von aussen hereinkam
	// ==========================================
	/**
	 * Ein Realtime-INSERT ohne Fingerprint- und ohne Pending-Treffer stammt
	 * sicher nicht aus dieser Sitzung: geschrieben haben n8n, der
	 * G2-Startbildschirm, ein anderes Geraet oder ein Mitnutzer. Solche
	 * Zeilen bekommen die Flaeche `--new`, den Chip „neu" und ihre
	 * Herkunftszeile (Spezifikation Abschnitt 5) — bis die Liste einmal
	 * gesehen wurde.
	 *
	 * „Gesehen" heisst: die Liste war offen UND der Nutzer ist weitergegangen.
	 * Wer sie gerade ansieht, soll den Marker ja lesen koennen — Frame 1 der
	 * Spezifikation zeigt „Gluehbirnen Flur" mit Chip in der offenen Liste.
	 *
	 * Bewusst eine Liste von IDs statt eines Set: ein `$state`-Set verlangte
	 * `SvelteSet`, und die Menge bleibt klein (was seit dem letzten Besuch
	 * einer Liste hereinkam).
	 */
	let neuIds = $state<string[]>([]);

	function gesehenStand(): Record<string, number> {
		if (!browser) return {};
		try {
			const roh = localStorage.getItem(GESEHEN_KEY);
			return roh ? (JSON.parse(roh) as Record<string, number>) : {};
		} catch {
			return {};
		}
	}

	function istNeu(id: string): boolean {
		return neuIds.includes(id);
	}

	/**
	 * Liste als gesehen vermerken und ihre Marker abraeumen. Ruft die Seite
	 * beim WECHSEL der aktiven Liste fuer die zuvor offene auf.
	 */
	function listeGesehen(listId: string | null) {
		if (!listId) return;
		if (browser) {
			try {
				const stand = gesehenStand();
				stand[listId] = Date.now();
				localStorage.setItem(GESEHEN_KEY, JSON.stringify(stand));
			} catch {
				/* privater Modus — der Marker gilt dann nur fuer diese Sitzung */
			}
		}
		if (neuIds.length === 0) return;
		const betroffen = new Set(tasks.filter((t) => t.list_id === listId).map((t) => t.id));
		if (!neuIds.some((id) => betroffen.has(id))) return;
		neuIds = neuIds.filter((id) => !betroffen.has(id));
	}

	function markiereNeu(id: string) {
		if (neuIds.includes(id)) return;
		neuIds = [...neuIds, id];
	}

	function init(supabase: Sb, uid: string, initialLists: List[], initialTasks: Task[]) {
		sb = supabase;
		userId = uid;
		lists = initialLists;
		tasks = initialTasks;

		// Was seit dem letzten Besuch einer Liste von FREMDER Hand dazukam,
		// traegt den Marker auch nach einem Neuladen. Nur fremde Ersteller:
		// die eigenen Zeilen dieses Kontos waeren sonst nach jedem Neuladen
		// „neu". Eine nie gesehene Liste bleibt ganz ohne Marker — sonst
		// stuende beim ersten Besuch alles in Warmorange.
		const stand = gesehenStand();
		neuIds = initialTasks
			.filter((t) => {
				if (t.parent_id || t.user_id === uid) return false;
				const seit = stand[t.list_id];
				if (!seit) return false;
				const erstellt = Date.parse(t.created_at);
				return !Number.isNaN(erstellt) && erstellt > seit;
			})
			.map((t) => t.id);
	}

	/** Alle Nachkommen eines Tasks rekursiv sammeln (Unteraufgaben + Unter-Unteraufgaben) */
	function getDescendantIds(parentId: string): Set<string> {
		const ids = new Set<string>();
		const children = tasks.filter((t) => t.parent_id === parentId);
		for (const child of children) {
			ids.add(child.id);
			for (const grandId of getDescendantIds(child.id)) {
				ids.add(grandId);
			}
		}
		return ids;
	}

	// ==========================================
	// OPTIMISTISCH AENDERN, FELDGENAU ZURUECKROLLEN
	// ==========================================
	/**
	 * Setzt Felder sofort im Bestand und liefert die Ruecknahme dazu.
	 *
	 * Vorher merkte sich jede Mutation das KOMPLETTE Task-Array und setzte es
	 * bei einem Fehler zurueck. Traf dazwischen ein Realtime-Ereignis oder
	 * eine zweite Mutation ein, wurde die mit zurueckgerollt — der Nutzer sah
	 * eine fremde oder eine gerade getippte Aenderung verschwinden. Jetzt
	 * merkt sich die Ruecknahme nur die tatsaechlich angefassten Felder der
	 * tatsaechlich angefassten Zeilen; alles andere bleibt, wie es inzwischen
	 * steht.
	 */
	type Feldsatz = Partial<Task>;

	function setzeFelderJeAufgabe(patches: { id: string; felder: Feldsatz }[]): () => void {
		const nachId = new Map(patches.map((p) => [p.id, p.felder]));
		const vorher = new Map<string, Feldsatz>();
		for (const t of tasks) {
			const felder = nachId.get(t.id);
			if (!felder) continue;
			const alt: Record<string, unknown> = {};
			for (const k of Object.keys(felder)) alt[k] = (t as unknown as Record<string, unknown>)[k];
			vorher.set(t.id, alt as Feldsatz);
		}
		tasks = tasks.map((t) => {
			const felder = nachId.get(t.id);
			return felder ? { ...t, ...felder } : t;
		});
		return () => {
			tasks = tasks.map((t) => {
				const alt = vorher.get(t.id);
				return alt ? { ...t, ...alt } : t;
			});
		};
	}

	/** Dieselben Felder fuer eine Menge von Aufgaben. */
	function setzeFelder(ids: Iterable<string>, felder: Feldsatz): () => void {
		return setzeFelderJeAufgabe([...ids].map((id) => ({ id, felder })));
	}

	/** Gegenstueck fuer Listen — dort reicht ein einzelner Datensatz. */
	function setzeListenfelder(id: string, felder: Partial<List>): () => void {
		const alt = lists.find((l) => l.id === id);
		const vorher: Record<string, unknown> = {};
		if (alt) {
			for (const k of Object.keys(felder)) vorher[k] = (alt as unknown as Record<string, unknown>)[k];
		}
		lists = lists.map((l) => (l.id === id ? { ...l, ...felder } : l));
		return () => {
			if (!alt) return;
			lists = lists.map((l) => (l.id === id ? { ...l, ...(vorher as Partial<List>) } : l));
		};
	}

	// ==========================================
	// LIST CRUD
	// ==========================================
	/**
	 * Legt eine Liste mit fertigem Namen und Symbol an und gibt ihre ID zurueck.
	 *
	 * Vorher legte diese Funktion sofort eine Liste namens „Neue Liste" an und
	 * fragte erst danach nach dem Namen — bricht der Nutzer dort ab, bleibt eine
	 * namenlose Leiche stehen (8 von 24 Listen in der Produktivdatenbank).
	 * Jetzt sammelt die Oberflaeche Name und Symbol vorher ein; geschrieben wird
	 * erst beim Bestaetigen.
	 */
	async function createList(title: string, icon: string): Promise<string | null> {
		const name = title.trim() || 'Neue Liste';
		const position = lists.length;
		pendingListIds.add('creating');
		const { data: newList, error } = await crud.createList(sb, userId, position, name, icon);
		pendingListIds.delete('creating');
		if (error) {
			console.error('Liste erstellen fehlgeschlagen:', error);
			toasts.error('Fehler beim Erstellen der Liste.');
			return null;
		}
		if (!newList) return null;
		if (!lists.some((l) => l.id === newList.id)) {
			lists = [...lists, newList as List];
		}
		return newList.id;
	}

	async function renameList(id: string, title: string) {
		const zurueck = setzeListenfelder(id, { title });
		const { error } = await crud.renameList(sb, id, title);
		if (error) zurueck();
	}

	/**
	 * Loescht eine Liste samt Aufgaben — OHNE eigene Rueckfrage.
	 *
	 * Den Bestaetigungsdialog fuehrt der Aufrufer (routes/app/+page.svelte),
	 * denn nur dort sind die konkreten Zahlen und die Mitnutzer bekannt, die
	 * laut Spezifikation Abschnitt 6 im Text stehen muessen.
	 *
	 * Hier gibt es bewusst KEIN Rueckgaengig und darum auch keinen
	 * feldgenauen Rollback: schlaegt das Loeschen fehl, kommt der ganze
	 * Bestand zurueck.
	 */
	async function deleteList(id: string): Promise<boolean> {
		const oldLists = lists;
		const oldTasks = tasks;
		lists = lists.filter((l) => l.id !== id);
		tasks = tasks.filter((t) => t.list_id !== id);
		const { error } = await crud.deleteList(sb, id);
		if (error) {
			lists = oldLists;
			tasks = oldTasks;
			return false;
		}
		return true;
	}

	async function changeListIcon(id: string, icon: string) {
		const zurueck = setzeListenfelder(id, { icon });
		const { error } = await crud.changeListIcon(sb, id, icon);
		if (error) zurueck();
	}

	async function reorderList(listId: string, newPosition: number) {
		const oldLists = [...lists];
		const listToMove = lists.find((l) => l.id === listId);
		if (!listToMove) return;
		const reordered = lists.filter((l) => l.id !== listId);
		reordered.splice(newPosition, 0, listToMove);
		const updates: { id: string; position: number }[] = [];
		lists = reordered.map((l, i) => {
			if (l.position !== i) updates.push({ id: l.id, position: i });
			return { ...l, position: i };
		});
		// Umsortieren ist eine Aussage ueber die REIHENFOLGE aller Listen —
		// hier ist der Rollback des ganzen Arrays die richtige Einheit.
		const { error } = await crud.reorderListDb(sb, updates);
		if (error) lists = oldLists;
	}

	// ==========================================
	// TASK CRUD
	// ==========================================
	async function addTask(listId: string, text: string) {
		const listTasks = tasks.filter((t) => t.list_id === listId && !t.parent_id);
		const position = listTasks.length;
		const optimisticTask: Task = {
			id: crypto.randomUUID(), list_id: listId, user_id: userId, parent_id: null,
			text, type: 'task', divider_label: null, done: false, priority: 'normal',
			timeframe: null, highlighted: false, pinned: false, pinned_by: null, emoji: null, note: null,
			due_date: null, assigned_to: null, calendar_event_id: null, abgelegt: false, position,
			created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1
		};
		tasks = [...tasks, optimisticTask];
		pendingTaskIds.add(optimisticTask.id);
		const fp = taskFingerprint(optimisticTask);
		pendingFingerprints.add(fp);
		const { data: newTask, error } = await crud.insertTask(sb, { list_id: listId, user_id: userId, text, position });
		pendingTaskIds.delete(optimisticTask.id);
		pendingFingerprints.delete(fp);
		if (error) { tasks = tasks.filter((t) => t.id !== optimisticTask.id); return; }
		if (newTask) {
			const serverId = (newTask as Task).id;
			tasks = tasks.filter((t) => t.id === optimisticTask.id || t.id !== serverId);
			tasks = tasks.map((t) => (t.id === optimisticTask.id ? (newTask as Task) : t));
		}
	}

	/** Titel fuer den Undo-Toast kuerzen — „„Hecke schneiden" erledigt". */
	function kurz(text: string, max = 28): string {
		const t = text.trim();
		return t.length > max ? `${t.slice(0, max - 1)}…` : t;
	}

	/**
	 * Abhaken — EIN Toast je Nutzeraktion, und das Rueckgaengig nimmt die
	 * komplette Kaskade zurueck.
	 *
	 * Unteraufgaben wurden schon immer mitgehakt; das Rueckgaengig setzte
	 * aber nur die Aufgabe selbst zurueck — die Haken darunter blieben
	 * stehen. Jetzt merkt sich der Toast, welche Unteraufgaben diese Aktion
	 * tatsaechlich umgelegt hat (bereits erledigte bleiben erledigt) und
	 * stellt genau die wieder her.
	 */
	async function toggleTask(id: string, done: boolean) {
		const task = tasks.find((t) => t.id === id);
		if (!task) return;

		const mitgenommen = done
			? [...getDescendantIds(id)].filter((subId) => {
					const sub = tasks.find((t) => t.id === subId);
					return !!sub && !sub.done;
				})
			: [];

		const zurueck = setzeFelder([id, ...mitgenommen], { done });

		if (mitgenommen.length > 0) {
			const { error: subError } = await crud.bulkUpdateField(sb, mitgenommen, { done: true });
			if (subError) { zurueck(); return; }
		}
		const { error } = await crud.updateTaskField(sb, id, { done });
		if (error) { zurueck(); return; }

		if (!done) return;
		toasts.undo(`„${kurz(task.text)}“ erledigt`, () => {
			void oeffneWieder(id, mitgenommen);
		});
	}

	/** Gegenstueck zum Abhaken — ohne neuen Toast, mitsamt der Kaskade. */
	async function oeffneWieder(id: string, subIds: string[]) {
		const zurueck = setzeFelder([id, ...subIds], { done: false });
		const { error } = await crud.updateTaskField(sb, id, { done: false });
		if (error) { zurueck(); return; }
		if (subIds.length === 0) return;
		const { error: subError } = await crud.bulkUpdateField(sb, subIds, { done: false });
		if (subError) zurueck();
	}

	async function updateTask(id: string, text: string) {
		const task = tasks.find((t) => t.id === id);
		const fields = task?.type === 'divider' ? { text, divider_label: text } : { text };
		const zurueck = setzeFelder([id], fields);
		const { error } = await crud.updateTaskField(sb, id, fields);
		if (error) zurueck();
	}

	async function changeTaskPriority(id: string, priority: Priority) {
		const zurueck = setzeFelder([id], { priority });
		const { error } = await crud.updateTaskField(sb, id, { priority });
		if (error) zurueck();
	}

	async function changeTaskTimeframe(id: string, timeframe: 'akut' | 'zeitnah' | 'mittelfristig' | 'langfristig' | null) {
		const zurueck = setzeFelder([id], { timeframe });
		const { error } = await crud.updateTaskField(sb, id, { timeframe });
		if (error) zurueck();
	}

	async function togglePin(id: string) {
		const task = tasks.find((t) => t.id === id);
		if (!task) return;
		const pinned = !task.pinned;
		// pinned_by haelt fest, WER gepinnt hat (fuer das "gepinnt von"-Badge);
		// beim Entpinnen wieder leeren.
		const pinned_by = pinned ? userId : null;
		const zurueck = setzeFelder([id], { pinned, pinned_by });
		const { error } = await crud.updateTaskField(sb, id, { pinned, pinned_by });
		if (error) zurueck();
	}

	/**
	 * Alle Pins loesen („Alle loesen" im Pinnwand-Menue).
	 *
	 * Gibt zurueck, WER jede Aufgabe angepinnt hatte. Nur damit laesst sich
	 * der Schritt zurueckrollen, ohne `pinned_by` auf denjenigen
	 * umzuschreiben, der „Rueckgaengig" drueckt. Drei fremde Leser
	 * (G2-Startbildschirm, InkyPi `pins.py`, Webhook `taskfuchs-read`) lesen
	 * `pinned` und `pinned_by` direkt aus der Datenbank — ein falscher Pinner
	 * waere dort sofort sichtbar.
	 */
	async function clearPinboard(): Promise<PinStand[]> {
		const vorher: PinStand[] = tasks
			.filter((t) => t.pinned)
			.map((t) => ({ id: t.id, pinned_by: t.pinned_by }));
		if (vorher.length === 0) return [];
		const zurueck = setzeFelder(
			vorher.map((p) => p.id),
			{ pinned: false, pinned_by: null }
		);
		const { error } = await crud.bulkUpdateField(
			sb,
			vorher.map((p) => p.id),
			{ pinned: false, pinned_by: null }
		);
		if (error) {
			zurueck();
			return [];
		}
		return vorher;
	}

	/** Gegenstueck zu `clearPinboard`: stellt Pin UND Pinner wieder her. */
	async function restorePins(stand: PinStand[]) {
		if (stand.length === 0) return;
		const zurueck = setzeFelderJeAufgabe(
			stand.map((p) => ({ id: p.id, felder: { pinned: true, pinned_by: p.pinned_by } }))
		);
		// Je Aufgabe ein eigener Schreibvorgang — `pinned_by` unterscheidet
		// sich von Zeile zu Zeile, ein bulk-Update koennte nur einen Wert.
		const ergebnisse = await Promise.all(
			stand.map((p) => crud.updateTaskField(sb, p.id, { pinned: true, pinned_by: p.pinned_by }))
		);
		if (ergebnisse.some((r) => r.error)) zurueck();
	}

	async function updateTaskNote(id: string, note: string) {
		const noteValue = note.trim() || null;
		const zurueck = setzeFelder([id], { note: noteValue });
		const { error } = await crud.updateTaskField(sb, id, { note: noteValue });
		if (error) zurueck();
	}

	async function moveTaskToList(taskId: string, targetListId: string) {
		const targetListTasks = tasks.filter((t) => t.list_id === targetListId && !t.parent_id);
		const position = targetListTasks.length;
		const descendantIds = getDescendantIds(taskId);
		const zurueck = setzeFelderJeAufgabe([
			{ id: taskId, felder: { list_id: targetListId, position } },
			...[...descendantIds].map((id) => ({ id, felder: { list_id: targetListId } }))
		]);
		const { error } = await crud.updateTaskField(sb, taskId, { list_id: targetListId, position });
		if (error) { zurueck(); return; }
		if (descendantIds.size > 0) {
			const { error: subErr } = await crud.bulkUpdateField(sb, [...descendantIds], { list_id: targetListId });
			if (subErr) zurueck();
		}
	}

	async function updateTaskDate(taskId: string, dueDate: string | null) {
		const zurueck = setzeFelder([taskId], { due_date: dueDate });
		const { error } = await crud.updateTaskField(sb, taskId, { due_date: dueDate });
		if (error) zurueck();
	}

	// ==========================================
	// SUBTASK CRUD
	// ==========================================
	async function addSubtask(parentId: string, text: string) {
		const parentTask = tasks.find((t) => t.id === parentId);
		if (!parentTask) return;
		const siblings = tasks.filter((t) => t.parent_id === parentId);
		const position = siblings.length;
		const optimisticSub: Task = {
			id: crypto.randomUUID(), list_id: parentTask.list_id, user_id: userId, parent_id: parentId,
			text, type: 'task', divider_label: null, done: false, priority: 'normal',
			timeframe: null, highlighted: false, pinned: false, pinned_by: null, emoji: null, note: null,
			due_date: null, assigned_to: null, calendar_event_id: null, abgelegt: false, position,
			created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1
		};
		tasks = [...tasks, optimisticSub];
		pendingTaskIds.add(optimisticSub.id);
		const fp = taskFingerprint(optimisticSub);
		pendingFingerprints.add(fp);
		const { data: newSub, error } = await crud.insertTask(sb, {
			list_id: parentTask.list_id, user_id: userId, parent_id: parentId, text, position
		});
		pendingTaskIds.delete(optimisticSub.id);
		pendingFingerprints.delete(fp);
		if (newSub && !error) {
			const serverId = (newSub as Task).id;
			tasks = tasks.filter((t) => t.id === optimisticSub.id || t.id !== serverId);
			tasks = tasks.map((t) => (t.id === optimisticSub.id ? (newSub as Task) : t));
		} else if (error) {
			tasks = tasks.filter((t) => t.id !== optimisticSub.id);
		}
	}

	async function updateSubtask(id: string, text: string) {
		const zurueck = setzeFelder([id], { text });
		const { error } = await crud.updateTaskField(sb, id, { text });
		if (error) zurueck();
	}

	async function deleteSubtask(id: string) {
		const sub = tasks.find((t) => t.id === id);
		if (!sub) return;
		tasks = tasks.filter((t) => t.id !== id);
		const { error } = await crud.deleteTaskDb(sb, id);
		if (error) wiederEinsetzen([sub]);
	}

	// ==========================================
	// BULK OPERATIONS
	// ==========================================
	async function bulkToggleDone(ids: string[], done: boolean) {
		const zurueck = setzeFelder(ids, { done });
		const { error } = await crud.bulkUpdateField(sb, ids, { done });
		if (error) zurueck();
	}

	async function bulkChangePriority(ids: string[], priority: Priority) {
		const zurueck = setzeFelder(ids, { priority });
		const { error } = await crud.bulkUpdateField(sb, ids, { priority });
		if (error) zurueck();
	}

	/**
	 * Mehrfachauswahl loeschen — mit Undo-Toast statt Rueckfrage
	 * (Spezifikation Abschnitt 6: ein Dialog steht nur dort, wo es kein
	 * Rueckgaengig gibt).
	 */
	async function bulkDelete(ids: string[]) {
		const idSet = new Set(ids);
		const geloescht = tasks.filter((t) => idSet.has(t.id) || idSet.has(t.parent_id ?? ''));
		if (geloescht.length === 0) return;
		const obenauf = geloescht.filter((t) => idSet.has(t.id)).length;
		await loescheMitUndo(
			geloescht,
			obenauf === 1 ? 'Aufgabe gelöscht' : `${obenauf} Aufgaben gelöscht`
		);
	}

	async function bulkMoveToList(ids: string[], targetListId: string) {
		const basePos = tasks.filter((t) => t.list_id === targetListId && !t.parent_id).length;
		const allDescendantIds = new Set<string>();
		for (const id of ids) {
			for (const dId of getDescendantIds(id)) allDescendantIds.add(dId);
		}
		const zurueck = setzeFelderJeAufgabe([
			...ids.map((id, i) => ({ id, felder: { list_id: targetListId, position: basePos + i } })),
			...[...allDescendantIds].map((id) => ({ id, felder: { list_id: targetListId } }))
		]);
		const { error } = await crud.bulkMoveToList(sb, ids, targetListId, basePos);
		if (error) { zurueck(); return; }
		if (allDescendantIds.size > 0) {
			const { error: descError } = await crud.bulkUpdateField(sb, [...allDescendantIds], { list_id: targetListId });
			if (descError) zurueck();
		}
	}

	// ==========================================
	// REORDER
	// ==========================================
	async function reorderTask(taskId: string, targetListId: string, newPosition: number) {
		const task = tasks.find((t) => t.id === taskId);
		if (!task) return;
		const sourceListId = task.list_id;
		const isMoving = sourceListId !== targetListId;

		// Visuelle Sortierung (gleich wie die offenen Zeilen in TaskList): nach position
		const visualSort = (a: Task, b: Task) => a.position - b.position;

		// 1. Off-by-one Fix: Bei Same-List-Moves den visuellen Ursprungsindex ermitteln
		let adjustedPos = newPosition;
		if (!isMoving) {
			const allVisual = tasks
				.filter((t) => t.list_id === targetListId && !t.parent_id)
				.filter((t) => t.type === 'divider' || !t.done)
				.sort(visualSort);
			const origIdx = allVisual.findIndex((t) => t.id === taskId);
			// UI-dropIdx basiert auf Liste MIT dem gedraggten Element.
			// targetItems hat es schon entfernt → Indizes ab origIdx verschieben sich.
			if (origIdx !== -1 && origIdx < newPosition) {
				adjustedPos = newPosition - 1;
			}
		}

		// 2. ALLE Top-Level-Items in der Zielliste, OHNE den gezogenen Task, visuell sortiert
		const targetItems = tasks
			.filter((t) => t.list_id === targetListId && !t.parent_id && t.id !== taskId)
			.filter((t) => t.type === 'divider' || !t.done)
			.sort(visualSort);

		// 3. Task an neuer (korrigierter) Position einfügen
		const clampedPos = Math.max(0, Math.min(adjustedPos, targetItems.length));
		targetItems.splice(clampedPos, 0, { ...task, list_id: targetListId } as Task);

		// 3. Neue Positionen zuweisen — ALLE Items (Tasks + Divider) sequentiell 0, 1, 2, ...
		const updates: { id: string; position: number; list_id?: string }[] = [];
		targetItems.forEach((t, i) => {
			const needsListUpdate = t.id === taskId && isMoving;
			if (t.position !== i || needsListUpdate) {
				updates.push({ id: t.id, position: i, ...(needsListUpdate ? { list_id: targetListId } : {}) });
			}
		});

		// 4. Bei Listwechsel: Quell-Liste komplett neu nummerieren (inkl. Divider)
		if (isMoving) {
			const sourceItems = tasks
				.filter((t) => t.list_id === sourceListId && !t.parent_id && t.id !== taskId)
				.filter((t) => t.type === 'divider' || !t.done)
				.sort((a, b) => a.position - b.position);
			sourceItems.forEach((t, i) => {
				if (t.position !== i) {
					updates.push({ id: t.id, position: i });
				}
			});
		}

		// 5. Bei Listwechsel: Nachkommen mitnehmen
		const descendantIds = isMoving ? getDescendantIds(taskId) : new Set<string>();
		if (isMoving && descendantIds.size > 0) {
			for (const dId of descendantIds) {
				updates.push({ id: dId, position: 0, list_id: targetListId });
			}
		}

		if (updates.length === 0) return;

		// 6. Optimistisch setzen — und nur die angefassten Felder merken
		const zurueck = setzeFelderJeAufgabe(
			updates.map((u) => ({
				id: u.id,
				felder: u.list_id ? { position: u.position, list_id: u.list_id } : { position: u.position }
			}))
		);

		// 7. DB-Updates persistieren
		const { error } = await crud.reorderTasksDb(sb, updates);
		if (error) zurueck();
	}

	async function reorderSubtask(subtaskId: string, targetParentId: string, newPosition: number) {
		const subtask = tasks.find((t) => t.id === subtaskId);
		if (!subtask || !subtask.parent_id) return;
		const sourceParentId = subtask.parent_id;
		const isMoving = sourceParentId !== targetParentId;

		// Get siblings in target parent (excluding dragged subtask), sorted by position
		const targetSiblings = tasks
			.filter((t) => t.parent_id === targetParentId && t.id !== subtaskId)
			.sort((a, b) => a.position - b.position);

		// Off-by-one fix for same-parent moves
		let adjustedPos = newPosition;
		if (!isMoving) {
			const allSiblings = tasks
				.filter((t) => t.parent_id === targetParentId)
				.sort((a, b) => a.position - b.position);
			const origIdx = allSiblings.findIndex((t) => t.id === subtaskId);
			if (origIdx !== -1 && origIdx < newPosition) {
				adjustedPos = newPosition - 1;
			}
		}

		const clampedPos = Math.max(0, Math.min(adjustedPos, targetSiblings.length));
		targetSiblings.splice(clampedPos, 0, { ...subtask, parent_id: targetParentId });

		// Build updates
		const updates: { id: string; position: number; parent_id?: string }[] = [];
		targetSiblings.forEach((t, i) => {
			const needsParentUpdate = t.id === subtaskId && isMoving;
			if (t.position !== i || needsParentUpdate) {
				updates.push({ id: t.id, position: i, ...(needsParentUpdate ? { parent_id: targetParentId } : {}) });
			}
		});

		// Renumber source parent siblings if cross-parent move
		if (isMoving) {
			const sourceSiblings = tasks
				.filter((t) => t.parent_id === sourceParentId && t.id !== subtaskId)
				.sort((a, b) => a.position - b.position);
			sourceSiblings.forEach((t, i) => {
				if (t.position !== i) {
					updates.push({ id: t.id, position: i });
				}
			});
		}

		if (updates.length === 0) return;

		const zurueck = setzeFelderJeAufgabe(
			updates.map((u) => ({
				id: u.id,
				felder: u.parent_id ? { position: u.position, parent_id: u.parent_id } : { position: u.position }
			}))
		);

		const { error } = await crud.reorderSubtasksDb(sb, updates);
		if (error) zurueck();
	}

	// ==========================================
	// LOESCHEN MIT RUECKGAENGIG — EINE SEMANTIK
	// ==========================================
	/** Zeilen wieder in den Bestand stellen, ohne vorhandene zu verdoppeln. */
	function wiederEinsetzen(zeilen: Task[]) {
		const vorhanden = new Set(tasks.map((t) => t.id));
		const fehlende = zeilen.filter((t) => !vorhanden.has(t.id));
		if (fehlende.length === 0) return;
		tasks = [...tasks, ...fehlende].sort((a, b) => a.position - b.position);
	}

	/**
	 * Loeschen mit Rueckgaengig — EIN Verfahren fuer alle Wege.
	 *
	 * Es gab zwei unvereinbare: sofortiges DB-Loeschen mit Re-Insert beim
	 * Rueckgaengig (einzelne Aufgabe) und lokales Loeschen mit verzoegertem
	 * DB-Loeschen nach acht Sekunden (Mehrfachauswahl, „Erledigte loeschen").
	 * Das zweite verlor den Loeschvorgang bei einem Neuladen innerhalb der
	 * Frist und zeigte die Aufgaben auf anderen Geraeten weiter. Geblieben
	 * ist das erste: sofort loeschen, beim Rueckgaengig wieder einfuegen —
	 * geraeteuebergreifend konsistent, und die Absicherung ueber
	 * `pendingTaskIds` gegen doppelte Realtime-Zeilen gab es schon.
	 *
	 * Den Verlauf der Aufgaben nimmt die Kaskade mit; die Datenbank legt ihn
	 * dabei in einen Papierkorb, aus dem `aufgabenZurueck` ihn nach dem
	 * Wiedereinfuegen zurueckholt — samt Autor, Zeiten und „Ist da".
	 */
	async function loescheMitUndo(geloescht: Task[], meldung: string) {
		if (geloescht.length === 0) return;
		const ids = geloescht.map((t) => t.id);
		const idSet = new Set(ids);
		tasks = tasks.filter((t) => !idSet.has(t.id));

		const { error } = await crud.bulkDeleteTasks(sb, ids);
		if (error) {
			wiederEinsetzen(geloescht);
			optionen.aufgabenZurueck?.(ids, false);
			toasts.error('Fehler beim Löschen');
			return;
		}

		// Eltern vor Kindern wieder einfuegen — `parent_id` zeigt auf eine
		// Zeile, die dann schon steht.
		const reihenfolge = [...geloescht].sort(
			(a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0)
		);

		toasts.undo(meldung, async () => {
			// Pending-IDs VOR dem Insert setzen, damit das Realtime-INSERT
			// dedupliziert wird und die Zeile nicht doppelt erscheint.
			for (const t of reihenfolge) pendingTaskIds.add(t.id);
			const { error: reErr } = await crud.reinsertTasks(sb, reihenfolge);
			if (reErr) {
				for (const t of reihenfolge) pendingTaskIds.delete(t.id);
				toasts.error('Wiederherstellen fehlgeschlagen.');
				return;
			}
			wiederEinsetzen(reihenfolge);
			// Erst jetzt, wo die Aufgaben wieder stehen: ihren Verlauf aus dem
			// Papierkorb zurueckholen (Migration 022, Abschnitt 6).
			optionen.aufgabenZurueck?.(ids, true);
			// Pending-IDs nach kurzer Verzoegerung aufraeumen (das
			// Realtime-Ereignis kann nachklappern).
			setTimeout(() => {
				for (const t of reihenfolge) pendingTaskIds.delete(t.id);
			}, 3000);
		});
	}

	/**
	 * Erledigte der OBERSTEN Ebene einer Liste — dieselbe Menge, die der
	 * Erledigt-Balken zeigt und das Listenmenue zaehlt.
	 */
	function erledigteObenauf(listId: string): Task[] {
		return tasks.filter(
			(t) => t.list_id === listId && t.done && !t.parent_id && t.type !== 'divider'
		);
	}

	/** Zaehler fuer den Zusatz „Erledigte loeschen (8)" im Listenmenue. */
	function erledigteAnzahl(listId: string): number {
		return erledigteObenauf(listId).length;
	}

	/**
	 * „Erledigte loeschen" — genau die erledigten Aufgaben der obersten
	 * Ebene samt ihren Unteraufgaben.
	 *
	 * Vorher stand hier `t.list_id === listId && t.done` OHNE `!t.parent_id`.
	 * Das nahm auch die erledigten Unteraufgaben noch OFFENER Aufgaben mit.
	 * Gezaehlt und angezeigt wird ueberall nur die oberste Ebene (Listenmenue,
	 * Erledigt-Balken), der Toast meldete darum eine hoehere Zahl als die
	 * Liste zeigte — und der Nutzer verlor Haken, die er in offenen Aufgaben
	 * gesetzt hatte. Das war der einzige echte Datenverlust im Umbau.
	 */
	async function deleteDoneInList(listId: string) {
		const eltern = erledigteObenauf(listId);
		if (eltern.length === 0) return;
		const elternIds = new Set(eltern.map((t) => t.id));
		const kinder = tasks.filter((t) => t.parent_id && elternIds.has(t.parent_id));
		await loescheMitUndo(
			[...eltern, ...kinder],
			eltern.length === 1
				? 'Eine erledigte Aufgabe gelöscht'
				: `${eltern.length} erledigte Aufgaben gelöscht`
		);
	}

	/** Einzelne Aufgabe loeschen — samt Unteraufgaben, mit Undo-Toast. */
	async function deleteTaskDirect(id: string) {
		const task = tasks.find((t) => t.id === id);
		if (!task) return;
		const kinder = tasks.filter((t) => t.parent_id === id);
		await loescheMitUndo([task, ...kinder], 'Aufgabe gelöscht');
	}

	// ==========================================
	// REALTIME
	// ==========================================
	function handleRealtimeList(eventType: string, payload: unknown) {
		if (eventType === 'INSERT') {
			const newList = payload as List;
			if (!lists.some((l) => l.id === newList.id) && !pendingListIds.has(newList.id)) {
				lists = [...lists, newList];
			}
		} else if (eventType === 'UPDATE') {
			const updated = payload as List;
			lists = lists.map((l) => (l.id === updated.id ? updated : l));
		} else if (eventType === 'DELETE') {
			const old = payload as { id: string };
			lists = lists.filter((l) => l.id !== old.id);
		}
	}

	function handleRealtimeTask(eventType: string, payload: unknown) {
		if (eventType === 'INSERT') {
			const newTask = payload as Task;
			// Exakte ID-Match (Server-ID bereits bekannt)
			if (pendingTaskIds.has(newTask.id)) {
				pendingTaskIds.delete(newTask.id);
				tasks = tasks.map((t) => (t.id === newTask.id ? newTask : t));
				return;
			}
			// Duplikat-Check: ID bereits im State
			if (tasks.some((t) => t.id === newTask.id)) return;
			// Fingerprint-Check: Realtime-Event kam vor HTTP-Response → optimistische Task existiert bereits
			const fp = taskFingerprint(newTask);
			if (pendingFingerprints.has(fp)) {
				const optimistic = tasks.find((t) => pendingTaskIds.has(t.id) && taskFingerprint(t) === fp);
				if (optimistic) {
					pendingTaskIds.delete(optimistic.id);
					pendingFingerprints.delete(fp);
					tasks = tasks.map((t) => (t.id === optimistic.id ? newTask : t));
					return;
				}
			}
			tasks = [...tasks, newTask];
			// Weder Pending- noch Fingerprint-Treffer: diese Zeile hat diese
			// Sitzung nicht geschrieben. Sie kommt von aussen und bekommt den
			// Marker (Unteraufgaben tragen keinen — der Marker sitzt an der
			// Zeile, nicht am Eintrag darunter).
			if (!newTask.parent_id) markiereNeu(newTask.id);
		} else if (eventType === 'UPDATE') {
			const updated = payload as Task;
			tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
		} else if (eventType === 'DELETE') {
			const old = payload as { id: string };
			tasks = tasks.filter((t) => t.id !== old.id);
			if (neuIds.includes(old.id)) neuIds = neuIds.filter((id) => id !== old.id);
		}
	}

	/**
	 * Bestand nach dem Verbinden neu laden.
	 *
	 * Supabase Realtime holt verpasste Ereignisse nicht nach: was waehrend
	 * einer Unterbrechung geschah, war bisher dauerhaft verloren — die
	 * Oberflaeche zeigte bis zum naechsten Neuladen einen veralteten Stand.
	 * Der SUBSCRIBED-Rueckruf der beiden Kanaele ruft das hier auf; er feuert
	 * beim ersten Verbinden UND nach jedem Wiederverbinden.
	 */
	async function resync() {
		if (!sb) return;
		const frisch = await crud.loadUserData(sb, userId);
		// Gerade abgeschickte, noch unbestaetigte Zeilen ueberleben: sie
		// stehen noch nicht in der Antwort und wuerden sonst kurz
		// verschwinden und gleich darauf wiederkommen.
		const bekannt = new Set(frisch.tasks.map((t) => t.id));
		const schwebend = tasks.filter((t) => pendingTaskIds.has(t.id) && !bekannt.has(t.id));
		lists = frisch.lists;
		tasks = schwebend.length > 0 ? [...frisch.tasks, ...schwebend] : frisch.tasks;
		// Marker, deren Zeile es nicht mehr gibt, fallen mit.
		if (neuIds.length > 0) neuIds = neuIds.filter((id) => bekannt.has(id));
	}

	return {
		get tasks() { return tasks; },
		get lists() { return lists; },
		get sb() { return sb; },
		get userId() { return userId; },
		init, resync,
		// List operations
		createList, renameList, deleteList, changeListIcon, reorderList,
		// Task operations
		addTask, toggleTask, updateTask, deleteTaskDirect,
		changeTaskPriority, changeTaskTimeframe,
		togglePin, clearPinboard, restorePins,
		updateTaskNote, moveTaskToList, updateTaskDate,
		// Subtask operations
		addSubtask, updateSubtask, deleteSubtask,
		// List-level operations
		deleteDoneInList, erledigteAnzahl,
		// Bulk operations
		bulkToggleDone, bulkChangePriority, bulkDelete, bulkMoveToList,
		// Reorder
		reorderTask, reorderSubtask,
		// „neu"-Marker
		istNeu, listeGesehen,
		// Realtime
		handleRealtimeList, handleRealtimeTask
	};
}
