-- 028_push_fristen.sql — Erinnerungen an Fristen (Push)
-- Spec: docs/superpowers/specs/2026-11-16-erinnerungen-fristen-design.md
--
-- Zwei Arten von Erinnerungen, beide nur fuer Personen mit mindestens einem Push-Abo:
--   * Tagesmeldung: einmal am Tag zur eigenen Uhrzeit (Standard 08:00) alle offenen Aufgaben,
--     die heute faellig oder ueberfaellig sind, auf Wunsch auch die von morgen. Nachgeholt wird
--     hoechstens drei Stunden lang (Ausfall, spaet angemeldet), danach erst am naechsten Tag.
--   * Termin: Aufgaben mit Uhrzeit („2026-11-19T09:00“) melden sich zusaetzlich einzeln,
--     Standard 30 Minuten vorher.
-- Rein additiv: Einstellungen je Person, zwei Versandprotokolle, eine RPC fuer die App
-- (Einstellungen speichern) und zwei fuer den Versandlauf (faellig?, abholen). Kein Cron,
-- keine Secrets: 028b stellt den bestehenden Cron-Job push-versand um.
--
-- tasks.due_date ist Text (Migration 004): „YYYY-MM-DD“ oder „YYYY-MM-DDTHH:MM“, Ortszeit.
-- Zeiten und Kalendertage gelten in Europe/Berlin (Haushalt in Deutschland). Beide
-- Versand-RPCs nehmen den Zeitpunkt als Parameter (Standard now()) fuer die Tests.

-- ---------------------------------------------------------------------------
-- Fristen sicher lesen: kaputte Werte ergeben NULL statt eines Fehlers, der sonst den
-- ganzen Versandlauf abbraeche.
-- ---------------------------------------------------------------------------
create or replace function public.tf_frist_tag(p text)
returns date
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}' then
    return null;
  end if;
  return substr(p, 1, 10)::date;
exception when others then
  return null;
end;
$$;

create or replace function public.tf_frist_zeit(p text)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then
    return null;
  end if;
  return substr(p, 1, 16)::timestamp at time zone 'Europe/Berlin';
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Welche Aufgaben, wer wird erinnert — Grundlage beider Erinnerungsarten.
-- Offen, mit Frist, keine Trenner, keine Unteraufgaben (wie die Ansicht „Dringend“), nicht
-- abgelegt, nicht in Einkaufslisten. Erinnert wird, wem die Aufgabe zugewiesen ist, solange
-- diese Person die Liste noch sieht (Besitzer oder Freigabe); sonst der Besitzer der Liste.
-- security_invoker: wer die View liest, unterliegt der RLS der Tabellen (die Versand-RPCs
-- laufen als Besitzer); Clients haben ohnehin kein Leserecht.
-- ---------------------------------------------------------------------------
create or replace view public.push_fristen_aufgaben
with (security_invoker = true) as
select case
         when t.assigned_to is not null
          and (t.assigned_to = l.user_id
               or exists (select 1 from public.list_shares s
                          where s.list_id = l.id and s.user_id = t.assigned_to))
         then t.assigned_to
         else l.user_id
       end as user_id,
       t.id as task_id,
       t.text,
       t.due_date,
       t.list_id,
       l.title as list_title
from public.tasks t
join public.lists l on l.id = t.list_id
where t.due_date is not null
  and not t.done
  and t.type = 'task'
  and t.parent_id is null
  and not t.abgelegt
  and l.kind <> 'einkauf';

-- ---------------------------------------------------------------------------
-- Einstellungen je Person. Keine Zeile = Standard: an, 08:00, ohne Vortag, 30 Min. Vorlauf.
-- ---------------------------------------------------------------------------
create table if not exists public.push_fristen_einstellungen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  aktiv boolean not null default true,
  uhrzeit time not null default time '08:00',
  vortag boolean not null default false,
  vorlauf smallint not null default 30,
  updated_at timestamptz not null default now(),
  -- 05:00 bis 22:00 im Halbstundentakt (so bietet es die Seite an)
  constraint push_fristen_uhrzeit_raster check (
    uhrzeit between time '05:00' and time '22:00'
    and extract(second from uhrzeit) = 0
    and extract(minute from uhrzeit) in (0, 30)
  ),
  constraint push_fristen_vorlauf_werte check (vorlauf in (0, 15, 30, 60, 120))
);

