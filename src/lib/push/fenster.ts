// Ziel einer angetippten Meldung in einem Fenster öffnen. Vom Service Worker genutzt;
// `clients` ist injizierbar, damit die Logik ohne Browser testbar bleibt.

/** Das, was von einem Fenster (`WindowClient`) gebraucht wird. */
export interface Fenster {
	url: string;
	focus(): Promise<unknown>;
	navigate(url: string): Promise<unknown>;
}

/** Das, was von `self.clients` gebraucht wird. */
export interface FensterVerwaltung {
	matchAll(optionen: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly Fenster[]>;
	openWindow(url: string): Promise<unknown>;
}

/**
 * Ein offenes Fenster der App auf `ziel` setzen und nach vorn holen, sonst ein neues öffnen.
 *
 * Fenster, die dieser Service Worker nicht kontrolliert, werden übergangen: `navigate`
 * wirft bei ihnen immer (TypeError). Sie zu fokussieren brächte sie nur nach vorn,
 * während danach doch ein neues Fenster aufginge.
 */
export async function zielOeffnen(clients: FensterVerwaltung, ziel: string, origin: string): Promise<void> {
	const fenster = await clients.matchAll({ type: 'window', includeUncontrolled: false }).catch(() => []);
	for (const f of fenster) {
		if (new URL(f.url).origin !== origin) continue;
		// Fokus braucht die Nutzergeste des Tipps; ein Fehlschlag soll das Navigieren nicht verhindern.
		await f.focus().catch(() => undefined);
		try {
			await f.navigate(ziel);
			return;
		} catch {
			// nächstes Fenster bzw. unten ein neues öffnen
		}
	}
	await clients.openWindow(ziel);
}
