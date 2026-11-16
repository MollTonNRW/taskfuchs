-- 028b_push_fristen_cron.sql — Versandlauf feuert auch fuer Erinnerungen an Fristen
-- Spec: docs/superpowers/specs/2026-11-16-erinnerungen-fristen-design.md
--
-- Erst NACH 028 und NACH dem Deploy der Function push-versand mit Fristen-Unterstuetzung
-- anwenden (sonst ruft der Cron eine alte Function, die nur Buendel kennt; die Erinnerungen
-- waeren dann trotzdem nicht verloren, weil erst die neue Function sie abholt).
--
-- Wie 027b wird diese Datei von der Supabase-CLI uebersprungen (Buchstabensuffix) und von
-- Hand eingespielt: lokal per psql, in Produktion per apply_migration/SQL-Editor.
-- Aendert nur die Bedingung des Jobs push-versand; Zeitplan, Secrets und die beiden
-- Aufraeum-Jobs aus 027b bleiben, wie sie sind.

do $$
begin
  if (select count(*) from vault.decrypted_secrets
      where name in ('push_versand_url', 'push_cron_secret')
        and coalesce(decrypted_secret, '') <> '') < 2 then
    raise exception '028b: Vault-Secrets push_versand_url und push_cron_secret fehlen (siehe 027b)';
  end if;
  if to_regprocedure('public.push_fristen_faellig(timestamptz)') is null then
    raise exception '028b: zuerst Migration 028 anwenden';
  end if;
end $$;

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
    timeout_milliseconds := 70000)
  where exists (select 1 from public.notification_events)
     or public.push_fristen_faellig();
  $cron$
);
