-- 027_push_benachrichtigungen.sql
-- Push-Benachrichtigungen für geteilte Listen.
-- Spec: docs/superpowers/specs/2026-10-06-push-benachrichtigungen-design.md
-- Rein additiv. Keine Extensions, kein Cron, keine Secrets, keine User-IDs (öffentliches Repo).

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique
    constraint push_subscriptions_endpoint_check
    check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null
    constraint push_subscriptions_p256dh_check check (length(p256dh) between 1 and 200),
  auth text not null
    constraint push_subscriptions_auth_check check (length(auth) between 1 and 100),
  geraet text
    constraint push_subscriptions_geraet_check check (geraet is null or length(geraet) <= 100),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.list_notification_mutes (
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, list_id)
);

create table public.notification_events (
  id bigint generated always as identity primary key,
  list_id uuid not null references public.lists(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  via_agent boolean not null default false,
  art text not null
    constraint notification_events_art_check
    check (art in ('neu', 'erledigt', 'wieder_offen', 'geaendert', 'geloescht')),
  task_id uuid not null,
  task_text text not null default '',
  created_at timestamptz not null default now()
);
create index notification_events_gruppe_idx
  on public.notification_events (list_id, actor_id, created_at);

create table public.push_config (
  key text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- RLS und Rechte
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;
alter table public.list_notification_mutes enable row level security;
alter table public.notification_events enable row level security;
alter table public.push_config enable row level security;

create policy "push_subscriptions: eigene lesen" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_subscriptions: eigene loeschen" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "list_notification_mutes: eigene lesen" on public.list_notification_mutes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "list_notification_mutes: eigene loeschen" on public.list_notification_mutes
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "list_notification_mutes: sichtbare Liste stummschalten" on public.list_notification_mutes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (public.is_list_owner(list_id) or public.has_list_share(list_id))
  );

revoke all on public.push_subscriptions from anon;
revoke insert, update, truncate, references, trigger on public.push_subscriptions from authenticated;
revoke all on public.list_notification_mutes from anon;
revoke update, truncate, references, trigger on public.list_notification_mutes from authenticated;
revoke all on public.notification_events from anon, authenticated;
revoke all on public.push_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Erfassung
-- ---------------------------------------------------------------------------
create or replace function public.push_event_eintragen(
  p_list uuid, p_actor uuid, p_agent boolean, p_art text, p_task uuid, p_text text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Nur geteilte Listen; existiert die Liste nicht mehr (Kaskade), greift der Join nicht.
  if not exists (
    select 1
    from public.list_shares s
    join public.lists l on l.id = s.list_id
    where s.list_id = p_list and s.user_id <> l.user_id
  ) then
    return;
  end if;

  insert into public.notification_events (list_id, actor_id, via_agent, art, task_id, task_text)
  values (p_list, p_actor, p_agent, p_art, p_task, left(coalesce(p_text, ''), 120));
end;
$$;

create or replace function public.push_event_erfassen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_agent boolean := false;
begin
  -- Billige Vorprüfungen ausserhalb des Ausnahmeblocks (kein Subtransaktions-Overhead
  -- bei Massen-Updates wie Reorder oder "Einkauf fertig").
  if tg_op = 'DELETE' then
    if old.type = 'divider' then return null; end if;
  else
    if new.type = 'divider' then return null; end if;
  end if;

  if tg_op = 'UPDATE'
     and new.done is not distinct from old.done
     and new.text is not distinct from old.text
     and new.note is not distinct from old.note
     and new.due_date is not distinct from old.due_date
     and new.assigned_to is not distinct from old.assigned_to
     and new.priority is not distinct from old.priority
     and new.timeframe is not distinct from old.timeframe
     and new.list_id is not distinct from old.list_id then
    return null;
  end if;

  begin
    v_actor := auth.uid();
    if v_actor is null then
      select value::uuid into v_actor from public.push_config where key = 'agent_actor';
      if v_actor is null then
        return null;
      end if;
      v_agent := true;
    end if;

    if tg_op = 'INSERT' then
      perform public.push_event_eintragen(new.list_id, v_actor, v_agent, 'neu', new.id, new.text);
    elsif tg_op = 'DELETE' then
      perform public.push_event_eintragen(old.list_id, v_actor, v_agent, 'geloescht', old.id, old.text);
    elsif new.list_id is distinct from old.list_id then
      perform public.push_event_eintragen(old.list_id, v_actor, v_agent, 'geloescht', old.id, old.text);
      perform public.push_event_eintragen(new.list_id, v_actor, v_agent, 'neu', new.id, new.text);
    elsif new.done is distinct from old.done then
      perform public.push_event_eintragen(
        new.list_id, v_actor, v_agent,
        case when new.done then 'erledigt' else 'wieder_offen' end,
        new.id, new.text);
    else
      perform public.push_event_eintragen(new.list_id, v_actor, v_agent, 'geaendert', new.id, new.text);
    end if;
  exception when others then
    raise warning 'push_event_erfassen: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

create trigger tasks_push_event
  after insert or update or delete on public.tasks
  for each row execute function public.push_event_erfassen();

-- ---------------------------------------------------------------------------
-- RPCs für die App
-- ---------------------------------------------------------------------------
create or replace function public.push_abo_speichern(
  p_endpoint text, p_p256dh text, p_auth text, p_geraet text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'nicht angemeldet' using errcode = '42501';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, geraet)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_geraet, 100))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        geraet = excluded.geraet,
        last_seen_at = now();

  -- Höchstens 10 Geräte je Person; die am längsten nicht gesehenen fallen weg.
  delete from public.push_subscriptions
  where user_id = v_uid
    and id not in (
      select id from public.push_subscriptions
      where user_id = v_uid
      order by last_seen_at desc, created_at desc
      limit 10
    );
