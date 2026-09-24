/**
 * Supabase-Attrappe der Vorschau-Route — ein Datenbestand im Arbeitsspeicher.
 *
 * Warum ueberhaupt eine Attrappe statt einer eigenen Vorschau-Oberflaeche:
 * `/vorschau` soll DIESELBE Shell, DENSELBEN Store (`stores/tasks.svelte.ts`)
 * und DIESELBEN Komponenten zeigen wie `/app`. Der Store schreibt jede
 * Aenderung ueber `services/supabase-crud.ts`; bekaeme er dort einen Fehler,
 * rollte er jede Bedienung sofort wieder zurueck und die Vorschau waere tot.
 * Also bekommt er einen Gespraechspartner, der sich wie die Datenbank verhaelt
 * — nur eben im Speicher dieses einen Tabs.
 *
 * Abgedeckt ist genau der Ausschnitt, den `supabase-crud.ts` und
 * `useShareDialog.svelte.ts` benutzen: `select/insert/update/delete` mit
 * `eq`, `in`, `is` und `order`, dazu `rpc('lookup_user_by_email')`,
 * `auth.signOut` und die Realtime-Kanaele. Mehr braucht die App nicht, und
 * mehr soll hier auch nicht entstehen.
 *
 * Fuer `task_history` spielt die Attrappe zusaetzlich den Stempel-Trigger
 * aus Migration 022 nach (Autor, Zeiten, „Ist da"): der Client schickt wie
 * gegen die echte Datenbank nur Art und Text bzw. `resolved_at` — ohne den
 * Nachbau stuende in der Vorschau kein Name am „Ist da".
 *
 * Diese Datei wird ausschliesslich von `src/routes/vorschau/` geladen, und
 * diese Route wirft ausserhalb des Dev-Modus `error(404)`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

type Zeile = Record<string, unknown>;
type Tabelle = 'lists' | 'tasks' | 'list_shares' | 'profiles' | 'task_history';
type Antwort<T> = { data: T; error: null };

/** Fortlaufende, gut lesbare IDs — eine UUID darf in der Vorschau nicht auftauchen. */
let zaehler = 0;
function neueId(tabelle: Tabelle): string {
	return `${tabelle}-${++zaehler}`;
}

/** Vorgaben der Tabelle fuer eine frisch eingefuegte Zeile. */
function vervollstaendige(tabelle: Tabelle, eingabe: Zeile): Zeile {
	const jetzt = new Date().toISOString();
	if (tabelle === 'task_history') {
		// Keine Spalte `updated_at` — die Historie fuehrt `edited_at`.
		return {
			created_by: null, edited_at: null, edited_by: null, resolved_at: null, resolved_by: null,
			...eingabe,
			id: eingabe.id ?? neueId(tabelle),
			created_at: jetzt
		};
	}
	const basis: Zeile = { id: eingabe.id ?? neueId(tabelle), created_at: jetzt, updated_at: jetzt };
	if (tabelle === 'lists') {
		return { visible: true, version: 1, icon: '📋', title: 'Neue Liste', position: 0, ...basis, ...eingabe };
	}
	if (tabelle === 'tasks') {
		return {
			done: false, priority: 'normal', timeframe: null, highlighted: false, pinned: false,
			pinned_by: null, emoji: null, note: null, due_date: null, position: 0,
			type: 'task', divider_label: null, parent_id: null, assigned_to: null,
			calendar_event_id: null, version: 1,
			...basis,
			...eingabe
		};
	}
	if (tabelle === 'list_shares') {
		return { role: 'editor', ...basis, ...eingabe };
	}
	return { username: null, display_name: null, avatar_url: null, ...basis, ...eingabe };
}

type Modus = 'select' | 'insert' | 'update' | 'delete';

/**
 * Nachbau des Triggers `task_history_stempeln` (Migration 022) fuer einen
 * angemeldeten Nutzer. INSERT: Autor und Zeitpunkt, nichts eingeloest.
 * UPDATE: Aufgabe, Art, Autor und Zeitpunkt bleiben; geaenderter Text
 * stempelt „bearbeitet"; `resolved_at` von leer auf gesetzt stempelt
 * „Ist da", zurueck auf leer leert beides.
 */
