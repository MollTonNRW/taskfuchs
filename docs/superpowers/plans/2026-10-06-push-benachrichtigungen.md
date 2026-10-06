# Push-Benachrichtigungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mitglieder geteilter Listen bekommen gebündelte Web-Push-Meldungen auf Android, wenn jemand anderes Aufgaben anlegt, ändert, abhakt oder löscht.

**Architecture:** Ein fehlertoleranter Trigger auf `tasks` schreibt Ereignisse in eine Warteschlange. `pg_cron` ruft jede Minute die Edge Function `push-versand`, die fällige Bündel atomar abholt, Texte baut und per VAPID/aes128gcm versendet. Die App abonniert per Service Worker, verwaltet Abos und Stummschaltungen über RPC/RLS und öffnet per Tipp die Liste.

**Tech Stack:** PostgreSQL 17 (Supabase, pgTAP, pg_cron, pg_net, Vault), Deno 2 (Edge Function, `deno test`), SvelteKit 2 / Svelte 5 Runes / TypeScript strict (Vitest 4), Bubblewrap/Gradle (TWA).

**Spec:** `docs/superpowers/specs/2026-10-06-push-benachrichtigungen-design.md` — verbindlich, vor jeder Aufgabe lesen. Bei Widerspruch gewinnt die Spec.

## Global Constraints

- Öffentliches Repo: keine Secrets, keine User-IDs, keine privaten Schlüssel in Code, Migrationen, Tests, Commits oder Logs.
- `VAPID_PUBLIC_KEY` = `BIdzk--pOIQhqzAyrIOlF_hybzbqgBq7HNy3z_B_n2hkc7Xgk1fgPRSifGfqNE6EFb2WTYncLOD18VfvWmtL8M8`
- Bündelung: Ruhe 2 min, Höchstwartezeit 10 min, veraltet nach 1 Tag.
- Aufgabentext im Event ≤ 120 Zeichen, im Meldungstext ≤ 60, Meldungstext ≤ 180, Payload < 2 KB.
- Tag `tf-<list_id>-<actor_id>`, URL `/app?liste=<list_id>`.
- Trigger darf nie eine Schreiboperation auf `tasks` scheitern lassen.
- UI: nur Token aus `src/tf.css`, keine Animationen, keine gestrichelten Rahmen, 44-px-Touch-Ziele, nie UUID oder ISO-Datum in der Oberfläche, echte `<button>`/`<input>` mit Label.
- Commits deutsch, Imperativ. Jeder Teilstrang committet nur auf seinem eigenen Branch.
- Kein Zugriff auf die Produktivdatenbank aus den Teilsträngen; DB-Tests nur gegen die lokale Supabase (Docker).

## Review Focus

1. **Massen-Updates ohne Relevanz** (Reorder, Einkauf fertig → `abgelegt`, Pin): dürfen keine Events und keinen Subtransaktions-Overhead erzeugen → Test in Task 1 (Reorder von 50 Zeilen erzeugt 0 Events).
2. **Liste löschen** (Kaskade über alle Aufgaben): darf weder scheitern noch Meldungen für die gelöschte Liste erzeugen → Test in Task 1.
3. **Dieselbe Aufgabe in einem Bündel angelegt und wieder gelöscht** (Vertipper): erzeugt keine Meldung → Test in Task 3.
4. **Gerät wechselt das Konto** (Abmelden, anderer Login auf demselben Handy): Abo gehört danach dem neuen Konto, das alte Konto bekommt keine Meldungen mehr aufs fremde Handy → Tests in Task 1 (Endpoint-Übernahme) und Task 9 (Abmelden löscht Abo).
5. **Kaputte oder leere Push-Payload** im Service Worker: zeigt Fallback, wirft nie → Test in Task 8 (reine Hilfsfunktion `leseNachricht`).

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `supabase/migrations/027_push_benachrichtigungen.sql` | Tabellen, RLS, Trigger, RPCs |
| `supabase/migrations/027b_push_cron.sql` | Extensions + Cron-Job |
| `supabase/tests/push_benachrichtigungen.test.sql` | pgTAP |
| `supabase/functions/push-versand/index.ts` | HTTP-Handler (dünn) |
| `supabase/functions/push-versand/lauf.ts` | Ablauf eines Laufs mit injizierten Abhängigkeiten (testbar) |
| `supabase/functions/push-versand/buendeln.ts` | Verdichtung (rein) |
| `supabase/functions/push-versand/texte.ts` | Texte + Payload (rein) |
| `supabase/functions/push-versand/webpush.ts` | Versand + Klassifizierung |
| `supabase/functions/push-versand/secret.ts` | zeitkonstanter Vergleich |
| `supabase/functions/push-versand/*_test.ts` | Deno-Tests |
| `supabase/functions/push-versand/deno.json` | Imports |
| `supabase/config.toml` | `[functions.push-versand] verify_jwt = false` |
| `src/lib/push/vapid.ts` | öffentlicher Schlüssel |
| `src/lib/push/abo.ts` (+ `.test.ts`) | Abo-Logik |
| `src/lib/push/nachricht.ts` (+ `.test.ts`) | Payload lesen, Ziel-URL prüfen (vom SW genutzt) |
| `src/service-worker.ts` | `push`, `notificationclick` |
| `src/routes/app/benachrichtigungen/+page.svelte` | Einstellungsseite |
| `src/lib/utils/deeplink.ts` (+ `.test.ts`) | `?liste=` lesen |
| Zahnrad-Menü (`NavColumn.svelte`, mobil), Abmelden-Pfad, `AppShell.svelte` | Einbindung |
| `twa/twa-manifest.json`, `twa/app/**` | Notification-Delegation, Version 1.3 |

Teilstränge: **A = DB** (Task 1–2), **B = Edge Function** (Task 3–6), **C = App** (Task 7–10), **D = TWA** (Task 11). A–D sind unabhängig; Task 12 (Integration und Deploy) setzt alle voraus.

---

### Task 1: Migration 027 — Tabellen, RLS, Trigger, RPCs (Strang A)

**Files:**
- Create: `supabase/migrations/027_push_benachrichtigungen.sql`
- Create: `supabase/tests/push_benachrichtigungen.test.sql`

**Interfaces:**
- Produces: Tabellen `push_subscriptions`, `list_notification_mutes`, `notification_events`, `push_config`; RPCs `push_abo_speichern(text,text,text,text)`, `push_abo_loeschen(text)`, `push_buendel_abholen(interval,interval) returns jsonb`, `push_abo_ergebnis(text[],text[])` — exakt wie in der Spec.

