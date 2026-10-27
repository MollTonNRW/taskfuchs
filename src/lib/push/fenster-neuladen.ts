// Offene Fenster nach einem Update des Service Workers neu laden. Vom Service Worker
// genutzt; `clients` ist injizierbar, damit die Logik ohne Browser testbar bleibt.
//
// Hintergrund: Chrome stellt in der TWA beim Kaltstart die zuletzt geladene Seite
// samt altem Build aus dem Cache wieder her. Builds ab 28.09. prüfen selbst auf
// eine neue Fassung (`aktualisierung.ts`), ältere nicht — sie blieben wochenlang
// auf der alten Oberfläche. Der Service Worker erreicht auch sie: Nach seinem
// Update setzt er jedes Fenster per `navigate` neu auf, und eine echte Navigation
// holt das HTML (`no-store`) vom Server statt aus der Wiederherstellung.

/** Das, was von einem Fenster (`WindowClient`) gebraucht wird. */
export interface NeuladbaresFenster {
	url: string;
	navigate(url: string): Promise<unknown>;
}

/** Das, was von `self.clients` gebraucht wird. */
export interface NeuladbareFenster {
	matchAll(optionen: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly NeuladbaresFenster[]>;
}

/**
 * Ob gerade eine neue Fassung eine ältere ablöst: Dann liegt neben dem eigenen
 * noch ein Cache einer früheren Fassung (`cache-<version>`). Bei der
 * Erstinstallation nicht — die Seite, die den Service Worker eben angemeldet
 * hat, ist schon aktuell und soll nicht flackern.
 */
export function istUpdate(cacheNamen: readonly string[], eigenerCache: string): boolean {
	return cacheNamen.some((name) => name !== eigenerCache && name.startsWith('cache-'));
}

/** Jedes kontrollierte Fenster der eigenen Origin an seiner Adresse neu laden. */
export async function fensterNeuLaden(clients: NeuladbareFenster, origin: string): Promise<void> {
	const fenster = await clients.matchAll({ type: 'window', includeUncontrolled: false }).catch(() => []);
	for (const f of fenster) {
		if (new URL(f.url).origin !== origin) continue;
		await f.navigate(f.url).catch(() => undefined);
	}
}