function stempleVerlauf(ich: string, neu: Zeile, alt?: Zeile): Zeile {
	const jetzt = new Date().toISOString();
	if (!alt) {
		return { ...neu, created_by: ich, created_at: jetzt, edited_at: null, edited_by: null, resolved_at: null, resolved_by: null };
	}
	const z: Zeile = { ...neu, task_id: alt.task_id, kind: alt.kind, created_by: alt.created_by, created_at: alt.created_at };
	if (neu.body !== alt.body) {
		z.edited_at = jetzt;
		z.edited_by = ich;
	} else {
		z.edited_at = alt.edited_at;
		z.edited_by = alt.edited_by;
	}
	if (!neu.resolved_at) {
		z.resolved_at = null;
		z.resolved_by = null;
	} else if (!alt.resolved_at) {
		z.resolved_at = jetzt;
		z.resolved_by = ich;
	} else {
		z.resolved_at = alt.resolved_at;
		z.resolved_by = alt.resolved_by;
	}
	return z;
}

/**
 * Ein Abfrageschritt. Wie beim echten Client sammelt er Filter ein und
 * fuehrt erst beim `await` aus (`then` macht ihn zum Thenable).
 */
class Abfrage<T> implements PromiseLike<Antwort<T>> {
	#bestand: Zeile[];
	#modus: Modus;
	#felder: Zeile;
	#neu: Zeile[];
	#filter: ((z: Zeile) => boolean)[] = [];
	#sortierung: string | null = null;
	/** Nur `task_history`: angemeldeter Nutzer fuer den Trigger-Nachbau. */
	#verlaufVon: string | null;
	/** Laeuft nach dem Ausfuehren — hier: die Kaskade nach dem Loeschen von Aufgaben. */
	#nachher: (() => void) | null;

	constructor(
		bestand: Zeile[],
		modus: Modus,
		felder: Zeile = {},
		neu: Zeile[] = [],
		verlaufVon: string | null = null,
		nachher: (() => void) | null = null
	) {
		this.#bestand = bestand;
		this.#modus = modus;
		this.#felder = felder;
		this.#neu = neu;
		this.#verlaufVon = verlaufVon;
		this.#nachher = nachher;
	}

	eq(spalte: string, wert: unknown): this {
		this.#filter.push((z) => z[spalte] === wert);
		return this;
	}

	in(spalte: string, werte: unknown[]): this {
		const menge = new Set(werte);
		this.#filter.push((z) => menge.has(z[spalte]));
		return this;
	}

	/** `is('resolved_at', null)` — fehlende Spalte zaehlt wie in SQL als NULL. */
	is(spalte: string, wert: null | boolean): this {
		this.#filter.push((z) => (z[spalte] ?? null) === wert);
		return this;
	}

	order(spalte: string): this {
		this.#sortierung = spalte;
		return this;
	}

	/** `insert(...).select()` — die eingefuegten Zeilen zurueckgeben. */
	select(): this {
		return this;
	}

	/** `insert(...).select().single()` — genau die eine eingefuegte Zeile. */
	single(): PromiseLike<Antwort<Zeile | null>> {
		const eingefuegt = this.#ausfuehren();
		return Promise.resolve({ data: eingefuegt[0] ?? null, error: null });
	}

