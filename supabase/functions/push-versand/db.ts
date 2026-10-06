// db.ts — die beiden RPC-Aufrufe der Function (Abholen, Ergebnis melden) mit neutralen Fehlermeldungen.
// Dünn und ohne supabase-js-Import, damit die Fehlerbehandlung ohne Datenbank testbar ist.
import type { Abhaengigkeiten } from './lauf.ts';
import type { Buendel } from './typen.ts';

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

export function rpcAbhaengigkeiten(client: RpcClient): Pick<Abhaengigkeiten, 'abholen' | 'ergebnis'> {
	return {
		async abholen() {
			const { data, error, status } = await client.rpc('push_buendel_abholen');
			if (error) throw new Error(`abholen: ${kennung(error, status)}`);
			return (data ?? []) as Buendel[];
		},
		async ergebnis(ok, weg) {
			const { error, status } = await client.rpc('push_abo_ergebnis', { p_ok: ok, p_weg: weg });
			if (error) throw new Error(`ergebnis: ${kennung(error, status)}`);
		},
	};
}
