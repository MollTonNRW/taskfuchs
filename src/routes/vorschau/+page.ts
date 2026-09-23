import { error } from '@sveltejs/kit';

/**
 * Vorschau der Richtung A „Klar" ohne Login — NUR im Dev-Modus.
 *
 * Die App hinter `/app` verlangt eine Supabase-Sitzung. Fuer die Abnahme und
 * fuer Franks erstes Ansehen gibt es keine, und es soll auch keine geben:
 * diese Route liest nichts aus der Produktivdatenbank und schreibt nichts
 * hinein. Sie mountet dieselbe Shell mit Demodaten im Arbeitsspeicher.
 *
 * `import.meta.env.DEV` ist zur Bauzeit bekannt; im Produktionsbuendel bleibt
 * von der Route nur dieses `error(404)` uebrig.
 */
export function load() {
	if (!import.meta.env.DEV) error(404, 'Nicht gefunden');

	// SSR aus: die Vorschau baut ihren Zustand aus Abfrageparametern,
	// localStorage und Fensterbreite — alles Dinge, die auf dem Server nicht
	// existieren. Ein servergerenderter erster Baum waere garantiert ein
	// anderer als der erste Baum im Browser.
	return {};
}

export const ssr = false;
export const prerender = false;