	#passend(): Zeile[] {
		return this.#bestand.filter((z) => this.#filter.every((f) => f(z)));
	}

	/**
	 * Zeilen der Historie gehen als KOPIE hinaus: der Store haelt sie, und ein
	 * spaeteres `Object.assign` hier drin veraenderte sonst sein Objekt an
	 * der Reaktivitaet vorbei. Die uebrigen Tabellen bleiben, wie sie waren.
	 */
	#ausfuehren(): Zeile[] {
		const zeilen = this.#ausfuehrenRoh();
		this.#nachher?.();
		return this.#verlaufVon ? zeilen.map((z) => ({ ...z })) : zeilen;
	}

	#ausfuehrenRoh(): Zeile[] {
		if (this.#modus === 'insert') {
			const ich = this.#verlaufVon;
			const neu = ich ? this.#neu.map((z) => stempleVerlauf(ich, z)) : this.#neu;
			this.#bestand.push(...neu);
			return neu;
		}
		if (this.#modus === 'update') {
			const treffer = this.#passend();
			const ich = this.#verlaufVon;
			for (const z of treffer) {
				if (ich) Object.assign(z, stempleVerlauf(ich, { ...z, ...this.#felder }, { ...z }));
				else Object.assign(z, this.#felder, { updated_at: new Date().toISOString() });
			}
			return treffer;
		}
		if (this.#modus === 'delete') {
			const treffer = new Set(this.#passend());
			for (let i = this.#bestand.length - 1; i >= 0; i--) {
				if (treffer.has(this.#bestand[i])) this.#bestand.splice(i, 1);
			}
			return [...treffer];
		}
		const treffer = this.#passend();
		const spalte = this.#sortierung;
		if (!spalte) return treffer;
		return [...treffer].sort((a, b) => Number(a[spalte] ?? 0) - Number(b[spalte] ?? 0));
	}

	then<E1 = Antwort<T>, E2 = never>(
		beiErfolg?: ((wert: Antwort<T>) => E1 | PromiseLike<E1>) | null,
		beiFehler?: ((grund: unknown) => E2 | PromiseLike<E2>) | null
	): PromiseLike<E1 | E2> {
		const daten = this.#ausfuehren() as unknown as T;
		return Promise.resolve({ data: daten, error: null as null }).then(beiErfolg, beiFehler);
	}
}

/** Ein Realtime-Kanal, der nie etwas meldet — die Vorschau hat keine zweite Quelle. */
function kanal() {
	const k = {
		on: () => k,
		/**
		 * Bewusst OHNE Rueckruf: ein `SUBSCRIBED` loeste `store.resync()` aus und
		 * liesse die Vorschau waehrend der Aufnahme nachladen. Fuer einen
		 * Bestand, der sich nur in diesem Tab aendert, gibt es nichts zu holen.
		 */
		subscribe: () => k,
		unsubscribe: () => Promise.resolve('ok')
	};
	return k;
}

export type DemoBestand = {
	lists: Zeile[];
	tasks: Zeile[];
	list_shares: Zeile[];
	profiles: Zeile[];
	task_history?: Zeile[];
};

/**
 * Baut die Attrappe ueber einer KOPIE der Demodaten — der Modul-Bestand in
 * `fixtures.ts` bleibt unberuehrt, ein Neuladen der Seite stellt den
 * Ausgangszustand wieder her.
 */
export function baueAttrappe(start: DemoBestand, ich: string): SupabaseClient<Database> {
	const bestand: Record<Tabelle, Zeile[]> = {
		lists: start.lists.map((z) => ({ ...z })),
		tasks: start.tasks.map((z) => ({ ...z })),
		list_shares: start.list_shares.map((z) => ({ ...z })),
		profiles: start.profiles.map((z) => ({ ...z })),
		task_history: (start.task_history ?? []).map((z) => ({ ...z }))
	};

	/**
	 * `on delete cascade` aus Migration 022: faellt eine Aufgabe weg, geht ihr
	 * Verlauf mit — sofort beim Loeschen, wie in der Datenbank. Die Attrappe
	 * kennt keine Fremdschluessel; ohne das tauchte der Verlauf nach dem
	 * Rueckgaengig des Loeschens wieder auf.
	 */
	function kaskade() {
		const aufgaben = new Set(bestand.tasks.map((t) => t.id));
		for (let i = bestand.task_history.length - 1; i >= 0; i--) {
			if (!aufgaben.has(bestand.task_history[i].task_id)) bestand.task_history.splice(i, 1);
		}
	}

	const attrappe = {
		from(tabelle: Tabelle) {
			const zeilen = bestand[tabelle] ?? [];
			const verlaufVon = tabelle === 'task_history' ? ich : null;
			return {
				select: () => new Abfrage<Zeile[]>(zeilen, 'select', {}, [], verlaufVon),
				insert: (eingabe: Zeile | Zeile[]) =>
					new Abfrage<Zeile[]>(
						zeilen,
						'insert',
						{},
						(Array.isArray(eingabe) ? eingabe : [eingabe]).map((z) => vervollstaendige(tabelle, z)),
						verlaufVon
					),
				update: (felder: Zeile) => new Abfrage<Zeile[]>(zeilen, 'update', felder, [], verlaufVon),
				delete: () =>
					new Abfrage<Zeile[]>(zeilen, 'delete', {}, [], verlaufVon, tabelle === 'tasks' ? kaskade : null)
			};
		},

		/** Einziger genutzter Aufruf: die E-Mail-Suche des Teilen-Dialogs. */
		rpc(_name: string, args: { lookup_email?: string }) {
			const lokal = (args?.lookup_email ?? '').split('@')[0]?.toLowerCase();
			const treffer = bestand.profiles.find((p) => String(p.username ?? '').toLowerCase() === lokal);
			return Promise.resolve({ data: (treffer?.id as string) ?? null, error: null });
		},

		auth: {
			signOut: () => Promise.resolve({ error: null })
		},

		channel: () => kanal(),
		removeChannel: () => Promise.resolve('ok')
	};

	// Die Attrappe deckt genau den benutzten Ausschnitt ab; der volle
	// Client-Typ ist um ein Vielfaches groesser und hier ohne Belang.
	return attrappe as unknown as SupabaseClient<Database>;
}
