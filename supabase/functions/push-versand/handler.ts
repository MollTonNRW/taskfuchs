// handler.ts — HTTP-Schicht der Edge Function: Methode, Secret-Header, Fehlerbehandlung.
// Dünn und ohne Supabase-/Netz-Abhängigkeit, damit die Zugangsprüfung testbar bleibt.
import { type Abhaengigkeiten, lauf } from './lauf.ts';
import { secretGleich } from './secret.ts';

export interface HandlerConfig {
	/** Erwartetes Cron-Secret (Function-Secret PUSH_CRON_SECRET). */
	cronSecret(): string | undefined;
	/** Baut Datenbank-Client und Sender — wird erst nach bestandener Secret-Prüfung aufgerufen. */
	abhaengigkeiten(): Promise<Abhaengigkeiten>;
	logFehler(msg: string): void;
}

export function erstelleHandler(cfg: HandlerConfig): (req: Request) => Promise<Response> {
	return async (req) => {
		if (req.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
		}
		if (!secretGleich(req.headers.get('x-push-secret'), cfg.cronSecret())) {
			return new Response('Unauthorized', { status: 401 });
		}
		try {
			const bericht = await lauf(await cfg.abhaengigkeiten());
			return Response.json(bericht);
		} catch (e) {
			// Alle Fehlermeldungen dieser Function sind neutral formuliert (keine Texte, Endpoints, Schlüssel).
			cfg.logFehler(`push-versand: ${e instanceof Error ? e.message : 'unbekannter Fehler'}`);
			return new Response('Fehler', { status: 500 });
		}
	};
}
