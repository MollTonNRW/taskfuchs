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
