import { error } from '@sveltejs/kit';

/**
 * Vorschau der Seite „Benachrichtigungen" ohne Login — NUR im Dev-Modus.
 * Gleiche Riegel wie `routes/vorschau/+page.ts`: `hooks.server.ts` beantwortet
 * jeden Pfad unter `/vorschau` produktiv mit 404, dieser Wurf ist die zweite
 * Reihe. Die Seite liest und schreibt nichts in der Produktivdatenbank.
 */
export function load() {
	if (!import.meta.env.DEV) error(404, 'Nicht gefunden');
	return {};
}

export const ssr = false;
export const prerender = false;
