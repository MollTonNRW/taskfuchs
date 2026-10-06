// push-versand — Edge Function: holt fällige Bündel aus der Warteschlange und sendet Web-Push-Meldungen.
// Aufruf: pg_cron → pg_net (POST, Header x-push-secret). verify_jwt = false (supabase/config.toml);
// Schutz über das Secret. Function-Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_CRON_SECRET;
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase bereit.
// Tests: `deno task test` im Function-Ordner (der Mock-Push-Dienst braucht Net-/Env-Rechte; reines `deno test` fragt danach).
// Vom Repo-Root: `deno test --config supabase/functions/push-versand/deno.json --allow-net=127.0.0.1 --allow-env=ECE_KEYLOG
// supabase/functions/push-versand/` (ohne --config findet Deno dort die package.json statt der deno.json).
// Bekannte Einschränkung: deno.json setzt `lock: false`. Die direkten Importe sind gepinnt, transitive npm-Pakete
// (supabase-js-Abhängigkeiten) werden bei jedem Deploy neu aufgelöst. Ein deno.lock ist bewusst nicht eingecheckt,
// solange nicht belegt ist, dass der Supabase-Bundler dessen Format liest.
import { createClient } from '@supabase/supabase-js';
import { rpcAbhaengigkeiten } from './db.ts';
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
			...rpcAbhaengigkeiten(sb),
			sender,
			log: (msg) => console.log(msg),
		};
	},
}));
