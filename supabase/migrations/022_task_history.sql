-- ==========================================
-- 022: Aufgabenhistorie (task_history)
--
-- Mitglieder einer Liste hinterlassen an einer Aufgabe kurze Eintraege:
-- was schon passiert ist („Stand") oder worauf gerade gewartet wird
-- („Wartet auf"). Die Historie ist optional — eine Aufgabe ohne Eintraege
-- ist der Normalfall. Sie ersetzt die Spalte tasks.progress; deren Werte
-- uebernimmt 023 und entfernt die Spalte danach.
--
-- Spezifikation: docs/superpowers/specs/2026-09-24-aufgabenhistorie-design.md
--
-- Rechte „Alle alles": wer die Aufgabe bearbeiten darf (Ersteller,
-- Listenbesitzer, Share-Rolle owner/editor), darf JEDEN Eintrag schreiben,
-- aendern, loeschen und „Ist da" setzen oder zuruecknehmen. Die Share-Rolle
-- viewer liest nur. Wer die Aufgabe sieht, sieht ihre Historie.
--
-- Rein additiv: keine bestehende Tabelle, Policy oder Funktion wird
-- veraendert. Wiederholbar (if not exists / create or replace / drop if
-- exists), damit ein abgebrochener Lauf einfach erneut angewendet werden kann.
--
-- Deploy-Reihenfolge: 022 -> Code nach main -> 023.
-- ==========================================

-- ------------------------------------------
-- 1) Tabelle
-- ------------------------------------------
create table if not exists public.task_history (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  kind        text not null check (kind in ('stand', 'wartet')),
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  -- Autor. Faellt das Konto weg, bleibt der Eintrag ohne Namen stehen.
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Zuletzt bearbeitet (nur der Text).
  edited_at   timestamptz,
  edited_by   uuid references auth.users(id) on delete set null,
  -- Nur kind = 'wartet': „Ist da".
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint task_history_nur_wartet_eingeloest
    check (kind = 'wartet' or (resolved_at is null and resolved_by is null))
);

comment on table public.task_history is
  'Aufgabenhistorie: Stand- und Warte-Eintraege je Aufgabe (ersetzt tasks.progress).';

-- Verlauf einer Aufgabe, neueste zuerst.
create index if not exists task_history_task_created_idx
  on public.task_history (task_id, created_at desc);

-- Offene Warte-Eintraege — die EINE Abfrage beim App-Start (Sanduhr in der Zeile).
create index if not exists task_history_offen_wartet_idx
  on public.task_history (task_id)
  where kind = 'wartet' and resolved_at is null;

-- ------------------------------------------
-- 2) Helfer fuer RLS
--
-- Spiegeln exakt die bestehenden tasks-Policies (Migration 003):
--   sehen      = Ersteller oder Listenbesitzer oder irgendein Share
--   bearbeiten = Ersteller oder Listenbesitzer oder Share owner/editor
-- SECURITY DEFINER, damit der Blick in tasks nicht selbst durch RLS laeuft;
-- is_list_owner / has_list_share sind ebenfalls security definer (003).
-- ------------------------------------------
create or replace function public.can_view_task(p_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        t.user_id = auth.uid()
        or public.is_list_owner(t.list_id)
        or public.has_list_share(t.list_id)
      )
  );
$$;

create or replace function public.can_edit_task(p_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        t.user_id = auth.uid()
        or public.is_list_owner(t.list_id)
        or public.has_list_share(t.list_id, array['owner', 'editor'])
      )
  );
$$;

-- Nur angemeldete Nutzer (und der Dienst) duerfen die Helfer aufrufen.
revoke execute on function public.can_view_task(uuid) from public, anon;
revoke execute on function public.can_edit_task(uuid) from public, anon;
grant execute on function public.can_view_task(uuid) to authenticated, service_role;
grant execute on function public.can_edit_task(uuid) to authenticated, service_role;

-- ------------------------------------------
-- 3) Row Level Security
-- ------------------------------------------
alter table public.task_history enable row level security;

drop policy if exists "Users can view history of visible tasks" on public.task_history;
create policy "Users can view history of visible tasks"
  on public.task_history for select
  using (public.can_view_task(task_id));

drop policy if exists "Users can add history to editable tasks" on public.task_history;
create policy "Users can add history to editable tasks"
  on public.task_history for insert
  with check (public.can_edit_task(task_id));

drop policy if exists "Users can update history of editable tasks" on public.task_history;
create policy "Users can update history of editable tasks"
  on public.task_history for update
  using (public.can_edit_task(task_id))
  with check (public.can_edit_task(task_id));

drop policy if exists "Users can delete history of editable tasks" on public.task_history;
create policy "Users can delete history of editable tasks"
  on public.task_history for delete
  using (public.can_edit_task(task_id));

-- anon bekommt keine Rechte.
revoke all on table public.task_history from anon;

-- ------------------------------------------
-- 4) Trigger: Autor, Zeiten und „Ist da" stempelt der Server
--
-- Mit angemeldetem Nutzer (auth.uid() gesetzt):
--   INSERT: created_by = auth.uid(), created_at = now(), edited_* und
--           resolved_* leer — niemand legt Eintraege fuer andere an und
--           niemand legt einen bereits eingeloesten Warte-Eintrag an.
--   UPDATE: task_id, kind, created_by, created_at bleiben unveraenderlich.
--           Geaenderter Text -> edited_at = now(), edited_by = auth.uid().
--           resolved_at null -> gesetzt: resolved_at = now(),
--           resolved_by = auth.uid(); zurueck auf null: beide null.
--           Alles andere an edited_* / resolved_* bleibt, wie es war.
-- Ohne auth.uid() (Migration, Dienst) bleiben die Werte unangetastet —
-- so uebernimmt 023 Autor und Zeitpunkt der alten Fortschrittswerte.
--
-- SECURITY INVOKER: der Trigger braucht keine Rechte ueber die des
-- Aufrufers hinaus.
-- ------------------------------------------
create or replace function public.task_history_stempeln()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ich uuid := auth.uid();
begin
  if v_ich is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by  := v_ich;
    new.created_at  := now();
    new.edited_at   := null;
    new.edited_by   := null;
    new.resolved_at := null;
    new.resolved_by := null;
    return new;
  end if;

  -- UPDATE
  new.task_id    := old.task_id;
  new.kind       := old.kind;
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if new.body is distinct from old.body then
    new.edited_at := now();
    new.edited_by := v_ich;
  else
    new.edited_at := old.edited_at;
    new.edited_by := old.edited_by;
  end if;

  if new.resolved_at is null then
    new.resolved_by := null;
  elsif old.resolved_at is null then
    new.resolved_at := now();
    new.resolved_by := v_ich;
  else
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
  end if;

  return new;
end;
$$;

drop trigger if exists task_history_stempeln on public.task_history;
create trigger task_history_stempeln
  before insert or update on public.task_history
  for each row execute function public.task_history_stempeln();

-- ------------------------------------------
-- 5) Realtime
--
-- Der Client abonniert INSERT/UPDATE/DELETE. Bei aktivem RLS traegt ein
-- DELETE-Ereignis nur den Primaerschluessel — der Client entfernt per id.
-- ------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'task_history'
  ) then
    alter publication supabase_realtime add table public.task_history;
  end if;
end $$;
