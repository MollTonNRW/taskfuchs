import type { Database } from '$lib/types/database';

/**
 * Aufgabenhistorie — gemeinsame Bausteine fuer Store, Detail und Zeile.
 *
 * Ein Eintrag ist entweder ein „Stand" (was schon passiert ist) oder ein
 * „Wartet auf" (worauf gerade gewartet wird). Solange mindestens ein
 * Warte-Eintrag offen ist und die Aufgabe nicht erledigt, traegt ihre Zeile
 * eine Sanduhr. Spezifikation:
 * docs/superpowers/specs/2026-09-24-aufgabenhistorie-design.md
 */
export type Eintrag = Database['public']['Tables']['task_history']['Row'];
export type Eintragsart = Eintrag['kind'];

/** Hoechstlaenge eines Eintrags — dieselbe Grenze wie der CHECK in Migration 022. */
export const EINTRAG_MAX = 1000;

/**
 * Jetzt als ISO-Zeitstempel — fuer optimistische Zeilen, bis der Server
 * seinen eigenen Stempel liefert. Steht hier und nicht im Store, weil die
 * Lint-Regel `prefer-svelte-reactivity` jedes `new Date()` in einer
 * `.svelte.ts` fuer reaktiven Zustand haelt.
 */
export function jetztIso(): string {
	return new Date().toISOString();
}

function zeitwert(wert: string): number {
	const ms = Date.parse(wert);
	return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Neueste zuerst. Verglichen wird der Zeitpunkt, nicht der Text: der Server
 * liefert `…123456+00:00`, eine optimistische Zeile `…123Z` — als Zeichenkette
 * waeren beide nicht vergleichbar. Bei gleichem Zeitpunkt entscheidet die ID,
 * damit die Reihenfolge stabil bleibt.
 */
export function neuesteZuerst(a: Eintrag, b: Eintrag): number {
	const unterschied = zeitwert(b.created_at) - zeitwert(a.created_at);
	if (unterschied !== 0) return unterschied;
	return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Offen heisst: ein Warte-Eintrag ohne „Ist da". */
export function istOffenerWarteEintrag(e: Eintrag): boolean {
	return e.kind === 'wartet' && !e.resolved_at;
}

/** Angefangene, noch nicht eingetragene Eingabe zu einer Aufgabe. */
export type Entwurf = { art: Eintragsart; text: string };

function einzeilig(text: string, max: number): string {
	const t = text.replace(/\s+/g, ' ').trim();
	return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Eintragstext einzeilig und gekuerzt — fuer die `aria-label`s der Knoepfe
 * am Eintrag. Ohne ihn hiessen in der Knopfliste eines Screenreaders alle
 * gleich („Ist da", „Ist da", …).
 */
export function kurzfassung(text: string, max = 40): string {
	return einzeilig(text, max);
}

/**
 * Beschriftung der Sanduhr in der Zeile: „Wartet auf: <neuester offener>",
 * bei mehreren zusaetzlich „und N weitere". Erwartet die offenen Eintraege
 * neueste zuerst; leer, wenn nichts offen ist.
 */
export function warteHinweis(offene: Eintrag[]): string {
	if (offene.length === 0) return '';
	const text = einzeilig(offene[0].body, 80);
	const weitere = offene.length - 1;
	return weitere > 0 ? `Wartet auf: ${text} und ${weitere} weitere` : `Wartet auf: ${text}`;
}
