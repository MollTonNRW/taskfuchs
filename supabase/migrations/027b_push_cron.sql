-- 027b_push_cron.sql
-- Erst NACH Deploy der Edge Function und nach Anlegen der Vault-Secrets
-- push_versand_url und push_cron_secret anwenden (vault.create_secret, nicht in der Migration).
-- Wiederholbar: ein vorhandener Job push-versand wird zuerst entfernt.
-- Hinweis: Die Supabase-CLI überspringt Dateien mit Buchstabensuffix (wie 022b, 026b);
-- lokal nach "supabase db reset" von Hand einspielen, in Produktion im SQL-Editor ausführen.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'push-versand';

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