alter table public.push_fristen_einstellungen enable row level security;
drop policy if exists push_fristen_einstellungen_lesen on public.push_fristen_einstellungen;
create policy push_fristen_einstellungen_lesen on public.push_fristen_einstellungen
  for select to authenticated using (user_id = auth.uid());
-- Schreiben nur ueber push_fristen_einstellen (prueft Anmeldung und Werte)
revoke all on table public.push_fristen_einstellungen from anon, authenticated;
grant select on table public.push_fristen_einstellungen to authenticated;

-- ---------------------------------------------------------------------------
-- Versandprotokolle, fuer Clients unsichtbar (RLS ohne Policies).
--   push_fristen_versand: je Person und Kalendertag hoechstens eine Tagesmeldung.
--   push_termin_versand: je Person, Aufgabe und Fristwert hoechstens eine Termin-Meldung;
--   wird die Frist verschoben, ist es ein neuer Wert und die Erinnerung kommt erneut.
-- ---------------------------------------------------------------------------
create table if not exists public.push_fristen_versand (
  user_id uuid not null references auth.users (id) on delete cascade,
  tag date not null,
  aufgaben int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, tag)
);
alter table public.push_fristen_versand enable row level security;
revoke all on table public.push_fristen_versand from anon, authenticated;

create table if not exists public.push_termin_versand (
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,   -- kein FK: geloeschte Aufgaben duerfen das Protokoll nicht blockieren
  faellig text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, task_id, faellig)
);
alter table public.push_termin_versand enable row level security;
revoke all on table public.push_termin_versand from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC fuer die App: eigene Einstellungen speichern
-- ---------------------------------------------------------------------------
create or replace function public.push_fristen_einstellen(
  p_aktiv boolean, p_uhrzeit time, p_vortag boolean, p_vorlauf integer default 30
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'nicht angemeldet' using errcode = '42501';
  end if;
  if p_aktiv is null or p_uhrzeit is null or p_vortag is null or p_vorlauf is null then
    raise exception 'ungueltig' using errcode = '22023';
  end if;
  -- Ungueltige Uhrzeit oder Vorlauf scheitern an den Check-Constraints (23514)
  insert into public.push_fristen_einstellungen (user_id, aktiv, uhrzeit, vortag, vorlauf, updated_at)
  values (v_user, p_aktiv, p_uhrzeit, p_vortag, p_vorlauf, now())
  on conflict (user_id) do update
    set aktiv = excluded.aktiv, uhrzeit = excluded.uhrzeit, vortag = excluded.vortag,
        vorlauf = excluded.vorlauf, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Fuer den Cron-Lauf (jede Minute): ist jetzt irgendeine Erinnerung dran?
-- ---------------------------------------------------------------------------
create or replace function public.push_fristen_faellig(p_jetzt timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with abonnenten as (
    select ps.user_id, coalesce(e.uhrzeit, time '08:00') as uhrzeit, coalesce(e.vorlauf, 30) as vorlauf
    from (select distinct user_id from public.push_subscriptions) ps
    left join public.push_fristen_einstellungen e on e.user_id = ps.user_id
    where coalesce(e.aktiv, true)
  )
  select exists (
    -- Tagesmeldung: eigene Uhrzeit vor hoechstens drei Stunden erreicht, heute noch nicht
    select 1 from abonnenten a
    where (p_jetzt at time zone 'Europe/Berlin')::time - a.uhrzeit >= interval '0'
      and (p_jetzt at time zone 'Europe/Berlin')::time - a.uhrzeit < interval '3 hours'
      and not exists (
        select 1 from public.push_fristen_versand v
        where v.user_id = a.user_id and v.tag = (p_jetzt at time zone 'Europe/Berlin')::date
      )
  ) or exists (
    -- Termin: Erinnerungszeitpunkt erreicht, Termin hoechstens 2 h vorbei, noch nicht gemeldet
    select 1
    from abonnenten a
    join public.push_fristen_aufgaben f on f.user_id = a.user_id
    where f.due_date like '____-__-__T__:__%'
      and public.tf_frist_zeit(f.due_date) - make_interval(mins => a.vorlauf) <= p_jetzt
      and public.tf_frist_zeit(f.due_date) > p_jetzt - interval '2 hours'
      and not exists (
        select 1 from public.push_termin_versand v
        where v.user_id = a.user_id and v.task_id = f.task_id and v.faellig = f.due_date
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Fuer die Function push-versand: Erinnerungen abholen.
-- Rueckgabe: { "tage": [...], "termine": [...] }.
--
-- Vermerken = Abholen (wie push_buendel_abholen): wer dran ist, wird sofort vermerkt;
-- scheitert danach der Versand, faellt die Erinnerung aus, sie kommt nie doppelt.
-- Eine Tagesmeldung wird auch ohne faellige Aufgaben vermerkt (dann ohne Meldung), damit
-- der Minutentakt nicht staendig erneut prueft.
--
-- Welche Aufgaben und wer erinnert wird: View push_fristen_aufgaben.
-- Tagesmeldung: Frist heute oder ueberfaellig (hoechstens 60 Tage zurueck), mit Vortag auch
-- morgen; je Person hoechstens 20 Aufgaben (frueheste Frist zuerst) plus Gesamtzahl.
-- Termin: `minuten_bis` sind die Minuten bis zur Frist (aufgerundet, negativ = vorbei), damit
-- eine verspaetete Meldung nicht „in 30 Minuten“ behauptet.
-- ---------------------------------------------------------------------------
create or replace function public.push_fristen_abholen(p_jetzt timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
declare
  v_lokal timestamp := p_jetzt at time zone 'Europe/Berlin';
  v_heute date := (p_jetzt at time zone 'Europe/Berlin')::date;
  v_tage jsonb;
  v_termine jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('push_fristen_abholen')) then
    return jsonb_build_object('tage', '[]'::jsonb, 'termine', '[]'::jsonb);
  end if;

  -- Die Protokolle brauchen nur die letzten Tage
  delete from public.push_fristen_versand where tag < v_heute - 14;
  delete from public.push_termin_versand where created_at < p_jetzt - interval '14 days';

  -- Tagesmeldungen
  with dran as (
    select distinct ps.user_id, coalesce(e.vortag, false) as vortag
    from public.push_subscriptions ps
    left join public.push_fristen_einstellungen e on e.user_id = ps.user_id
    where coalesce(e.aktiv, true)
      and v_lokal::time - coalesce(e.uhrzeit, time '08:00') >= interval '0'
      and v_lokal::time - coalesce(e.uhrzeit, time '08:00') < interval '3 hours'
      and not exists (
        select 1 from public.push_fristen_versand v
        where v.user_id = ps.user_id and v.tag = v_heute
      )
  ),
  offen as (
    select d.user_id, f.task_id as id, f.text, f.due_date, f.list_id, f.list_title,
           row_number() over (
             partition by d.user_id
             order by public.tf_frist_tag(f.due_date), f.due_date, f.list_title, f.text, f.task_id
           ) as rn
    from dran d
    join public.push_fristen_aufgaben f on f.user_id = d.user_id
    where public.tf_frist_tag(f.due_date)
          between v_heute - 60 and v_heute + case when d.vortag then 1 else 0 end
  ),
  zaehler as (
    select user_id, count(*)::int as anzahl from offen group by user_id
  ),
  vermerkt as (
    insert into public.push_fristen_versand (user_id, tag, aufgaben)
    select d.user_id, v_heute, coalesce(z.anzahl, 0)
    from dran d
    left join zaehler z on z.user_id = d.user_id
    on conflict (user_id, tag) do nothing
    returning user_id
  )
  select jsonb_agg(jsonb_build_object(
           'user_id', x.user_id,
           'heute', v_heute,
           'anzahl', x.anzahl,
           'aufgaben', x.aufgaben,
           'abos', x.abos) order by x.user_id)
  into v_tage
  from (
    select o.user_id,
           count(*)::int as anzahl,
           jsonb_agg(jsonb_build_object(
             'task_id', o.id,
             'text', left(o.text, 120),
             'due_date', o.due_date,
             'list_id', o.list_id,
             'list_title', o.list_title) order by o.rn) filter (where o.rn <= 20) as aufgaben,
           (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
              from public.push_subscriptions ps
             where ps.user_id = o.user_id) as abos
    from offen o
    join vermerkt vm on vm.user_id = o.user_id
    group by o.user_id
  ) x
  where x.abos is not null;

  -- Termin-Erinnerungen (Aufgaben mit Uhrzeit)
  with abonnenten as (
    select ps.user_id, coalesce(e.vorlauf, 30) as vorlauf
    from (select distinct user_id from public.push_subscriptions) ps
    left join public.push_fristen_einstellungen e on e.user_id = ps.user_id
    where coalesce(e.aktiv, true)
  ),
  termine as (
    select a.user_id, a.vorlauf, f.task_id as id, f.text, f.due_date, f.list_id, f.list_title,
           ceil(extract(epoch from (public.tf_frist_zeit(f.due_date) - p_jetzt)) / 60)::int as minuten_bis
    from abonnenten a
    join public.push_fristen_aufgaben f on f.user_id = a.user_id
    where f.due_date like '____-__-__T__:__%'
      and public.tf_frist_zeit(f.due_date) - make_interval(mins => a.vorlauf) <= p_jetzt
      and public.tf_frist_zeit(f.due_date) > p_jetzt - interval '2 hours'
      and not exists (
        select 1 from public.push_termin_versand v
        where v.user_id = a.user_id and v.task_id = f.task_id and v.faellig = f.due_date
      )
  ),
  vermerkt as (
    insert into public.push_termin_versand (user_id, task_id, faellig)
    select user_id, id, due_date from termine
    on conflict do nothing
    returning user_id, task_id
  )
  select jsonb_agg(jsonb_build_object(
           'user_id', tm.user_id,
           'task_id', tm.id,
           'text', left(tm.text, 120),
           'due_date', tm.due_date,
           'vorlauf', tm.vorlauf,
           'minuten_bis', tm.minuten_bis,
           'list_id', tm.list_id,
           'list_title', tm.list_title,
           'abos', ab.abos) order by tm.due_date, tm.id)
  into v_termine
  from termine tm
  join vermerkt vm on vm.user_id = tm.user_id and vm.task_id = tm.id
  cross join lateral (
    select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)) as abos
    from public.push_subscriptions ps
    where ps.user_id = tm.user_id
  ) ab
  where ab.abos is not null;

  return jsonb_build_object('tage', coalesce(v_tage, '[]'::jsonb), 'termine', coalesce(v_termine, '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Ausfuehrungsrechte (Supabase vergibt Default-Grants an anon/authenticated)
-- ---------------------------------------------------------------------------
revoke all on table public.push_fristen_aufgaben from anon, authenticated;
revoke all on function public.tf_frist_tag(text) from public, anon, authenticated;
revoke all on function public.tf_frist_zeit(text) from public, anon, authenticated;
revoke all on function public.push_fristen_einstellen(boolean, time, boolean, integer) from public, anon;
revoke all on function public.push_fristen_faellig(timestamptz) from public, anon, authenticated;
revoke all on function public.push_fristen_abholen(timestamptz) from public, anon, authenticated;
grant execute on function public.push_fristen_einstellen(boolean, time, boolean, integer) to authenticated;
grant execute on function public.push_fristen_faellig(timestamptz) to service_role;
grant execute on function public.push_fristen_abholen(timestamptz) to service_role;
