/**
 * Hat sich die Anmeldung wirklich geändert? Grundlage für die Frage, ob das
 * Wurzel-Layout nach einem `onAuthStateChange` seine Daten neu laden muss.
 *
 * Supabase meldet dieselbe Sitzung mehrfach: als INITIAL_SESSION direkt nach
 * dem Start und als SIGNED_IN, wenn die App aus dem Hintergrund zurückkehrt.
 * Jede Invalidierung setzt in SvelteKit `page.state` zurück — und damit den
 * Zurück-Wächter der mobilen Oberfläche, der dann die offene Liste schließt.
 * Neu geladen wird darum nur bei Anmelden, Abmelden und erneuertem Token
 * (andere `expires_at`). Das ist das Muster aus der Supabase-Anleitung für
 * SvelteKit.
 */
export function sitzungGeaendert(
	alt: { expires_at?: number } | null | undefined,
	neu: { expires_at?: number } | null | undefined
): boolean {
	return neu?.expires_at !== alt?.expires_at;
}
