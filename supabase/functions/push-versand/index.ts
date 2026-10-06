// push-versand — Edge Function: holt fällige Bündel aus der Warteschlange und sendet Web-Push-Meldungen.
// Aufruf: pg_cron → pg_net (POST, Header x-push-secret). verify_jwt = false (supabase/config.toml);
// Schutz über das Secret. Function-Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_CRON_SECRET;
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase bereit.
import { createClient } from '@supabase/supabase-js';
import type { Buendel } from './typen.ts';
import { erstelleHandler } from './handler.ts';
import { senderErstellen } from './webpush.ts';

function umgebung(name: string): string {
	const wert = Deno.env.get(name);
	if (!wert) throw new Error(`Konfiguration unvollständig: ${name}`);
	return wert;
}

Deno.serve(erstelleHandler({
	cronSecret: () => Deno.env.get('PUSH_CRON_SECRET'),
	logFehler: (msg) => console.error(msg),
	async abhaengigkeiten() {
		const sb = createClient(umgebung('SUPABASE_URL'), umgebung('SUPABASE_SERVICE_ROLE_KEY'), {
			auth: { persistSession: false, autoRefreshToken: false },
		});
		const sender = await senderErstellen({
			publicKey: umgebung('VAPID_PUBLIC_KEY'),
			privateKey: umgebung('VAPID_PRIVATE_KEY'),
			subject: Deno.env.get('VAPID_SUBJECT') || 'https://taskfuchs.molltoncreative.de',
		});
		return {
			abholen: async () => {
				const { data, error } = await sb.rpc('push_buendel_abholen');
				if (error) throw new Error(`abholen: ${error.code ?? 'fehlgeschlagen'}`);
				return (data ?? []) as Buendel[];
			},
			ergebnis: async (ok, weg) => {
				const { error } = await sb.rpc('push_abo_ergebnis', { p_ok: ok, p_weg: weg });
				if (error) throw new Error(`ergebnis: ${error.code ?? 'fehlgeschlagen'}`);
			},
			sender,
			log: (msg) => console.log(msg),
		};
	},
}));
