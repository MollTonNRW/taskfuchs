-- pgTAP: Cron-Job push-versand (Migration 027b)
-- Spec: docs/superpowers/specs/2026-10-06-push-benachrichtigungen-design.md
-- Ausfuehren: supabase test db
--
-- Voraussetzung: 027b ist angewendet. Die Supabase-CLI ueberspringt Dateien mit
-- Buchstabensuffix im Namen (wie 022b, 026b) -- lokal also nach "supabase db reset"
-- von Hand einspielen (psql -f supabase/migrations/027b_push_cron.sql).
--
-- Alles Fiktive; der Test laeuft in einer Transaktion und wird zurueckgerollt.
-- Es wird nichts versendet: die HTTP-Anfrage von pg_net landet nur in der
-- (zurueckgerollten) Warteschlange.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------------------------------------------------------------------------
-- Erweiterungen und Job
-- ---------------------------------------------------------------------------
select has_extension('pg_net', 'pg_net ist installiert');
select has_extension('pg_cron', 'pg_cron ist installiert');

select is((select count(*)::int from cron.job where jobname = 'push-versand'), 1,
  'genau ein Job push-versand');
select is((select schedule from cron.job where jobname = 'push-versand'), '* * * * *',
  'Zeitplan jede Minute');
select is((select active from cron.job where jobname = 'push-versand'), true, 'Job ist aktiv');
select is((select command like '%net.http_post(%' from cron.job where jobname = 'push-versand'), true,
  'Kommando ruft net.http_post');
select is((select command like '%x-push-secret%' from cron.job where jobname = 'push-versand'), true,
  'Kommando sendet den Header x-push-secret');
select is((select command like '%where exists (select 1 from public.notification_events)%' from cron.job where jobname = 'push-versand'), true,
  'Kommando ruft nur auf, wenn Events in der Warteschlange liegen');
select is((select command like '%vault.decrypted_secrets%push_versand_url%' from cron.job where jobname = 'push-versand'), true,
  'URL kommt aus dem Vault (push_versand_url)');
select is((select command like '%vault.decrypted_secrets%push_cron_secret%' from cron.job where jobname = 'push-versand'), true,
  'Secret kommt aus dem Vault (push_cron_secret)');
select is((select command like '%timeout_milliseconds := 10000%' from cron.job where jobname = 'push-versand'), true,
  'Timeout 10 s');
select is((select command !~* 'https?://' from cron.job where jobname = 'push-versand'), true,
  'im Kommando steht keine feste URL (nur Vault)');

-- ---------------------------------------------------------------------------
-- Idempotenz: der Rumpf der Migration, zweimal angewendet, ergibt einen Job
-- (Kopie des unschedule/schedule-Teils aus 027b; Gegenprobe an der Datei selbst
-- beim lokalen Einspielen)
-- ---------------------------------------------------------------------------
create temp table cron_kommando as select command from cron.job where jobname = 'push-versand';
select cron.unschedule(jobid) from cron.job where jobname = 'push-versand';
select is((select count(*)::int from cron.job where jobname = 'push-versand'), 0, 'nach unschedule kein Job mehr');
select cron.schedule('push-versand', '* * * * *', (select command from cron_kommando));
select cron.unschedule(jobid) from cron.job where jobname = 'push-versand';
select cron.schedule('push-versand', '* * * * *', (select command from cron_kommando));
select is((select count(*)::int from cron.job where jobname = 'push-versand'), 1,
  'zweimal angewendet: genau ein Job');

-- ---------------------------------------------------------------------------
-- Verhalten des Kommandos (ohne Versand)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from net.http_request_queue), 0, 'Ausgangslage: keine HTTP-Anfrage in der Warteschlange');

-- Vault-Secrets (fiktiv) anlegen -- ohne sie liefe die URL ins Leere
select vault.create_secret('https://example.invalid/functions/v1/push-versand', 'push_versand_url');
select vault.create_secret('test-secret-fiktiv', 'push_cron_secret');

-- Leere Warteschlange: keine Anfrage, obwohl alles zum Versand bereit waere
delete from public.notification_events;
do $$ begin execute (select command from cron.job where jobname = 'push-versand'); end $$;
select is((select count(*)::int from net.http_request_queue), 0,
  'leere Warteschlange: der Job stellt keine Anfrage');

-- Mit Event: genau eine Anfrage an die Vault-URL mit Secret-Header
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'besitzer@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'mitglied@test.local');
insert into public.lists (id, user_id, title) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Einkaufen');
insert into public.notification_events (list_id, actor_id, art, task_id, task_text) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
   '30000000-0000-0000-0000-000000000001', 'Milch');
do $$ begin execute (select command from cron.job where jobname = 'push-versand'); end $$;
select is((select count(*)::int from net.http_request_queue), 1, 'mit Event: genau eine Anfrage in der Warteschlange');
select is((select url from net.http_request_queue), 'https://example.invalid/functions/v1/push-versand',
  'Anfrage geht an die URL aus dem Vault');
select is((select method::text from net.http_request_queue), 'POST', 'Methode POST');
select is((select headers ->> 'x-push-secret' from net.http_request_queue), 'test-secret-fiktiv',
  'Header x-push-secret traegt das Secret aus dem Vault');
select is((select headers ->> 'content-type' from net.http_request_queue), 'application/json', 'Header content-type');
select is((select timeout_milliseconds from net.http_request_queue), 10000, 'Timeout 10000 ms');

select * from finish();
rollback;
