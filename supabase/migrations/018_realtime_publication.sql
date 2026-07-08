-- Migration 018: Supabase Realtime aktivieren
--
-- Root Cause (verifiziert 2026-06-21 gegen Prod): Die Publication `supabase_realtime`
-- enthielt KEINE App-Tabellen. Die Client-Subscriptions (v2-tasks-realtime,
-- v2-lists-realtime in src/routes/app/+page.svelte) abonnierten postgres_changes,
-- aber serverseitig wurde nichts publiziert -> es kam NIE ein Live-Event an.
-- Konsequenz: keine Sync von Pins/Tasks/Listen zwischen Geraeten und geteilten Usern.
--
-- Fix: tasks + lists zur Publication hinzufuegen und REPLICA IDENTITY FULL setzen,
-- damit Realtime UPDATE/DELETE-Events auch fuer geteilte Listen korrekt gegen RLS
-- (has_list_share(list_id)) filtern kann -- dafuer muss list_id im Replikations-Record
-- enthalten sein. Beides ist nicht-destruktiv und reversibel.

-- Idempotent: nur hinzufuegen, falls noch nicht in der Publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'lists'
  ) then
    alter publication supabase_realtime add table public.lists;
  end if;
end $$;

alter table public.tasks replica identity full;
alter table public.lists replica identity full;