- [ ] **Step 1: Lokale Supabase starten.** `cd <worktree> && npx -y supabase@2.120.0 start` (Docker läuft). Migrationen 001–026b laufen dabei automatisch. Scheitert eine Alt-Migration lokal, Ursache notieren und **nur lokal** umgehen (z. B. fehlende 021 per `supabase/seed`-freiem Workaround), nie Alt-Migrationen im Repo ändern.

- [ ] **Step 2: pgTAP-Test schreiben (rot).** `supabase/tests/push_benachrichtigungen.test.sql`, Aufbau:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);  -- an die tatsächliche Zahl anpassen

-- Testpersonen (lokal, fiktiv)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'besitzer@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'mitglied@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'fremd@test.local');
-- profiles entstehen per Trigger; Anzeigenamen setzen
update public.profiles set display_name = 'Besitzer' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Mitglied' where id = '00000000-0000-0000-0000-0000000000b2';

-- Hilfsfunktion: als Person handeln
create or replace function pg_temp.als(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.als_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;
create or replace function pg_temp.als_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
```

Danach Fälle — jeweils mit `pg_temp.als_postgres()` vorbereiten, mit `pg_temp.als(...)` handeln, mit `pg_temp.als_postgres()` prüfen:

1. Geteilte Liste L1 (Besitzer a1, Share b2 editor), private Liste L2 (a1 ohne Share).
2. b2 legt Aufgabe in L1 an → genau 1 Event `neu`, `actor_id = b2`, `via_agent = false`, `task_text` = Text.
3. b2 legt Aufgabe in L2 an — geht nicht (RLS) — stattdessen a1 legt in L2 an → 0 Events (private Liste).
4. a1 hakt in L1 ab → Event `erledigt`; wieder auf → `wieder_offen`.
5. a1 ändert `text` → `geaendert`; ändert nur `position` → kein Event; nur `pinned` → kein Event; nur `abgelegt` → kein Event.
6. Reorder: 50 Aufgaben in L1, dann `update tasks set position = position + 1 where list_id = L1` → 0 neue Events.
7. Trenner (`type = 'divider'`) anlegen/ändern/löschen in L1 → 0 Events.
8. Verschieben L1 → L3 (L3 geteilt) → `geloescht` in L1 und `neu` in L3; Verschieben L1 → L2 (privat) → nur `geloescht` in L1.
9. Löschen einer Aufgabe → `geloescht`.
10. Text mit 300 Zeichen → `length(task_text) = 120`.
11. `pg_temp.als_service()` ohne `push_config.agent_actor` → Insert gelingt, 0 Events. Mit `agent_actor = a1` → Event mit `actor_id = a1`, `via_agent = true`.
12. Liste L1 löschen (Kaskade) → gelingt (`lives_ok`), danach 0 Events für L1.
13. Fehlertoleranz: `alter table notification_events rename to notification_events_weg` (als postgres), dann b2 legt Aufgabe in L1 an → `lives_ok`; Tabelle zurückbenennen.
14. RLS: b2 sieht `notification_events` nicht (`throws_ok` permission denied oder 0 Zeilen), sieht `push_config` nicht.
15. `push_abo_speichern` als b2 → Zeile mit `user_id = b2`; zweiter Aufruf mit gleichem Endpoint als c3 → Zeile gehört c3 (Übernahme); b2 sieht sie nicht mehr.
16. `push_abo_speichern` mit `http://…` → `throws_ok` (Check-Constraint); als anon → `throws_ok`.
17. Direkter `insert into push_subscriptions` als b2 → `throws_ok` (kein Insert-Recht).
18. Mehr als 10 Abos einer Person → nach dem 11. bleiben 10 (älteste `last_seen_at` fällt weg).
19. Mute: b2 stummt L1 → ok; c3 stummt L1 (sieht L1 nicht) → `throws_ok`.
20. `push_buendel_abholen`, `push_abo_ergebnis` als `authenticated` und `anon` → `throws_ok` (permission denied).
21. Bündel: Events von b2 in L1 mit `created_at = now() - 1 min` → als service `push_buendel_abholen()` liefert `[]` und Events bleiben; mit `now() - 3 min` → 1 Bündel, Events weg; zweiter Aufruf → `[]`.
22. Höchstwartezeit: Events `now() - 11 min` und `now() - 10 s` derselben Gruppe → fällig.
23. Veraltet: Gruppe mit jüngstem Event `now() - 2 days` → nicht im Ergebnis, Events gelöscht.
24. Empfänger: a1 mit Abo, b2 Bearbeiter mit Abo → `empfaenger` enthält nur a1; a1 stummt L1 → kein Bündel, Events trotzdem weg; a1 ohne Abo → kein Bündel.
25. Bündelinhalt: `list_title`, `list_kind`, `actor_name = 'Mitglied'`, `events` aufsteigend nach `at`, `via_agent`.
26. `push_abo_ergebnis(array['<ok>'], array['<weg>'])` → `last_ok_at` gesetzt, Abo `<weg>` gelöscht.

Abschluss: `select * from finish(); rollback;`

- [ ] **Step 3: Test laufen lassen, muss scheitern.** `npx -y supabase@2.120.0 test db` → FAIL (Tabellen fehlen).

- [ ] **Step 4: Migration schreiben.**

```sql
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
```

- [ ] **Step 5: Anwenden und testen.** `npx -y supabase@2.120.0 db reset` (wendet 001–027 neu an), dann `npx -y supabase@2.120.0 test db` → alle PASS. Zusätzlich `npx -y supabase@2.120.0 db lint` ohne neue Fehler für die neuen Objekte.

- [ ] **Step 6: Commit.** `git add supabase/migrations/027_push_benachrichtigungen.sql supabase/tests/push_benachrichtigungen.test.sql && git commit -m "db: Push-Benachrichtigungen — Warteschlange, Abos, Stummschaltung, Bündel-RPC"`

### Task 2: Migration 027b — Cron (Strang A)

**Files:**
- Create: `supabase/migrations/027b_push_cron.sql`
- Test: `supabase/tests/push_cron.test.sql`

**Interfaces:**
- Consumes: Vault-Secrets `push_versand_url`, `push_cron_secret` (vom Deploy angelegt).
- Produces: Cron-Job `push-versand`.

- [ ] **Step 1: Test schreiben (rot).** pgTAP: Job `push-versand` existiert mit Zeitplan `* * * * *`; Kommando enthält `x-push-secret` und `where exists (select 1 from public.notification_events)`; zweimaliges Anwenden des Migrationsrumpfs ergibt genau einen Job.

- [ ] **Step 2: Migration schreiben.**

```sql
-- 027b_push_cron.sql
-- Erst NACH Deploy der Edge Function und nach Anlegen der Vault-Secrets
-- push_versand_url und push_cron_secret anwenden.
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
```

- [ ] **Step 3: Lokal anwenden, Test grün.** `npx -y supabase@2.120.0 db reset && npx -y supabase@2.120.0 test db`.
- [ ] **Step 4: Lokaler Rundlauf (optional, wenn Task 6 im selben Strang verfügbar ist, sonst überspringen und im Bericht vermerken).**
- [ ] **Step 5: Commit.** `git commit -m "db: Cron-Job push-versand (pg_cron + pg_net, Secrets aus Vault)"`

### Task 3: `buendeln.ts` (Strang B)

**Files:**
- Create: `supabase/functions/push-versand/buendeln.ts`, `supabase/functions/push-versand/buendeln_test.ts`, `supabase/functions/push-versand/typen.ts`

**Interfaces:**
- Produces:

```ts
// typen.ts
export type Art = 'neu' | 'erledigt' | 'wieder_offen' | 'geaendert' | 'geloescht';
export interface Ereignis { task_id: string; art: Art; text: string; at: string }
export interface Abo { endpoint: string; p256dh: string; auth: string }
export interface Empfaenger { user_id: string; abos: Abo[] }
export interface Buendel {
  list_id: string; list_title: string; list_kind: 'aufgaben' | 'einkauf';
  actor_id: string; actor_name: string; via_agent: boolean;
  events: Ereignis[]; empfaenger: Empfaenger[];
}
export const ARTEN: Art[] = ['neu', 'erledigt', 'wieder_offen', 'geaendert', 'geloescht'];
export interface Verdichtet { anzahl: Record<Art, number>; beispiele: Record<Art, string[]>; gesamt: number; einzig?: { art: Art; text: string } }
// buendeln.ts
export function verdichten(events: Ereignis[]): Verdichtet
```

- [ ] **Step 1: Tests schreiben (rot).** `cd supabase/functions/push-versand && deno task test buendeln_test.ts` (vom Repo-Root scheitert `deno test`: Deno findet dort die `package.json` statt der `deno.json` der Function; alternativ `deno test --config supabase/functions/push-versand/deno.json --allow-net=127.0.0.1 --allow-env=ECE_KEYLOG supabase/functions/push-versand/`):

```ts
import { assertEquals } from 'jsr:@std/assert@1';
import { verdichten } from './buendeln.ts';
import type { Ereignis } from './typen.ts';

const e = (task_id: string, art: Ereignis['art'], text = task_id, at = '2026-10-06T10:00:00Z'): Ereignis =>
  ({ task_id, art, text, at });

Deno.test('leere Liste ergibt gesamt 0', () => {
  assertEquals(verdichten([]).gesamt, 0);
});
Deno.test('neu dann geloescht derselben Aufgabe faellt weg', () => {
  const v = verdichten([e('a', 'neu'), e('a', 'geaendert'), e('a', 'geloescht')]);
  assertEquals(v.gesamt, 0);
});
Deno.test('neu dann erledigt bleibt neu', () => {
  const v = verdichten([e('a', 'neu'), e('a', 'erledigt')]);
  assertEquals(v.anzahl.neu, 1);
  assertEquals(v.anzahl.erledigt, 0);
});
Deno.test('ohne neu gilt die letzte Art', () => {
  const v = verdichten([e('a', 'erledigt'), e('a', 'wieder_offen'), e('a', 'erledigt')]);
  assertEquals(v.anzahl.erledigt, 1);
  assertEquals(v.gesamt, 1);
});
Deno.test('Zaehlung und Beispiele je Art, hoechstens 3, Reihenfolge des Auftretens', () => {
  const v = verdichten([
    e('a', 'neu', 'Milch'), e('b', 'neu', 'Brot'), e('c', 'neu', 'Eier'), e('d', 'neu', 'Butter'),
    e('x', 'erledigt', 'Kaese'),
  ]);
  assertEquals(v.anzahl.neu, 4);
  assertEquals(v.beispiele.neu, ['Milch', 'Brot', 'Eier']);
  assertEquals(v.anzahl.erledigt, 1);
  assertEquals(v.gesamt, 5);
});
Deno.test('einzig gesetzt bei genau einer Aufgabe, mit letztem Text', () => {
  const v = verdichten([e('a', 'geaendert', 'Milch'), e('a', 'geaendert', 'Hafermilch')]);
  assertEquals(v.einzig, { art: 'geaendert', text: 'Hafermilch' });
});
Deno.test('unbekannte Art wird ignoriert statt zu werfen', () => {
  // deno-lint-ignore no-explicit-any
  const v = verdichten([{ task_id: 'a', art: 'quatsch' as any, text: 'x', at: '' }]);
  assertEquals(v.gesamt, 0);
});
```

- [ ] **Step 2: Rot prüfen.** Expected: FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren.**

```ts
// buendeln.ts — reine Verdichtung der Ereignisse einer Gruppe (Spec: Verdichtung je Aufgabe).
import { ARTEN, type Art, type Ereignis, type Verdichtet } from './typen.ts';

const MAX_BEISPIELE = 3;

export function verdichten(events: Ereignis[]): Verdichtet {
  const reihenfolge: string[] = [];
  const jeAufgabe = new Map<string, Ereignis[]>();
  for (const ev of events) {
    if (!ARTEN.includes(ev.art)) continue;
    if (!jeAufgabe.has(ev.task_id)) {
      jeAufgabe.set(ev.task_id, []);
      reihenfolge.push(ev.task_id);
    }
    jeAufgabe.get(ev.task_id)!.push(ev);
  }

  const anzahl = Object.fromEntries(ARTEN.map((a) => [a, 0])) as Record<Art, number>;
  const beispiele = Object.fromEntries(ARTEN.map((a) => [a, [] as string[]])) as Record<Art, string[]>;
  let gesamt = 0;
  let einzig: Verdichtet['einzig'];

  for (const id of reihenfolge) {
    const folge = jeAufgabe.get(id)!;
    const erstes = folge[0];
    const letztes = folge[folge.length - 1];
    let art: Art;
    if (erstes.art === 'neu' && letztes.art === 'geloescht') continue;
    if (folge.some((f) => f.art === 'neu')) art = 'neu';
    else art = letztes.art;

    anzahl[art] += 1;
    gesamt += 1;
    const text = letztes.text;
    if (beispiele[art].length < MAX_BEISPIELE && text) beispiele[art].push(text);
    einzig = { art, text };
  }

  return { anzahl, beispiele, gesamt, einzig: gesamt === 1 ? einzig : undefined };
}
```

- [ ] **Step 4: Grün prüfen.** `deno task test buendeln_test.ts` (im Function-Ordner) → PASS.
- [ ] **Step 5: Commit.** `git commit -m "push-versand: Ereignisse je Aufgabe verdichten"`

### Task 4: `texte.ts` (Strang B)

**Files:**
- Create: `supabase/functions/push-versand/texte.ts`, `supabase/functions/push-versand/texte_test.ts`

**Interfaces:**
- Consumes: `Verdichtet`, `Buendel` aus `typen.ts`.
- Produces: `export interface Nachricht { titel: string; text: string; tag: string; url: string }` und `export function nachrichtBauen(b: Buendel, v: Verdichtet): Nachricht | null` (null bei `v.gesamt === 0`).

- [ ] **Step 1: Tests (rot).** Fälle, jeweils mit erwarteter Zeichenkette:
  - Aufgabenliste, einzig `neu` „Arzt anrufen“, Name „Anna“ → `Anna hat „Arzt anrufen“ hinzugefügt`
  - Einkaufsliste, einzig `erledigt` „Milch“ → `Anna hat „Milch“ in den Wagen gelegt`
  - Einkaufsliste, einzig `wieder_offen` → `… wieder auf die Liste gesetzt`; Aufgabenliste → `… wieder geöffnet`
  - `via_agent` → `Frank (Agent) hat „Milch“ hinzugefügt`
  - mehrere, Einkauf: neu 3 (Milch, Brot, Eier) + erledigt 12 → `Anna: 3 neu (Milch, Brot, Eier), 12 in den Wagen`
  - mehrere, Aufgaben: erledigt 2 + geloescht 1 → `Anna: 2 erledigt, 1 gelöscht`
  - Aufgabentext mit 100 Zeichen im Einzelfall → im Text höchstens 60 Zeichen des Aufgabentexts, endet auf `…`
  - Gesamttext nie über 180 Zeichen (viele lange Beispiele), endet dann auf `…`
  - `titel` = `list_title`; leerer Titel → `Taskfuchs`
  - `tag` = `tf-<list_id>-<actor_id>`, `url` = `/app?liste=<list_id>` (list_id URL-kodiert)
  - `gesamt 0` → `null`
  - `JSON.stringify(nachricht).length < 2048` auch im Extremfall
- [ ] **Step 2: Rot prüfen.**
- [ ] **Step 3: Implementieren.**

```ts
// texte.ts — deutsche Meldungstexte (Spec: Texte). Rein, ohne I/O.
import type { Art, Buendel, Verdichtet } from './typen.ts';

export interface Nachricht { titel: string; text: string; tag: string; url: string }

const MAX_TEXT = 180;
const MAX_AUFGABE = 60;

const VERB = {
  aufgaben: { neu: 'hinzugefügt', erledigt: 'erledigt', wieder_offen: 'wieder geöffnet', geaendert: 'geändert', geloescht: 'gelöscht' },
  einkauf: { neu: 'hinzugefügt', erledigt: 'in den Wagen gelegt', wieder_offen: 'wieder auf die Liste gesetzt', geaendert: 'geändert', geloescht: 'gelöscht' },
} as const satisfies Record<string, Record<Art, string>>;

const LABEL = {
  aufgaben: { neu: 'neu', erledigt: 'erledigt', wieder_offen: 'wieder offen', geaendert: 'geändert', geloescht: 'gelöscht' },
  einkauf: { neu: 'neu', erledigt: 'in den Wagen', wieder_offen: 'wieder auf der Liste', geaendert: 'geändert', geloescht: 'gelöscht' },
} as const satisfies Record<string, Record<Art, string>>;

const REIHENFOLGE: Art[] = ['neu', 'erledigt', 'wieder_offen', 'geaendert', 'geloescht'];

function kuerzen(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

export function nachrichtBauen(b: Buendel, v: Verdichtet): Nachricht | null {
  if (v.gesamt === 0) return null;
  const art = b.list_kind === 'einkauf' ? 'einkauf' : 'aufgaben';
  const wer = `${kuerzen(b.actor_name || 'Jemand', 40)}${b.via_agent ? ' (Agent)' : ''}`;

  let text: string;
  if (v.einzig) {
    text = `${wer} hat „${kuerzen(v.einzig.text, MAX_AUFGABE)}“ ${VERB[art][v.einzig.art]}`;
  } else {
    const teile = REIHENFOLGE.filter((a) => v.anzahl[a] > 0).map((a) => {
      const basis = `${v.anzahl[a]} ${LABEL[art][a]}`;
      if (a !== 'neu' || v.beispiele.neu.length === 0) return basis;
      return `${basis} (${v.beispiele.neu.map((t) => kuerzen(t, MAX_AUFGABE)).join(', ')})`;
    });
    text = `${wer}: ${teile.join(', ')}`;
  }

  return {
    titel: kuerzen(b.list_title || 'Taskfuchs', 60) || 'Taskfuchs',
    text: kuerzen(text, MAX_TEXT),
    tag: `tf-${b.list_id}-${b.actor_id}`,
    url: `/app?liste=${encodeURIComponent(b.list_id)}`,
  };
}
```

- [ ] **Step 4: Grün prüfen.** `deno task test texte_test.ts` (im Function-Ordner).
- [ ] **Step 5: Commit.** `git commit -m "push-versand: deutsche Meldungstexte"`

### Task 5: `webpush.ts` + `secret.ts` (Strang B)

**Files:**
- Create: `supabase/functions/push-versand/webpush.ts`, `webpush_test.ts`, `secret.ts`, `secret_test.ts`, `deno.json`

**Interfaces:**
- Produces:

```ts
// secret.ts
export function secretGleich(a: string | null, b: string | undefined): boolean // zeitkonstant; false bei leer/undefiniert
// webpush.ts
export type Ergebnis = 'ok' | 'weg' | 'fehler';
export function klassifizieren(status: number): Ergebnis // 2xx ok, 404/410 weg, sonst fehler
export interface Sender { senden(abo: Abo, payload: string): Promise<number> } // liefert HTTP-Status, wirft bei Netzfehler
export async function senderErstellen(cfg: { publicKey: string; privateKey: string; subject: string }): Promise<Sender>
```

- [ ] **Step 1: Bibliothek wählen und nachweisen.** Kandidaten `jsr:@negrel/webpush` (WebCrypto, Deno-nativ) und `npm:web-push@3.6.7`. Nachweis-Test `webpush_test.ts`: mit einem lokal erzeugten Empfänger-Schlüsselpaar (ECDH P-256 + 16-Byte-auth) eine Payload verschlüsseln und **mit einer unabhängigen Implementierung entschlüsseln** (RFC 8291 aes128gcm, z. B. `npm:http_ece`), Klartext gleich. Gegen einen lokalen `Deno.serve`-Mock-Push-Endpoint senden und prüfen: Methode POST, Header `TTL: 21600`, `Content-Encoding: aes128gcm`, `Authorization: vapid t=…, k=<publicKey>` (JWT ES256, `aud` = Origin des Endpoints, `exp` ≤ 24 h, `sub` = Subject). Die erste Bibliothek, die alle Prüfungen besteht, wird genommen; Wahl und Grund als Kommentar in `webpush.ts`.
- [ ] **Step 2: `klassifizieren` und `secretGleich` testen** (201 → ok, 410 → weg, 404 → weg, 413 → fehler, 429 → fehler, 500 → fehler; `secretGleich('a','a')` true, `('a','b')` false, `(null,'a')` false, `('a', undefined)` false, `('', '')` false).
- [ ] **Step 3: Implementieren** (VAPID-Schlüssel im Format von `web-push generate-vapid-keys`: base64url, public 65 Byte unkomprimierter Punkt, private 32 Byte; bei Bedarf in JWK umrechnen). Timeout je Versand 10 s (`AbortSignal.timeout`).
- [ ] **Step 4: `deno task test` grün, `deno check`, `deno lint`** (jeweils im Function-Ordner).
- [ ] **Step 5: Commit.** `git commit -m "push-versand: Web-Push-Versand mit VAPID, nachgewiesene Verschlüsselung"`

### Task 6: `lauf.ts` + `index.ts` (Strang B)

**Files:**
- Create: `supabase/functions/push-versand/lauf.ts`, `lauf_test.ts`, `index.ts`
- Modify: `supabase/config.toml` (Abschnitt `[functions.push-versand]` mit `verify_jwt = false`)

**Interfaces:**
- Consumes: `verdichten`, `nachrichtBauen`, `Sender`, `klassifizieren`, `secretGleich`.
- Produces:

```ts
export interface Abhaengigkeiten {
  abholen(): Promise<Buendel[]>;                       // rpc push_buendel_abholen
  ergebnis(ok: string[], weg: string[]): Promise<void>; // rpc push_abo_ergebnis
  sender: Sender;
  log(msg: string): void;
}
export interface Bericht { buendel: number; gesendet: number; fehler: number; entfernt: number }
export async function lauf(d: Abhaengigkeiten, parallel?: number): Promise<Bericht>
```

- [ ] **Step 1: Tests (rot)** mit Fake-Abhängigkeiten: zwei Bündel, drei Abos → `sender.senden` 3×, Payload-JSON enthält `titel`/`text`/`tag`/`url`; Status 410 → Endpoint in `weg`; Wurf (Netzfehler) → `fehler` +1, Endpoint weder in `ok` noch `weg`; Bündel mit `gesamt 0` nach Verdichtung → kein Versand; leere Abholung → `ergebnis` nicht aufgerufen, Bericht 0; Logs enthalten weder Aufgabentexte noch Endpoints (Test prüft alle `log`-Aufrufe gegen die Testtexte/Endpoints); höchstens `parallel` (Default 6) gleichzeitige Sendungen.
- [ ] **Step 2: Rot prüfen.**
- [ ] **Step 3: Implementieren.** `index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { lauf } from './lauf.ts';
import { secretGleich } from './secret.ts';
import { senderErstellen } from './webpush.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!secretGleich(req.headers.get('x-push-secret'), Deno.env.get('PUSH_CRON_SECRET'))) {
    return new Response('Unauthorized', { status: 401 });
  }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const sender = await senderErstellen({
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://taskfuchs.molltoncreative.de',
  });
  try {
    const bericht = await lauf({
      abholen: async () => {
        const { data, error } = await sb.rpc('push_buendel_abholen');
        if (error) throw new Error(`abholen: ${error.code ?? ''}`);
        return (data ?? []) as never;
      },
      ergebnis: async (ok, weg) => {
        const { error } = await sb.rpc('push_abo_ergebnis', { p_ok: ok, p_weg: weg });
        if (error) throw new Error(`ergebnis: ${error.code ?? ''}`);
      },
      sender,
      log: (m) => console.log(m),
    });
    return Response.json(bericht);
  } catch (e) {
    console.error(`push-versand: ${(e as Error).message}`);
    return new Response('Fehler', { status: 500 });
  }
});
```

- [ ] **Step 4: Lokaler Rundlauf.** `npx -y supabase@2.120.0 functions serve push-versand --env-file <tmp-env>` mit lokalem Test-VAPID-Paar und Test-Secret; `curl -X POST` ohne Header → 401, mit Header → 200 `{"buendel":0,...}`. Mit lokaler DB aus Strang A, falls im selben Worktree verfügbar; sonst `abholen` gemockt (bereits durch Tests abgedeckt) und im Bericht vermerken.
- [ ] **Step 5: `deno task test`, `deno check index.ts`, `deno lint` grün (im Function-Ordner). Commit.** `git commit -m "push-versand: Lauf und HTTP-Handler (Secret-Header, Zähler-Logs)"`

### Task 7: `vapid.ts` + `abo.ts` (Strang C)

**Files:**
- Create: `src/lib/push/vapid.ts`, `src/lib/push/abo.ts`, `src/lib/push/abo.test.ts`

**Interfaces:**
- Produces:

```ts
export type PushStatus = 'nicht-unterstuetzt' | 'verweigert' | 'aus' | 'an';
export interface PushUmgebung {             // injizierbar für Tests
  hatPush: boolean;                           // 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  berechtigung(): NotificationPermission;
  berechtigungAnfragen(): Promise<NotificationPermission>;
  registrierung(): Promise<ServiceWorkerRegistration>;
  userAgent: string;
  standalone: boolean;                        // display-mode: standalone
  ausApp: boolean;                            // document.referrer beginnt mit 'android-app://'
}
export function browserUmgebung(): PushUmgebung
export async function pushStatus(u?: PushUmgebung): Promise<PushStatus>
export async function einschalten(sb: SupabaseClient, u?: PushUmgebung): Promise<PushStatus>
export async function ausschalten(sb: SupabaseClient, u?: PushUmgebung): Promise<void>
export async function abgleichen(sb: SupabaseClient, u?: PushUmgebung): Promise<void>
export function geraetName(u: Pick<PushUmgebung, 'userAgent' | 'standalone' | 'ausApp'>): string
export function base64UrlZuUint8(s: string): Uint8Array
```

- [ ] **Step 1: Tests (rot)** mit Fake-Umgebung und Fake-`sb.rpc`:
  - `hatPush false` → `nicht-unterstuetzt`; Berechtigung `denied` → `verweigert`; `granted` ohne Abo → `aus`; mit Abo → `an`; `default` → `aus`.
  - `einschalten`: fragt Berechtigung an; `denied` → `verweigert`, kein `subscribe`, kein RPC; `granted` → `subscribe({ userVisibleOnly: true, applicationServerKey })` mit Uint8Array des öffentlichen Schlüssels (65 Byte, erstes Byte 0x04), danach `rpc('push_abo_speichern', { p_endpoint, p_p256dh, p_auth, p_geraet })`; RPC-Fehler → `unsubscribe()` und Fehler werfen.
  - `ausschalten`: RPC `push_abo_loeschen` mit Endpoint, danach `unsubscribe`; RPC-Fehler → trotzdem `unsubscribe`, kein Wurf; kein Abo → nichts.
  - `abgleichen`: nur bei `granted` und vorhandenem Abo → RPC speichern; sonst nichts; Fehler werden geschluckt.
  - `geraetName`: Android + `ausApp` → `Android · Taskfuchs-App`; Android + standalone → `Android · App`; Android Chrome → `Android · Chrome`; Desktop Chrome → `Desktop · Chrome`; Firefox → `… · Firefox`; unbekannt → `Browser`.
  - `base64UrlZuUint8(VAPID_PUBLIC_KEY).length === 65`.
- [ ] **Step 2: Rot prüfen.** `npm test -- src/lib/push/abo.test.ts`.
- [ ] **Step 3: Implementieren.**

```ts
// src/lib/push/vapid.ts
/** Öffentlicher VAPID-Schlüssel (Spec Push-Benachrichtigungen). Nicht geheim. */
export const VAPID_PUBLIC_KEY =
	'BIdzk--pOIQhqzAyrIOlF_hybzbqgBq7HNy3z_B_n2hkc7Xgk1fgPRSifGfqNE6EFb2WTYncLOD18VfvWmtL8M8';
```

```ts
// src/lib/push/abo.ts — Push-Abo dieses Geräts (Spec Push-Benachrichtigungen, Abschnitt App).
import type { SupabaseClient } from '@supabase/supabase-js';
import { VAPID_PUBLIC_KEY } from './vapid';

export type PushStatus = 'nicht-unterstuetzt' | 'verweigert' | 'aus' | 'an';

export interface PushUmgebung {
	hatPush: boolean;
	berechtigung(): NotificationPermission;
	berechtigungAnfragen(): Promise<NotificationPermission>;
	registrierung(): Promise<ServiceWorkerRegistration>;
	userAgent: string;
	standalone: boolean;
	ausApp: boolean;
}

export function browserUmgebung(): PushUmgebung {
	const hatPush =
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window;
	return {
		hatPush,
		berechtigung: () => (hatPush ? Notification.permission : 'denied'),
		berechtigungAnfragen: () => Notification.requestPermission(),
		registrierung: () => navigator.serviceWorker.ready,
		userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
		standalone:
			typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true,
		ausApp: typeof document !== 'undefined' && document.referrer.startsWith('android-app://')
	};
}

export function base64UrlZuUint8(s: string): Uint8Array {
	const pad = '='.repeat((4 - (s.length % 4)) % 4);
	const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function uint8ZuBase64Url(buf: ArrayBuffer | null): string {
	if (!buf) return '';
	let bin = '';
	for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function geraetName(u: Pick<PushUmgebung, 'userAgent' | 'standalone' | 'ausApp'>): string {
	const ua = u.userAgent;
	const system = /Android/i.test(ua) ? 'Android' : /Windows|Macintosh|Linux|CrOS/i.test(ua) ? 'Desktop' : '';
	if (system === 'Android' && u.ausApp) return 'Android · Taskfuchs-App';
	if (u.standalone) return `${system || 'Gerät'} · App`;
	const browser = /Firefox\//.test(ua)
		? 'Firefox'
		: /Edg\//.test(ua)
			? 'Edge'
			: /SamsungBrowser\//.test(ua)
				? 'Samsung Internet'
				: /Chrome\//.test(ua)
					? 'Chrome'
					: '';
	if (!system && !browser) return 'Browser';
	return [system || 'Gerät', browser || 'Browser'].join(' · ');
}

async function aktuellesAbo(u: PushUmgebung): Promise<PushSubscription | null> {
	const reg = await u.registrierung();
	return reg.pushManager.getSubscription();
}

export async function pushStatus(u: PushUmgebung = browserUmgebung()): Promise<PushStatus> {
	if (!u.hatPush) return 'nicht-unterstuetzt';
	const b = u.berechtigung();
	if (b === 'denied') return 'verweigert';
	if (b !== 'granted') return 'aus';
	return (await aktuellesAbo(u)) ? 'an' : 'aus';
}

async function speichern(sb: SupabaseClient, abo: PushSubscription, u: PushUmgebung): Promise<void> {
	const { error } = await sb.rpc('push_abo_speichern', {
		p_endpoint: abo.endpoint,
		p_p256dh: uint8ZuBase64Url(abo.getKey('p256dh')),
		p_auth: uint8ZuBase64Url(abo.getKey('auth')),
		p_geraet: geraetName(u)
	});
	if (error) throw new Error(error.message);
}

export async function einschalten(sb: SupabaseClient, u: PushUmgebung = browserUmgebung()): Promise<PushStatus> {
	if (!u.hatPush) return 'nicht-unterstuetzt';
	const b = await u.berechtigungAnfragen();
	if (b === 'denied') return 'verweigert';
	if (b !== 'granted') return 'aus';
	const reg = await u.registrierung();
	const abo =
		(await reg.pushManager.getSubscription()) ??
		(await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: base64UrlZuUint8(VAPID_PUBLIC_KEY)
		}));
	try {
		await speichern(sb, abo, u);
	} catch (e) {
		await abo.unsubscribe().catch(() => undefined);
		throw e;
	}
	return 'an';
}

export async function ausschalten(sb: SupabaseClient, u: PushUmgebung = browserUmgebung()): Promise<void> {
	if (!u.hatPush) return;
	const abo = await aktuellesAbo(u);
	if (!abo) return;
	try {
		await sb.rpc('push_abo_loeschen', { p_endpoint: abo.endpoint });
	} catch {
		// Abmelden darf daran nicht scheitern
	}
	await abo.unsubscribe().catch(() => undefined);
}

export async function abgleichen(sb: SupabaseClient, u: PushUmgebung = browserUmgebung()): Promise<void> {
	try {
		if (!u.hatPush || u.berechtigung() !== 'granted') return;
		const abo = await aktuellesAbo(u);
		if (abo) await speichern(sb, abo, u);
	} catch {
		// still: nächster Start versucht es wieder
	}
}
```

Hinweis: `applicationServerKey` erwartet je nach TS-Lib `BufferSource`; bei Typfehler `base64UrlZuUint8(...) as BufferSource`.

- [ ] **Step 4: Grün prüfen.** `npm test -- src/lib/push/abo.test.ts` PASS.
- [ ] **Step 5: Commit.** `git commit -m "push: Abo-Logik für dieses Gerät"`

### Task 8: Service Worker (Strang C)

**Files:**
- Create: `src/lib/push/nachricht.ts`, `src/lib/push/nachricht.test.ts`
- Modify: `src/service-worker.ts` (nur Ergänzungen am Ende; Fetch-/Cache-Logik unverändert)

**Interfaces:**
- Produces:

```ts
export interface PushAnzeige { titel: string; text: string; tag?: string; url: string }
export function leseNachricht(roh: string | null | undefined): PushAnzeige   // nie werfen
export function zielUrl(url: unknown, origin: string): string                  // nur gleiche Origin, sonst '/app'
```

- [ ] **Step 1: Tests (rot):** gültiges JSON → Felder übernommen; `null`, `''`, `'kaputt'`, `'[]'`, `'{"titel":5}'` → `{ titel: 'Taskfuchs', text: 'Neue Änderungen', url: '/app' }`; `zielUrl('/app?liste=x', 'https://a.de')` → `'/app?liste=x'`; `zielUrl('https://boese.de/x', 'https://a.de')` → `'/app'`; `zielUrl('//boese.de', …)` → `'/app'`; `zielUrl('javascript:alert(1)', …)` → `'/app'`; Texte über 300 Zeichen werden gekürzt.
- [ ] **Step 2: Rot prüfen.**
- [ ] **Step 3: Implementieren** (`nachricht.ts` rein; im SW):

```ts
import { leseNachricht, zielUrl } from '$lib/push/nachricht';

sw.addEventListener('push', (event) => {
	const n = leseNachricht(event.data?.text());
	event.waitUntil(
		sw.registration.showNotification(n.titel, {
			body: n.text,
			tag: n.tag,
			renotify: Boolean(n.tag),
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-96.png',
			data: { url: n.url }
		} as NotificationOptions)
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const ziel = new URL(zielUrl(event.notification.data?.url, sw.location.origin), sw.location.origin).href;
	event.waitUntil(
		(async () => {
			const fenster = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const f of fenster) {
				if (new URL(f.url).origin === sw.location.origin) {
					await f.focus();
					await f.navigate(ziel).catch(() => undefined);
					return;
				}
			}
			await sw.clients.openWindow(ziel);
		})()
	);
});
```

Icon-Pfade an die vorhandenen Dateien in `static/icons/` anpassen (prüfen, welche existieren).
- [ ] **Step 4: `npm test`, `npm run check`, `npm run build` ohne neue Fehler.**
- [ ] **Step 5: Commit.** `git commit -m "service-worker: Push anzeigen, Tipp öffnet die Liste"`

### Task 9: Seite „Benachrichtigungen“, Menü, Abmelden (Strang C)

**Files:**
- Create: `src/routes/app/benachrichtigungen/+page.svelte` (ggf. `+page.ts` wie `g2-koppeln`)
- Modify: Zahnrad-Menü in `src/lib/components/tf/NavColumn.svelte` und das mobile Gegenstück (dort, wo `ListsOverview.svelte` das Zahnrad-Menü öffnet), Abmelde-Pfad (wo `signOut` aufgerufen wird), `src/tf.css` (nur neue Regeln mit Token)
- Test: `src/lib/push/seite.test.ts` für reine Hilfen der Seite (z. B. `geteilteListen(lists, shares, uid)`, `statusText(status)`)

**Interfaces:**
- Consumes: `pushStatus`, `einschalten`, `ausschalten` aus Task 7; Tabelle `list_notification_mutes`.
- Produces: Route `/app/benachrichtigungen`; Menüeintrag „Benachrichtigungen“.

- [ ] **Step 1: Vorbild lesen:** `src/routes/app/g2-koppeln/+page.svelte` (Supabase-Zugriff, Layout, Zurück-Weg) und wie das Zahnrad-Menü in `NavColumn.svelte` Einträge rendert.
- [ ] **Step 2: Tests (rot)** für reine Hilfen:
  - `geteilteListen`: liefert nur Listen, die geteilt sind (eigene mit Share an andere, oder fremde, an denen ich Share habe), sortiert wie die Navigation, ohne Duplikate.
  - `statusText`: `nicht-unterstuetzt` → „Dieses Gerät kann keine Benachrichtigungen empfangen.“; `verweigert` → „Benachrichtigungen sind für Taskfuchs blockiert. Erlaube sie in den Android-Einstellungen unter Apps › Taskfuchs › Benachrichtigungen.“; `aus` → „Auf diesem Gerät aus.“; `an` → „Auf diesem Gerät an.“
- [ ] **Step 3: Implementieren.** Seite: Überschrift „Benachrichtigungen“, Erklärsatz („Du bekommst eine Meldung, wenn jemand anderes in einer geteilten Liste etwas ändert. Mehrere Änderungen kurz hintereinander kommen gebündelt.“), Statuszeile, primärer Knopf „Auf diesem Gerät einschalten“ bzw. „Ausschalten“ (deaktiviert während der Anfrage, Fehler als Toast), Abschnitt „Geteilte Listen“ mit Checkbox je Liste (Label = Emoji + Titel, angehakt = Meldungen an; Ändern schreibt/löscht `list_notification_mutes`, optimistisch mit Rücknahme bei Fehler), Hinweis wenn keine geteilten Listen. Zurück zur App wie in `g2-koppeln`. Menüeintrag „Benachrichtigungen“ mit vorhandenem Icon (z. B. `glocke`, sonst im `Icon.svelte` nach Muster ein Glocken-Icon ergänzen: viewBox 24, Stroke 1.75). Abmelden: vor `signOut` `await ausschalten(sb).catch(() => {})`. App-Start: `abgleichen(sb)` einmal nach Login (dort, wo die Shell initialisiert).
- [ ] **Step 4: `npm test`, `npm run check` (keine neuen Fehler gegenüber den 5 bekannten in `g2-koppeln`), `npm run lint` (keine neuen), `npm run build`. Sichtprüfung per `npm run dev` + Playwright-Screenshot mobil (390×844) hell und dunkel; Screenshots im Bericht nennen.**
- [ ] **Step 5: Commit.** `git commit -m "einstellungen: Seite Benachrichtigungen, Menüeintrag, Abo beim Abmelden löschen"`

### Task 10: Deep Link `?liste=` (Strang C)

**Files:**
- Create: `src/lib/utils/deeplink.ts`, `src/lib/utils/deeplink.test.ts`
- Modify: `src/lib/components/tf/AppShell.svelte` (Start-Logik)

**Interfaces:**
- Produces: `export function listeAusUrl(search: string): string | null` (nur UUID-Format, sonst null).

- [ ] **Step 1: Tests (rot):** `'?liste=<uuid>'` → uuid; `'?liste=abc'` → null; `''` → null; `'?liste=<uuid>&x=1'` → uuid; Großbuchstaben-UUID → normalisiert klein.
- [ ] **Step 2: Rot prüfen.**
- [ ] **Step 3: Implementieren** und in `AppShell` beim Start (nachdem Listen geladen sind) anwenden: existiert die Liste → aktiv setzen (mobil: Tab „Listen“, Unterschirm Liste — über die vorhandenen Funktionen von `stores/tf/navigation.svelte.ts`), danach `history.replaceState` ohne `liste`. Unbekannte ID → normaler Start.
- [ ] **Step 4: `npm test`, `npm run check`, `npm run build`.**
- [ ] **Step 5: Commit.** `git commit -m "app: /app?liste=<id> öffnet die Liste (Ziel der Benachrichtigung)"`

### Task 11: TWA 1.3 mit Notification-Delegation (Strang D)

**Files:**
- Modify: `twa/twa-manifest.json`, von Bubblewrap regenerierte Dateien unter `twa/app/`, `twa/app/build.gradle`

- [ ] **Step 1:** `twa/twa-manifest.json`: `"enableNotifications": true`, `"appVersionName": "1.3"`, `"appVersionCode": 6` (Feldnamen wie im vorhandenen File).
- [ ] **Step 2:** Projekt regenerieren: `cd twa && npx -y @bubblewrap/cli@latest update --skipVersionUpgrade` (bzw. die vorhandene Bubblewrap-Version; nicht-interaktiv, ggf. `--manifest=./twa-manifest.json`). Diff prüfen: `AndroidManifest.xml` enthält `android.permission.POST_NOTIFICATIONS` und den `DelegationService` mit aktivem `enableNotification`; keine fremden Änderungen an Host, Package, Signatur, Asset-Links.
- [ ] **Step 3:** Signiert bauen: Keystore `twa/taskfuchs-keystore.jks`, Alias/Passwort aus `~/ClaudeProjects/infrastruktur/.env` (`TASKFUCHS_KEYSTORE_ALIAS`, `TASKFUCHS_KEYSTORE_PASSWORD`) per Umgebungsvariablen (`BUBBLEWRAP_KEYSTORE_PASSWORD`, `BUBBLEWRAP_KEY_PASSWORD`), **nie** ins Log ausgeben. `npx @bubblewrap/cli build --skipPwaValidation`. Ergebnis `twa/taskfuchs-v1.3.apk` (gitignored).
- [ ] **Step 4:** Prüfen: `aapt2 dump badging` (Package, versionCode 6, versionName 1.3), `aapt2 dump permissions` (POST_NOTIFICATIONS), `apksigner verify --print-certs` SHA-256 = `TASKFUCHS_KEYSTORE_SHA256`.
- [ ] **Step 5: Commit** (nur Quell-/Konfigurationsdateien, keine APK). `git commit -m "twa: 1.3 mit Notification-Delegation"`

### Task 12: Integration, Review, Deploy, Ende-zu-Ende (Orchestrator)

- [ ] **Step 1:** Stränge A–D in `feature/push-benachrichtigungen` mergen; volle Testläufe: `supabase test db`, `(cd supabase/functions/push-versand && deno task test)`, `npm test`, `npm run check`, `npm run lint`, `npm run build`.
- [ ] **Step 2:** Reviews: Datenbank/Security (RLS, `SECURITY DEFINER`, Grants, Trigger-Fehlertoleranz), Edge Function (Secret, Logs, Krypto), Frontend (`frontend-quality-reviewer`: CSP, Token, a11y), Gesamt (`devteam-reviewer`). P0/P1 beheben.
- [ ] **Step 3: Deploy Produktion**, in dieser Reihenfolge:
  1. `apply_migration` 027.
  2. Function-Secrets setzen (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_CRON_SECRET`), `supabase functions deploy push-versand --no-verify-jwt`; Smoke 401/200.
  3. Vault: `push_versand_url`, `push_cron_secret`; `push_config.agent_actor`; `apply_migration` 027b; `cron.job_run_details` zeigt Läufe.
  4. App: Merge nach `main` → GitHub Actions → Cloudflare Pages; Smoke: `/app/benachrichtigungen` lädt, CSP-Konsole sauber.
  5. APK 1.3 an Frank.
- [ ] **Step 4:** Ende-zu-Ende mit Frank (Spec, Abschnitt Tests).
- [ ] **Step 5:** `CLAUDE.md` des Repos aktualisieren (Push unter „implementiert“, Migrationen 027/027b, neue Route, neue Tabellen; unter „Build-Befehle“ den Edge-Function-Test: `(cd supabase/functions/push-versand && deno task test)`), Register/Tagesdatei.
