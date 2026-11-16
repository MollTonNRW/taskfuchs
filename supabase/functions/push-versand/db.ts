// db.ts — die RPC-Aufrufe der Function (Bündel und Erinnerungen abholen, Ergebnis melden) mit neutralen Fehlermeldungen.
// Dünn und ohne supabase-js-Import, damit die Fehlerbehandlung ohne Datenbank testbar ist.
import type { Abhaengigkeiten } from './lauf.ts';
import type { Buendel, Erinnerungen } from './typen.ts';

/** Der Teil der supabase-js-Antwort, den wir brauchen. */
export interface RpcAntwort {
	data: unknown;
	error: { code?: string | null; message?: string } | null; // `message` wird bewusst nie ausgewertet
	status: number;
}

/** Der Teil des supabase-js-Clients, den wir brauchen. */
export interface RpcClient {
	rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcAntwort>;
}

/**
 * Neutrale Kennung eines Datenbankfehlers fürs Log. Nie `error.message`: die kann URLs oder Hosts enthalten.
 * Bei Netzfehlern ist `code` ein leerer String (Status 0), bei Gateway-Fehlern fehlt er.
 */
function kennung(error: NonNullable<RpcAntwort['error']>, status: number): string {
	if (error.code) return error.code;
	return status > 0 ? `HTTP ${status}` : 'Netzfehler';
}

export function rpcAbhaengigkeiten(
	client: RpcClient,
): Pick<Abhaengigkeiten, 'abholen' | 'ergebnis'> & Required<Pick<Abhaengigkeiten, 'fristenAbholen'>> {
	return {
		async abholen() {
			const { data, error, status } = await client.rpc('push_buendel_abholen');
			if (error) throw new Error(`abholen: ${kennung(error, status)}`);
			return (data ?? []) as Buendel[];
		},
		async fristenAbholen() {
			const { data, error, status } = await client.rpc('push_fristen_abholen');
			if (error) throw new Error(`fristen: ${kennung(error, status)}`);
			const d = (data ?? {}) as Partial<Erinnerungen>;
			return { tage: Array.isArray(d.tage) ? d.tage : [], termine: Array.isArray(d.termine) ? d.termine : [] };
		},
		async ergebnis(ok, weg) {
			const { error, status } = await client.rpc('push_abo_ergebnis', { p_ok: ok, p_weg: weg });
			if (error) throw new Error(`ergebnis: ${kennung(error, status)}`);
		},
	};
}