end;
$$;

create or replace function public.push_abo_loeschen(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'nicht angemeldet' using errcode = '42501';
  end if;
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs für die Edge Function (nur service_role)
-- ---------------------------------------------------------------------------
create or replace function public.push_buendel_abholen(
  p_ruhe interval default interval '2 minutes',
  p_max interval default interval '10 minutes'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ergebnis jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('push_buendel_abholen')) then
    return '[]'::jsonb;
  end if;

  -- Veraltete Gruppen (jüngstes Event älter als 1 Tag) verwerfen, nicht senden.
  delete from public.notification_events e
  using (
    select list_id, actor_id
    from public.notification_events
    group by list_id, actor_id
    having max(created_at) < now() - interval '1 day'
  ) v
  where e.list_id = v.list_id and e.actor_id = v.actor_id;

  with faellig as (
    select list_id, actor_id
    from public.notification_events
    group by list_id, actor_id
    having max(created_at) <= now() - p_ruhe
        or min(created_at) <= now() - p_max
  ),
  abgeholt as (
    delete from public.notification_events e
    using faellig f
    where e.list_id = f.list_id and e.actor_id = f.actor_id
    returning e.id, e.list_id, e.actor_id, e.via_agent, e.art, e.task_id, e.task_text, e.created_at
  ),
  gruppen as (
    select a.list_id, a.actor_id, bool_or(a.via_agent) as via_agent
    from abgeholt a
    group by a.list_id, a.actor_id
  ),
  gruppen_events as (
    select g.list_id, g.actor_id,
      (
        select jsonb_agg(
                 jsonb_build_object('task_id', x.task_id, 'art', x.art, 'text', x.task_text, 'at', x.created_at)
                 order by x.created_at, x.id)
        from (
          select b.* from abgeholt b
          where b.list_id = g.list_id and b.actor_id = g.actor_id
          order by b.created_at desc, b.id desc
          limit 200
        ) x
      ) as events
    from gruppen g
  ),
  mitglieder as (
    select g.list_id, g.actor_id, m.user_id
    from gruppen g
    cross join lateral (
      select l.user_id from public.lists l where l.id = g.list_id
      union
      select s.user_id from public.list_shares s where s.list_id = g.list_id
    ) m
    where m.user_id <> g.actor_id
      and not exists (
        select 1 from public.list_notification_mutes mu
        where mu.user_id = m.user_id and mu.list_id = g.list_id
      )
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = m.user_id)
  ),
  empfaenger as (
    select mg.list_id, mg.actor_id,
      jsonb_agg(jsonb_build_object(
        'user_id', mg.user_id,
        'abos', (
          select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
          from public.push_subscriptions ps where ps.user_id = mg.user_id)
      )) as liste
    from mitglieder mg
    group by mg.list_id, mg.actor_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'list_id', g.list_id,
           'list_title', l.title,
           'list_kind', l.kind,
           'actor_id', g.actor_id,
           'actor_name', coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Jemand'),
           'via_agent', g.via_agent,
           'events', ge.events,
           'empfaenger', em.liste)), '[]'::jsonb)
  into v_ergebnis
  from gruppen g
  join gruppen_events ge on ge.list_id = g.list_id and ge.actor_id = g.actor_id
  join empfaenger em on em.list_id = g.list_id and em.actor_id = g.actor_id
  join public.lists l on l.id = g.list_id
  left join public.profiles p on p.id = g.actor_id;

  return v_ergebnis;
end;
$$;

create or replace function public.push_abo_ergebnis(p_ok text[], p_weg text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.push_subscriptions set last_ok_at = now()
  where endpoint = any (coalesce(p_ok, '{}'::text[]));
  delete from public.push_subscriptions
  where endpoint = any (coalesce(p_weg, '{}'::text[]));
end;
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte (Supabase vergibt Default-Grants an anon/authenticated)
-- ---------------------------------------------------------------------------
revoke all on function public.push_event_eintragen(uuid, uuid, boolean, text, uuid, text) from public, anon, authenticated;
revoke all on function public.push_event_erfassen() from public, anon, authenticated;
revoke all on function public.push_abo_speichern(text, text, text, text) from public, anon;
revoke all on function public.push_abo_loeschen(text) from public, anon;
revoke all on function public.push_buendel_abholen(interval, interval) from public, anon, authenticated;
revoke all on function public.push_abo_ergebnis(text[], text[]) from public, anon, authenticated;
grant execute on function public.push_abo_speichern(text, text, text, text) to authenticated;
grant execute on function public.push_abo_loeschen(text) to authenticated;
grant execute on function public.push_buendel_abholen(interval, interval) to service_role;
grant execute on function public.push_abo_ergebnis(text[], text[]) to service_role;
