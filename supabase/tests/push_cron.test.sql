-- pgTAP: Cron-Job push-versand (Migration 027b)
-- Spec: docs/superpowers/specs/2026-10-06-push-benachrichtigungen-design.md
-- Ausfuehren: supabase test db
--
-- Voraussetzung: 027b ist angewendet. Die Supabase-CLI ueberspringt Dateien mit
-- Buchstabensuffix im Namen (wie 022b, 026b) -- lokal also nach "supabase db reset"
-- von Hand einspielen. 027b bricht ab, wenn die Vault-Secrets push_versand_url und
-- push_cron_secret fehlen; lokal also vorher (Platzhalter genuegen) anlegen und danach
-- wieder entfernen. Ablauf siehe docs/superpowers/plans/2026-10-06-push-benachrichtigungen.md,
-- Task 12, Schritt 0.
--
-- Alles Fiktive; der Test laeuft in einer Transaktion und wird zurueckgerollt.
-- Es wird nichts versendet: die HTTP-Anfrage von pg_net landet nur in der
-- (zurueckgerollten) Warteschlange.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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
select is((select command like '%timeout_milliseconds := 70000%' from cron.job where jobname = 'push-versand'), true,
  'Timeout 70 s (Function-Gesamtbudget 60 s + Puffer)');
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

-- Vault-Secrets (fiktiv) anlegen -- ohne sie liefe die URL ins Leere. Der Name ist eindeutig:
-- vorhandene Secrets (lokal z. B. fuer einen Ende-zu-Ende-Lauf angelegt) werden zuerst entfernt.
-- Wegen des Rollbacks am Ende bleibt der lokale Stand unberuehrt.
delete from vault.secrets where name in ('push_versand_url', 'push_cron_secret');
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
select is((select timeout_milliseconds from net.http_request_queue), 70000, 'Timeout 70000 ms');

-- ---------------------------------------------------------------------------
-- Aufraeum-Jobs: laufen unabhaengig vom Versandlauf (Function nicht erreichbar, Secret falsch)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname = 'push-aufraeumen'), 1, 'genau ein Job push-aufraeumen');
select is((select schedule from cron.job where jobname = 'push-aufraeumen'), '7 * * * *', 'push-aufraeumen: stuendlich');
select is((select active from cron.job where jobname = 'push-aufraeumen'), true, 'push-aufraeumen ist aktiv');
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
   '30000000-0000-0000-0000-000000000002', 'Alt vor 2 Tagen', now() - interval '2 days'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
   '30000000-0000-0000-0000-000000000003', 'Alt vor 25 Stunden', now() - interval '25 hours'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
   '30000000-0000-0000-0000-000000000004', 'Alt vor 23 Stunden', now() - interval '23 hours');
do $$ begin execute (select command from cron.job where jobname = 'push-aufraeumen'); end $$;
select is((select array_agg(task_text order by task_text) from public.notification_events),
  array['Alt vor 23 Stunden', 'Milch'],
  'push-aufraeumen: Events aelter als 1 Tag sind weg, juengere bleiben');

select is((select count(*)::int from cron.job where jobname = 'push-protokoll-aufraeumen'), 1,
  'genau ein Job push-protokoll-aufraeumen');
select is((select schedule from cron.job where jobname = 'push-protokoll-aufraeumen'), '17 3 * * *',
  'push-protokoll-aufraeumen: taeglich');
select is((select active from cron.job where jobname = 'push-protokoll-aufraeumen'), true,
  'push-protokoll-aufraeumen ist aktiv');
-- cron.job_run_details wuerde sonst jede Minute eine Zeile (ca. 540 Byte) ansammeln
-- (runid explizit und negativ: die Rolle postgres darf die Sequenz cron.runid_seq nicht benutzen)
insert into cron.job_run_details (jobid, runid, database, username, command, status, return_message, start_time, end_time) values
  (0, -1, 'postgres', 'postgres', 'test-alt', 'succeeded', '0 rows', now() - interval '4 days', now() - interval '4 days'),
  (0, -2, 'postgres', 'postgres', 'test-neu', 'succeeded', '0 rows', now() - interval '2 days', now() - interval '2 days');
do $$ begin execute (select command from cron.job where jobname = 'push-protokoll-aufraeumen'); end $$;
select is((select count(*)::int from cron.job_run_details where command = 'test-alt'), 0,
  'push-protokoll-aufraeumen: Laufprotokoll aelter als 3 Tage ist weg');
select is((select count(*)::int from cron.job_run_details where command = 'test-neu'), 1,
  'push-protokoll-aufraeumen: juengeres Laufprotokoll bleibt');

select * from finish();
rollback;
