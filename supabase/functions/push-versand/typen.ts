// typen.ts — gemeinsame Typen der Edge Function push-versand.
// Form der Bündel: Rückgabe von public.push_buendel_abholen() (Spec: Schnittstellen).

export type Art = 'neu' | 'erledigt' | 'wieder_offen' | 'geaendert' | 'geloescht';

export interface Ereignis {
	task_id: string;
	art: Art;
	text: string;
	at: string;
}

export interface Abo {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export interface Empfaenger {
	user_id: string;
	abos: Abo[];
}

export interface Buendel {
	list_id: string;
	list_title: string;
	list_kind: 'aufgaben' | 'einkauf';
	actor_id: string;
	actor_name: string;
	via_agent: boolean;
	events: Ereignis[];
	empfaenger: Empfaenger[];
}

export const ARTEN: Art[] = ['neu', 'erledigt', 'wieder_offen', 'geaendert', 'geloescht'];

export interface Verdichtet {
	anzahl: Record<Art, number>;
	beispiele: Record<Art, string[]>;
	gesamt: number;
	einzig?: { art: Art; text: string };
}

// Erinnerungen an Fristen: Rückgabe von public.push_fristen_abholen() (Migration 028).
// due_date ist der Text aus tasks.due_date: „YYYY-MM-DD“ oder „YYYY-MM-DDTHH:MM“ (Ortszeit Berlin).

export interface FristAufgabe {
	task_id: string;
	text: string;
	due_date: string;
	list_id: string;
	list_title: string;
}

/** Tagesmeldung einer Person: höchstens 20 Aufgaben (früheste Frist zuerst), `anzahl` zählt alle. */
export interface Tagesmeldung {
	user_id: string;
	heute: string;
	anzahl: number;
	aufgaben: FristAufgabe[];
	abos: Abo[];
}

/**
 * Erinnerung an eine Aufgabe mit Uhrzeit, `vorlauf` Minuten vorher. `minuten_bis` sind die
 * Minuten bis zur Frist beim Abholen (aufgerundet, ≤ 0 = schon erreicht).
 */
export interface Termin {
	user_id: string;
	task_id: string;
	text: string;
	due_date: string;
	vorlauf: number;
	minuten_bis: number;
	list_id: string;
	list_title: string;
	abos: Abo[];
}

export interface Erinnerungen {
	tage: Tagesmeldung[];
	termine: Termin[];
}
