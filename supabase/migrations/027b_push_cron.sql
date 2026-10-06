-- 027b_push_cron.sql
-- Erst NACH Deploy der Edge Function und nach Anlegen der Vault-Secrets
-- push_versand_url und push_cron_secret anwenden (vault.create_secret, nicht in der Migration).
-- Fehlen die Secrets, bricht die Migration mit einer klaren Meldung ab (sonst liefe der Job
-- jede Minute ins Leere: url = NULL bzw. Header x-push-secret = NULL, die Events blieben liegen).
-- Wiederholbar: vorhandene Jobs werden zuerst entfernt.
-- Hinweis: Die Supabase-CLI überspringt Dateien mit Buchstabensuffix (wie 022b, 026b);
-- lokal nach "supabase db reset" von Hand einspielen, in Produktion im SQL-Editor ausführen.
--
-- Drei Jobs:
--   push-versand               jede Minute: ruft die Edge Function, wenn Events in der Warteschlange liegen
--   push-aufraeumen            stündlich: verwirft Events älter als 1 Tag, unabhängig vom Versandlauf
--                              (Function nicht erreichbar, Secret falsch: Aufgabentexte bleiben nicht liegen)
--   push-protokoll-aufraeumen  täglich: kürzt cron.job_run_details (sonst eine Zeile je Minute, ca. 300 MB/Jahr)
--
-- Betrieb: cron.job_run_details zeigt "succeeded", sobald pg_net die Anfrage eingestellt hat;
-- den HTTP-Status der Function zeigt: select status_code, count(*) from net._http_response group by 1;
do $$
begin
  if (select count(*) from vault.decrypted_secrets
      where name in ('push_versand_url', 'push_cron_secret')
        and coalesce(decrypted_secret, '') <> '') < 2 then
    raise exception '027b: Vault-Secrets push_versand_url und push_cron_secret fehlen (vault.create_secret, siehe Kopf der Datei)';
  end if;
end $$;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job
where jobname in ('push-versand', 'push-aufraeumen', 'push-protokoll-aufraeumen');

select cron.schedule(
  'push-versand',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_versand_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
  where exists (select 1 from public.notification_events);
  $cron$
);

select cron.schedule(
  'push-aufraeumen',
  '7 * * * *',
  $cron$delete from public.notification_events where created_at < now() - interval '1 day'$cron$
);

select cron.schedule(
  'push-protokoll-aufraeumen',
  '17 3 * * *',
  $cron$delete from cron.job_run_details where end_time < now() - interval '3 days'$cron$
);
