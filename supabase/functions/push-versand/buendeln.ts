// buendeln.ts — reine Verdichtung der Ereignisse einer Gruppe (Spec: Verdichtung je Aufgabe).
import { type Art, ARTEN, type Ereignis, type Verdichtet } from './typen.ts';

const MAX_BEISPIELE = 3;

export function verdichten(events: Ereignis[]): Verdichtet {
	const reihenfolge: string[] = [];
	const jeAufgabe = new Map<string, Ereignis[]>();
	for (const ev of events) {
		if (!ARTEN.includes(ev.art)) continue;
		if (!jeAufgabe.has(ev.task_id)) {
			jeAufgabe.set(ev.task_id, []);
			reihenfolge.push(ev.task_id);
		}
		jeAufgabe.get(ev.task_id)!.push(ev);
	}

	const anzahl = Object.fromEntries(ARTEN.map((a) => [a, 0])) as Record<Art, number>;
	const beispiele = Object.fromEntries(ARTEN.map((a) => [a, [] as string[]])) as Record<Art, string[]>;
	let gesamt = 0;
	let einzig: Verdichtet['einzig'];

	for (const id of reihenfolge) {
		const folge = jeAufgabe.get(id)!;
		const erstes = folge[0];
		const letztes = folge[folge.length - 1];
		if (erstes.art === 'neu' && letztes.art === 'geloescht') continue;
		const art: Art = folge.some((f) => f.art === 'neu') ? 'neu' : letztes.art;

		anzahl[art] += 1;
		gesamt += 1;
		const text = letztes.text;
		if (beispiele[art].length < MAX_BEISPIELE && text) beispiele[art].push(text);
		einzig = { art, text };
	}

	return { anzahl, beispiele, gesamt, einzig: gesamt === 1 ? einzig : undefined };
}
