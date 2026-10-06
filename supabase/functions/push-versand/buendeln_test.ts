import { assertEquals } from '@std/assert';
import { verdichten } from './buendeln.ts';
import type { Ereignis } from './typen.ts';

const e = (task_id: string, art: Ereignis['art'], text = task_id, at = '2026-10-06T10:00:00Z'): Ereignis => ({
	task_id,
	art,
	text,
	at,
});

Deno.test('leere Liste ergibt gesamt 0', () => {
	assertEquals(verdichten([]).gesamt, 0);
});

Deno.test('neu dann geloescht derselben Aufgabe faellt weg', () => {
	const v = verdichten([e('a', 'neu'), e('a', 'geaendert'), e('a', 'geloescht')]);
	assertEquals(v.gesamt, 0);
});

Deno.test('neu dann erledigt bleibt neu', () => {
	const v = verdichten([e('a', 'neu'), e('a', 'erledigt')]);
	assertEquals(v.anzahl.neu, 1);
	assertEquals(v.anzahl.erledigt, 0);
});

Deno.test('ohne neu gilt die letzte Art', () => {
	const v = verdichten([e('a', 'erledigt'), e('a', 'wieder_offen'), e('a', 'erledigt')]);
	assertEquals(v.anzahl.erledigt, 1);
	assertEquals(v.gesamt, 1);
});

Deno.test('Zaehlung und Beispiele je Art, hoechstens 3, Reihenfolge des Auftretens', () => {
	const v = verdichten([
		e('a', 'neu', 'Milch'),
		e('b', 'neu', 'Brot'),
		e('c', 'neu', 'Eier'),
		e('d', 'neu', 'Butter'),
		e('x', 'erledigt', 'Kaese'),
	]);
	assertEquals(v.anzahl.neu, 4);
	assertEquals(v.beispiele.neu, ['Milch', 'Brot', 'Eier']);
	assertEquals(v.anzahl.erledigt, 1);
	assertEquals(v.gesamt, 5);
});

Deno.test('einzig gesetzt bei genau einer Aufgabe, mit letztem Text', () => {
	const v = verdichten([e('a', 'geaendert', 'Milch'), e('a', 'geaendert', 'Hafermilch')]);
	assertEquals(v.einzig, { art: 'geaendert', text: 'Hafermilch' });
});

Deno.test('unbekannte Art wird ignoriert statt zu werfen', () => {
	// deno-lint-ignore no-explicit-any
	const v = verdichten([{ task_id: 'a', art: 'quatsch' as any, text: 'x', at: '' }]);
	assertEquals(v.gesamt, 0);
});
