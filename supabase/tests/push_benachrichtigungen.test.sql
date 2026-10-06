-- pgTAP: Push-Benachrichtigungen (Migration 027)
-- Spec: docs/superpowers/specs/2026-10-06-push-benachrichtigungen-design.md
-- Ausfuehren: supabase test db  (lokale Supabase, Migrationen 001-027 angewendet)
--
-- Alle Personen, Listen und Endpoints sind fiktiv. Der Test laeuft in einer
-- Transaktion und wird zurueckgerollt; es bleibt nichts in der Datenbank.
-- Vorbereiten und Pruefen als postgres, Handeln als die jeweilige Person
-- (Rolle authenticated mit sub-Claim), den Dienst (service_role) oder anon.
begin;
create extension if not exists pgtap with schema extensions;
select plan(191);

-- ---------------------------------------------------------------------------
-- Testpersonen (Kennungen aus Hex, damit sie als UUID gelten)
--   a1 Besitzer, b2 Mitglied (editor), c3 Fremd (keine Freigabe), d4 Betrachter (viewer)
--   L1 geteilt (Einkaufsliste), L2 privat, L3 geteilt, L4 geteilt (wird geloescht),
--   L5 nur Besitzer-Freigabe (gilt als privat)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'besitzer@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'mitglied@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'fremd@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'betrachter@test.local');
update public.profiles set display_name = 'Besitzer' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set display_name = 'Mitglied' where id = '00000000-0000-0000-0000-0000000000b2';
update public.profiles set display_name = null, username = null where id = '00000000-0000-0000-0000-0000000000c3';
update public.profiles set display_name = '', username = 'dora' where id = '00000000-0000-0000-0000-0000000000d4';

insert into public.lists (id, user_id, title, kind) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Einkaufen', 'einkauf'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Privat', 'aufgaben'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'Familie', 'aufgaben'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'Wegwerfen', 'aufgaben'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'Nur ich', 'aufgaben');
insert into public.list_shares (list_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'editor'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d4', 'viewer'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b2', 'editor'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b2', 'editor'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'owner');

-- ---------------------------------------------------------------------------
-- Hilfen: als Person/Dienst/anon handeln, zurueck zu postgres, Zaehlhilfen
-- ---------------------------------------------------------------------------
create or replace function pg_temp.als(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.als_ohne_sub() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.als_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
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

-- Gueltige Beispiel-Schluessel (base64url ohne Padding): p256dh = 65 Byte = 87 Zeichen,
-- auth = 16 Byte = 22 Zeichen. Das Argument erzeugt abweichende Schluessel.
create or replace function pg_temp.kp(c text default 'p') returns text language sql immutable as $$
  select 'B' || repeat(c, 86) $$;
create or replace function pg_temp.ka(c text default 'a') returns text language sql immutable as $$
  select repeat(c, 22) $$;

-- Anzahl Events (nur als postgres aufrufen), optional je Liste/Art
create or replace function pg_temp.n_ev(p_list uuid default null, p_art text default null)
returns int language sql as $$
  select count(*)::int from public.notification_events
  where (p_list is null or list_id = p_list) and (p_art is null or art = p_art);
$$;

-- Ergebnis des Versand-RPC, als Dienst abgeholt, in einer Temp-Tabelle ablegen
create temp table erg (j jsonb);
grant all on table erg to public;
create or replace function pg_temp.abholen() returns void language plpgsql as $$
begin
  perform pg_temp.als_service();
  delete from erg;
  insert into erg select public.push_buendel_abholen();
  perform pg_temp.als_postgres();
end $$;

-- ===========================================================================
-- A. Aufbau (Tabellen, RLS, Trigger, Funktionen)
-- ===========================================================================
select has_table('public', 'push_subscriptions', 'Tabelle push_subscriptions existiert');
select has_table('public', 'list_notification_mutes', 'Tabelle list_notification_mutes existiert');
select has_table('public', 'notification_events', 'Tabelle notification_events existiert');
select has_table('public', 'push_config', 'Tabelle push_config existiert');
select has_trigger('public', 'tasks', 'tasks_push_event', 'Trigger tasks_push_event auf tasks');
select is(
  (select count(*)::int from pg_class
   where oid in ('public.push_subscriptions'::regclass, 'public.list_notification_mutes'::regclass,
                 'public.notification_events'::regclass, 'public.push_config'::regclass)
     and relrowsecurity),
  4, 'RLS ist auf allen vier Tabellen an');
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename in ('notification_events', 'push_config')),
  0, 'notification_events und push_config haben keine Policies');
select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('notification_events', 'push_config', 'push_subscriptions')),
  0, 'Warteschlange, Config und Abos stehen nicht in der Realtime-Publikation');
select is(
  (select count(*)::int from pg_proc p
   where p.oid in ('public.push_event_erfassen()'::regprocedure,
                   'public.push_event_eintragen(uuid,uuid,boolean,text,uuid,text)'::regprocedure,
                   'public.push_abo_speichern(text,text,text,text)'::regprocedure,
                   'public.push_abo_loeschen(text)'::regprocedure,
                   'public.push_buendel_abholen(interval,interval)'::regprocedure,
                   'public.push_abo_ergebnis(text[],text[])'::regprocedure)
     and p.prosecdef
     and p.proconfig @> array['search_path=public, pg_temp']),
  6, 'alle sechs Funktionen sind SECURITY DEFINER mit festem search_path');
select is(
  (select tgenabled from pg_trigger where tgname = 'tasks_push_event' and tgrelid = 'public.tasks'::regclass),
  'O'::"char", 'Trigger tasks_push_event ist aktiv');

-- Rechte auf Tabellen und Sequenz: nur das, was die App braucht
select is(
  (select array_agg(a.privilege_type order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a
   where c.oid = 'public.push_subscriptions'::regclass and a.grantee = 'authenticated'::regrole),
  array['DELETE', 'SELECT'], 'push_subscriptions: authenticated hat nur SELECT und DELETE');
select is(
  (select array_agg(a.privilege_type order by a.privilege_type) from pg_class c, aclexplode(c.relacl) a
   where c.oid = 'public.list_notification_mutes'::regclass and a.grantee = 'authenticated'::regrole),
  array['DELETE', 'INSERT', 'SELECT'], 'list_notification_mutes: authenticated hat nur SELECT, INSERT, DELETE');
select is(
  (select count(*)::int from pg_class c, aclexplode(c.relacl) a
   where c.oid in ('public.push_subscriptions'::regclass, 'public.list_notification_mutes'::regclass,
                   'public.notification_events'::regclass, 'public.push_config'::regclass)
     and a.grantee = 'anon'::regrole),
  0, 'anon hat keinerlei Rechte auf den vier Tabellen');
select is(
  (select count(*)::int from pg_class c, aclexplode(c.relacl) a
   where c.oid in ('public.notification_events'::regclass, 'public.push_config'::regclass)
     and a.grantee = 'authenticated'::regrole),
  0, 'authenticated hat keinerlei Rechte auf notification_events und push_config');
select is(
  (select bool_or(has_sequence_privilege(r, 'public.notification_events_id_seq', p))
   from unnest(array['anon', 'authenticated']) r, unnest(array['USAGE', 'SELECT', 'UPDATE']) p),
  false, 'anon und authenticated haben keine Rechte an der Sequenz notification_events_id_seq');

-- Trigger-Funktionen nicht als RPC aufrufbar
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select throws_ok($q$select public.push_event_erfassen()$q$, '42501', null,
  'push_event_erfassen ist fuer authenticated nicht ausfuehrbar');
select throws_ok(
  $q$select public.push_event_eintragen('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', false, 'neu', gen_random_uuid(), 'x')$q$,
  '42501', null, 'push_event_eintragen ist fuer authenticated nicht ausfuehrbar');
select pg_temp.als_anon();
select throws_ok($q$select public.push_event_erfassen()$q$, '42501', null,
  'push_event_erfassen ist fuer anon nicht ausfuehrbar');
select pg_temp.als_postgres();

-- ===========================================================================
-- B. Trigger tasks_push_event
-- ===========================================================================
delete from public.notification_events;

-- B1: b2 legt in der geteilten Liste an -> ein Event "neu"
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
insert into public.tasks (id, list_id, user_id, text)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-0000000000b2', 'Milch');
select pg_temp.als_postgres();
select is(pg_temp.n_ev('10000000-0000-0000-0000-000000000001'), 1, 'Anlegen in geteilter Liste: genau ein Event');
select results_eq(
  $q$select art, actor_id, via_agent, task_id, task_text from public.notification_events$q$,
  $q$values ('neu'::text, '00000000-0000-0000-0000-0000000000b2'::uuid, false,
             '20000000-0000-0000-0000-000000000001'::uuid, 'Milch'::text)$q$,
  'Event: neu, Bearbeiter b2, nicht ueber den Agent, Aufgabentext uebernommen');

-- B2: private Liste -> nichts; Liste mit nur Besitzer-Freigabe -> nichts
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
insert into public.tasks (id, list_id, user_id, text) values
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Privat 1'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'Nur ich 1');
update public.tasks set done = true where id in ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003');
delete from public.tasks where id in ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003');
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'private Liste und Liste mit nur Besitzer-Freigabe: kein Event (anlegen, abhaken, loeschen)');

-- B3: Abhaken, wieder oeffnen, beides zugleich
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set done = true where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select results_eq(
  $q$select art, actor_id from public.notification_events$q$,
  $q$values ('erledigt'::text, '00000000-0000-0000-0000-0000000000a1'::uuid)$q$,
  'done false->true: ein Event "erledigt", Bearbeiter a1');
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set done = false where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select results_eq(
  $q$select art from public.notification_events$q$,
  $q$values ('wieder_offen'::text)$q$,
  'done true->false: ein Event "wieder_offen"');
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set done = true, text = 'Milch 2 l' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select results_eq(
  $q$select art, task_text from public.notification_events$q$,
  $q$values ('erledigt'::text, 'Milch 2 l'::text)$q$,
  'done und text zugleich: ein Event "erledigt" mit neuem Text');
update public.tasks set done = false where id = '20000000-0000-0000-0000-000000000001';  -- als postgres: kein Bearbeiter, kein Agent

-- B4: relevante Aenderungen -> "geaendert"
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set text = 'Hafermilch' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select results_eq($q$select art, task_text from public.notification_events$q$,
  $q$values ('geaendert'::text, 'Hafermilch'::text)$q$, 'text geaendert: Event "geaendert"');

delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set note = 'Bio' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(null, 'geaendert'), 1, 'note geaendert: Event "geaendert"');

delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set due_date = '2026-12-24' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(null, 'geaendert'), 1, 'due_date geaendert: Event "geaendert"');

delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set assigned_to = '00000000-0000-0000-0000-0000000000b2' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(null, 'geaendert'), 1, 'assigned_to geaendert: Event "geaendert"');

delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set priority = 'high' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(null, 'geaendert'), 1, 'priority geaendert: Event "geaendert"');

delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set timeframe = 'akut' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(null, 'geaendert'), 1, 'timeframe geaendert: Event "geaendert"');

-- B5: irrelevante Aenderungen -> nichts
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set position = 7 where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'nur position: kein Event');
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set pinned = true where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'nur pinned: kein Event');
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set abgelegt = true where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'nur abgelegt: kein Event');
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks
  set pinned_by = '00000000-0000-0000-0000-0000000000a1', highlighted = true, emoji = '🥛',
      calendar_event_id = 'ev-1', abgelegt = false, pinned = false, position = 9
  where id = '20000000-0000-0000-0000-000000000001';
update public.tasks set version = version + 1, updated_at = now() where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'pinned_by, highlighted, emoji, calendar_event_id, version, updated_at: kein Event');

-- B6: Massen-Update (Reorder von 50 Zeilen) -> keine Events
insert into public.tasks (list_id, user_id, text, position)
  select '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Reorder ' || g, g
  from generate_series(1, 50) g;
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set position = position + 1 where list_id = '10000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'Reorder von 50 Zeilen per Update: 0 Events');
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
select public.batch_reorder_tasks(
  (select jsonb_agg(jsonb_build_object('id', id, 'position', position + 100))
   from public.tasks where list_id = '10000000-0000-0000-0000-000000000001'));
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'Reorder per RPC batch_reorder_tasks: 0 Events');
delete from public.tasks where text like 'Reorder %';
delete from public.notification_events;

-- B7: Trenner (type = 'divider') -> nichts
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
insert into public.tasks (id, list_id, user_id, text, type)
  values ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-0000000000a1', 'Obst', 'divider');
update public.tasks set text = 'Obst und Gemuese' where id = '20000000-0000-0000-0000-000000000004';
delete from public.tasks where id = '20000000-0000-0000-0000-000000000004';
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'Trenner anlegen, aendern, loeschen: 0 Events');

-- B8: Verschieben
insert into public.tasks (id, list_id, user_id, text) values
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Wanderer 1'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Wanderer 2');
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set list_id = '10000000-0000-0000-0000-000000000003' where id = '20000000-0000-0000-0000-000000000005';
select pg_temp.als_postgres();
select is(pg_temp.n_ev('10000000-0000-0000-0000-000000000001', 'geloescht'), 1, 'Verschieben geteilt -> geteilt: "geloescht" in der alten Liste');
select is(pg_temp.n_ev('10000000-0000-0000-0000-000000000003', 'neu'), 1, 'Verschieben geteilt -> geteilt: "neu" in der neuen Liste');
select is(pg_temp.n_ev(), 2, 'Verschieben geteilt -> geteilt: genau zwei Events');
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
update public.tasks set list_id = '10000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000006';
select pg_temp.als_postgres();
select is(pg_temp.n_ev('10000000-0000-0000-0000-000000000001', 'geloescht'), 1, 'Verschieben geteilt -> privat: "geloescht" in der alten Liste');
select is(pg_temp.n_ev(), 1, 'Verschieben geteilt -> privat: sonst nichts');

-- B9: Loeschen, Textlaenge
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
delete from public.tasks where id = '20000000-0000-0000-0000-000000000005';
select pg_temp.als_postgres();
select results_eq($q$select list_id, art, task_text from public.notification_events$q$,
  $q$values ('10000000-0000-0000-0000-000000000003'::uuid, 'geloescht'::text, 'Wanderer 1'::text)$q$,
  'Loeschen einer Aufgabe: Event "geloescht" in ihrer Liste');
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
insert into public.tasks (list_id, user_id, text)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', repeat('x', 300));
select pg_temp.als_postgres();
select is((select length(task_text) from public.notification_events), 120, 'Aufgabentext im Event auf 120 Zeichen gekuerzt');
delete from public.tasks where text = repeat('x', 300);

-- B10: Dienst (service_role, ohne auth.uid())
delete from public.notification_events;
delete from public.push_config;
select pg_temp.als_service();
select lives_ok($q$insert into public.tasks (id, list_id, user_id, text)
  values ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Agent ohne Config')$q$,
  'Dienst ohne agent_actor: Insert gelingt');
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'Dienst ohne agent_actor: kein Event');

insert into public.push_config (key, value) values ('agent_actor', 'kein-uuid');
select pg_temp.als_service();
select lives_ok($q$insert into public.tasks (id, list_id, user_id, text)
  values ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Agent mit kaputter Config')$q$,
  'Dienst mit kaputtem agent_actor: Insert gelingt trotzdem');
select pg_temp.als_postgres();
select is(pg_temp.n_ev(), 0, 'Dienst mit kaputtem agent_actor: kein Event');

update public.push_config set value = '00000000-0000-0000-0000-0000000000a1' where key = 'agent_actor';
select pg_temp.als_service();
select lives_ok($q$insert into public.tasks (id, list_id, user_id, text)
  values ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Agent mit Config')$q$,
  'Dienst mit agent_actor: Insert gelingt');
select pg_temp.als_postgres();
select results_eq($q$select actor_id, via_agent, art, task_text from public.notification_events$q$,
  $q$values ('00000000-0000-0000-0000-0000000000a1'::uuid, true, 'neu'::text, 'Agent mit Config'::text)$q$,
  'Dienst mit agent_actor: Bearbeiter = agent_actor, via_agent = true');
-- Wartungs-SQL (SQL-Editor, Migration, MCP) laeuft als postgres ohne JWT-Claims:
-- das ist kein Dienstaufruf und zaehlt auch bei gesetztem agent_actor nicht als Agent
delete from public.notification_events;
update public.tasks set text = 'Wartung' where id = '20000000-0000-0000-0000-000000000009';
select is(pg_temp.n_ev(), 0, 'Wartungs-SQL als postgres ohne JWT: kein Event, auch bei gesetztem agent_actor');
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
insert into public.tasks (id, list_id, user_id, text)
  values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Mensch mit Config');
select pg_temp.als_postgres();
select results_eq($q$select actor_id, via_agent from public.notification_events$q$,
  $q$values ('00000000-0000-0000-0000-0000000000b2'::uuid, false)$q$,
  'angemeldete Person bei gesetztem agent_actor: auth.uid() gewinnt, via_agent = false');
delete from public.push_config;
delete from public.notification_events;

-- B11: Liste loeschen (Kaskade ueber alle Aufgaben)
insert into public.tasks (list_id, user_id, text) values
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'Kaskade 1'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b2', 'Kaskade 2'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'Kaskade 3');
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
select lives_ok($q$delete from public.lists where id = '10000000-0000-0000-0000-000000000004'$q$,
  'Liste loeschen (Kaskade ueber Aufgaben und Freigaben) gelingt');
select pg_temp.als_postgres();
select is(pg_temp.n_ev('10000000-0000-0000-0000-000000000004'), 0, 'Liste loeschen: keine Events fuer die geloeschte Liste');
select is((select count(*)::int from public.tasks where list_id = '10000000-0000-0000-0000-000000000004'), 0,
  'Liste loeschen: Aufgaben sind weg');

-- B12: Fehlertoleranz -- der Trigger darf Schreibvorgaenge nie scheitern lassen
alter table public.notification_events rename to notification_events_weg;
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select lives_ok($q$insert into public.tasks (id, list_id, user_id, text)
  values ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Trotz Fehler')$q$,
  'Insert gelingt, obwohl die Warteschlange fehlt');
select lives_ok($q$update public.tasks set text = 'Trotz Fehler 2' where id = '20000000-0000-0000-0000-00000000000b'$q$,
  'Update gelingt, obwohl die Warteschlange fehlt');
select lives_ok($q$delete from public.tasks where id = '20000000-0000-0000-0000-00000000000b'$q$,
  'Delete gelingt, obwohl die Warteschlange fehlt');
select pg_temp.als_postgres();
alter table public.notification_events_weg rename to notification_events;
select is((select count(*)::int from public.tasks where id = '20000000-0000-0000-0000-00000000000b'), 0,
  'Aufgabe wurde trotz Trigger-Fehler wirklich geloescht');
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
insert into public.tasks (id, list_id, user_id, text)
  values ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Wieder heil');
select pg_temp.als_postgres();
select is(pg_temp.n_ev(null, 'neu'), 1, 'nach dem Zurueckbenennen erfasst der Trigger wieder');

-- B13: Wer nicht (mehr) Mitglied der Liste ist, loest keine Meldung aus
-- (die eigene Aufgabe laesst sich nach dem Entzug der Freigabe weiter bearbeiten)
delete from public.notification_events;
insert into public.list_shares (list_id, user_id, role)
  values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', 'editor');
select pg_temp.als('00000000-0000-0000-0000-0000000000c3');
insert into public.tasks (id, list_id, user_id, text)
  values ('20000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', 'Ex-Mitglied');
select pg_temp.als_postgres();
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000c3');
update public.tasks set text = 'Ex-Mitglied 1' where id = '20000000-0000-0000-0000-00000000000d';
select pg_temp.als_postgres();
select is(pg_temp.n_ev('10000000-0000-0000-0000-000000000003', 'geaendert'), 1,
  'Mitglied c3 aendert die eigene Aufgabe: Event "geaendert"');
delete from public.list_shares
  where list_id = '10000000-0000-0000-0000-000000000003' and user_id = '00000000-0000-0000-0000-0000000000c3';
delete from public.notification_events;
select pg_temp.als('00000000-0000-0000-0000-0000000000c3');
update public.tasks set text = 'Ex-Mitglied 2' where id = '20000000-0000-0000-0000-00000000000d';
select pg_temp.als_postgres();
select is((select text from public.tasks where id = '20000000-0000-0000-0000-00000000000d'), 'Ex-Mitglied 2',
  'Gegenprobe: die Aenderung des ehemaligen Mitglieds ging durch');
select is(pg_temp.n_ev(), 0, 'ehemaliges Mitglied c3 aendert die eigene Aufgabe: kein Event');
delete from public.tasks where id = '20000000-0000-0000-0000-00000000000d';
delete from public.notification_events;

-- ===========================================================================
-- C. Rechte und RLS
-- ===========================================================================
-- Warteschlange und Config sind fuer Clients unsichtbar
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select throws_ok($q$select count(*) from public.notification_events$q$, '42501', null, 'authenticated darf notification_events nicht lesen');
select throws_ok($q$select count(*) from public.push_config$q$, '42501', null, 'authenticated darf push_config nicht lesen');
select throws_ok($q$insert into public.push_config (key, value) values ('agent_actor', 'x')$q$, '42501', null, 'authenticated darf push_config nicht schreiben');
select pg_temp.als_anon();
select throws_ok($q$select count(*) from public.notification_events$q$, '42501', null, 'anon darf notification_events nicht lesen');
select throws_ok($q$select count(*) from public.push_config$q$, '42501', null, 'anon darf push_config nicht lesen');
select pg_temp.als_postgres();

-- Abos: push_abo_speichern
delete from public.push_subscriptions;
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/ep-1', pg_temp.kp(), pg_temp.ka(), repeat('g', 150));
select pg_temp.als_postgres();
select is((select user_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-1'),
  '00000000-0000-0000-0000-0000000000b2'::uuid, 'push_abo_speichern: Abo gehoert b2');
select is((select length(geraet) from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-1'),
  100, 'push_abo_speichern: Geraetename auf 100 Zeichen gekuerzt');

-- Endpoint-Uebernahme (Abmelden/Anmelden auf demselben Geraet): dasselbe Geraet liefert
-- denselben Endpoint mit denselben Schluesseln
select pg_temp.als('00000000-0000-0000-0000-0000000000c3');
select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/ep-1', pg_temp.kp(), pg_temp.ka(), 'Android');
select pg_temp.als_postgres();
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-1'), 1,
  'Uebernahme: der Endpoint existiert genau einmal');
select is((select user_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-1'),
  '00000000-0000-0000-0000-0000000000c3'::uuid, 'Uebernahme: Abo gehoert jetzt c3');
select is((select geraet from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-1'),
  'Android', 'Uebernahme: Geraetename ist der neue');
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.push_subscriptions), 0, 'Uebernahme: b2 sieht das Abo nicht mehr');
select pg_temp.als('00000000-0000-0000-0000-0000000000c3');
select is((select count(*)::int from public.push_subscriptions), 1, 'Uebernahme: c3 sieht sein Abo');
-- Wer nur den Endpoint kennt (andere Schluessel), kann ein fremdes Abo nicht uebernehmen
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select throws_ok($q$select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/ep-1', pg_temp.kp('q'), pg_temp.ka('b'), 'Fremd')$q$,
  '42501', null, 'Uebernahme mit fremden Schluesseln wird abgelehnt');
select pg_temp.als_postgres();
select is((select user_id = '00000000-0000-0000-0000-0000000000c3' and p256dh = pg_temp.kp() and auth = pg_temp.ka()
           from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-1'),
  true, 'abgelehnte Uebernahme: Abo gehoert weiter c3, Schluessel unveraendert');
-- Der Besitzer darf die Schluessel seines eigenen Abos auffrischen
select pg_temp.als('00000000-0000-0000-0000-0000000000c3');
select lives_ok($q$select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/ep-1', pg_temp.kp('q'), pg_temp.ka('b'), 'Android')$q$,
  'Besitzer frischt die Schluessel des eigenen Abos auf');
select pg_temp.als_postgres();
select is((select p256dh = pg_temp.kp('q') and auth = pg_temp.ka('b') from public.push_subscriptions
           where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-1'), true, 'aufgefrischte Schluessel sind gespeichert');

-- Eingabepruefung
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select throws_ok($q$select public.push_abo_speichern('http://fcm.googleapis.com/fcm/send/x', pg_temp.kp(), pg_temp.ka(), 'g')$q$, '23514', null, 'Endpoint muss mit https:// beginnen');
select throws_ok($q$select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/' || repeat('x', 1000), pg_temp.kp(), pg_temp.ka(), 'g')$q$, '23514', null, 'Endpoint hoechstens 1000 Zeichen');
select throws_ok($q$select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/y', repeat('k', 201), pg_temp.ka(), 'g')$q$, '23514', null, 'p256dh hoechstens 200 Zeichen');
select throws_ok($q$select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/y', pg_temp.kp(), repeat('a', 101), 'g')$q$, '23514', null, 'auth hoechstens 100 Zeichen');
-- Nur bekannte Push-Dienste (Allowlist); alles andere ist ein Ziel fuer SSRF oder haengende Hosts
select throws_ok(format($q$select public.push_abo_speichern(%L, pg_temp.kp(), pg_temp.ka(), 'g')$q$, e.url),
  '23514', null, 'Endpoint abgelehnt: ' || e.name)
from (values
  ('localhost', 'https://localhost/x'),
  ('Metadaten-IP', 'https://169.254.169.254/latest/meta-data'),
  ('private IP mit Port', 'https://10.0.0.5:8443/internal'),
  ('interner Hostname', 'https://kong:8000/functions/v1/x'),
  ('IPv6-Literal', 'https://[::1]/'),
  ('Userinfo-Trick', 'https://fcm.googleapis.com@evil.example/'),
  ('Zeilenumbruch', E'https://fcm.googleapis.com/x\nrest'),
  ('Leerzeichen', 'https://fcm.googleapis.com/x y'),
  ('Subdomain-Trick', 'https://fcm.googleapis.com.evil.example/x'),
  ('Dienstname im Pfad', 'https://evil.example/fcm.googleapis.com/x'),
  ('Port', 'https://fcm.googleapis.com:8443/x'),
  ('Grossbuchstaben im Schema', 'HTTPS://fcm.googleapis.com/x')
) as e(name, url);
select lives_ok(format($q$select public.push_abo_speichern(%L, pg_temp.kp(), pg_temp.ka(), 'g')$q$, e.url),
  'Endpoint erlaubt: ' || e.name)
from (values
  ('FCM (Chrome, Android)', 'https://fcm.googleapis.com/fcm/send/abc:APA91b-_x'),
  ('Mozilla', 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB'),
  ('Apple', 'https://web.push.apple.com/QXYZ'),
  ('Windows (Edge)', 'https://db5p.notify.windows.com/w/?token=BQYAAAB%2f')
) as e(name, url);
-- Schluessel: base64url ohne Padding, exakte Laenge (p256dh 87, auth 22 Zeichen)
select throws_ok(format($q$select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/k', %s, %s, 'g')$q$, e.p, e.a),
  '23514', null, 'Schluessel abgelehnt: ' || e.name)
from (values
  ('p256dh ein Zeichen', $v$'x'$v$, 'pg_temp.ka()'),
  ('auth ein Zeichen', 'pg_temp.kp()', $v$'y'$v$),
  ('p256dh mit Standard-Base64-Zeichen', $v$'B' || repeat('+', 86)$v$, 'pg_temp.ka()'),
  ('p256dh 86 Zeichen', $v$'B' || repeat('p', 85)$v$, 'pg_temp.ka()'),
  ('p256dh 88 Zeichen', $v$'B' || repeat('p', 87)$v$, 'pg_temp.ka()'),
  ('p256dh mit Padding', $v$'B' || repeat('p', 84) || '=='$v$, 'pg_temp.ka()'),
  ('auth 21 Zeichen', 'pg_temp.kp()', $v$repeat('a', 21)$v$),
  ('auth 23 Zeichen', 'pg_temp.kp()', $v$repeat('a', 23)$v$)
) as e(name, p, a);
select pg_temp.als_postgres();
delete from public.push_subscriptions where endpoint <> 'https://fcm.googleapis.com/fcm/send/ep-1';
select pg_temp.als_anon();
select pg_temp.als_anon();
select throws_ok($q$select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/z', pg_temp.kp(), pg_temp.ka(), 'g')$q$, '42501', null, 'anon darf push_abo_speichern nicht aufrufen');
select pg_temp.als_ohne_sub();
select throws_ok($q$select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/z', pg_temp.kp(), pg_temp.ka(), 'g')$q$, '42501', 'nicht angemeldet', 'ohne auth.uid() wird push_abo_speichern abgelehnt');
select throws_ok($q$select public.push_abo_loeschen('https://fcm.googleapis.com/fcm/send/z')$q$, '42501', 'nicht angemeldet', 'ohne auth.uid() wird push_abo_loeschen abgelehnt');
select pg_temp.als_postgres();

-- Direkter Zugriff auf die Tabelle
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-0000000000b2', 'https://fcm.googleapis.com/fcm/send/ep-2', pg_temp.kp(), pg_temp.ka());
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select throws_ok($q$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-0000000000b2', 'https://fcm.googleapis.com/fcm/send/ep-3', pg_temp.kp(), pg_temp.ka())$q$,
  '42501', null, 'direktes Insert in push_subscriptions ist verboten');
select throws_ok($q$update public.push_subscriptions set geraet = 'x' where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-2'$q$,
  '42501', null, 'direktes Update an push_subscriptions ist verboten');
select pg_temp.als('00000000-0000-0000-0000-0000000000c3');
delete from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-2';
select public.push_abo_loeschen('https://fcm.googleapis.com/fcm/send/ep-2');
select pg_temp.als_postgres();
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-2'), 1,
  'fremdes Abo laesst sich weder per delete noch per push_abo_loeschen entfernen');
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select public.push_abo_loeschen('https://fcm.googleapis.com/fcm/send/ep-2');
select pg_temp.als_postgres();
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-2'), 0,
  'eigenes Abo loescht push_abo_loeschen');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-0000000000b2', 'https://fcm.googleapis.com/fcm/send/ep-4', pg_temp.kp(), pg_temp.ka());
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
delete from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-4';
select pg_temp.als_postgres();
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ep-4'), 0,
  'eigenes Abo laesst sich per delete (RLS) entfernen');

-- Hoechstens 10 Abos je Person: die am laengsten nicht gesehenen fallen weg
delete from public.push_subscriptions;
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, last_seen_at)
  select '00000000-0000-0000-0000-0000000000b2', 'https://fcm.googleapis.com/fcm/send/alt-' || g, pg_temp.kp(), pg_temp.ka(),
         now() - make_interval(days => g)
  from generate_series(1, 10) g;
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select public.push_abo_speichern('https://fcm.googleapis.com/fcm/send/neu-11', pg_temp.kp(), pg_temp.ka(), 'Elftes Geraet');
select pg_temp.als_postgres();
select is((select count(*)::int from public.push_subscriptions where user_id = '00000000-0000-0000-0000-0000000000b2'), 10,
  'nach dem 11. Abo bleiben 10');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/alt-10'), 0,
  'das am laengsten nicht gesehene Abo faellt weg');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/neu-11'), 1,
  'das neue Abo bleibt');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/alt-1'), 1,
  'die neueren Abos bleiben');
delete from public.push_subscriptions;

-- Stummschaltung
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select lives_ok($q$insert into public.list_notification_mutes (user_id, list_id)
  values ('00000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000001')$q$,
  'Mitglied schaltet eine sichtbare Liste stumm');
select is((select count(*)::int from public.list_notification_mutes), 1, 'b2 sieht seine Stummschaltung');
select throws_ok($q$insert into public.list_notification_mutes (user_id, list_id)
  values ('00000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-000000000001')$q$,
  '42501', null, 'b2 kann keine Stummschaltung fuer c3 anlegen');
select throws_ok($q$update public.list_notification_mutes set created_at = now()$q$,
  '42501', null, 'Stummschaltungen sind nicht aenderbar');
select pg_temp.als('00000000-0000-0000-0000-0000000000c3');
select throws_ok($q$insert into public.list_notification_mutes (user_id, list_id)
  values ('00000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-000000000001')$q$,
  '42501', null, 'c3 sieht L1 nicht und kann sie nicht stummschalten');
select is((select count(*)::int from public.list_notification_mutes), 0, 'c3 sieht die Stummschaltung von b2 nicht');
select pg_temp.als('00000000-0000-0000-0000-0000000000d4');
select lives_ok($q$insert into public.list_notification_mutes (user_id, list_id)
  values ('00000000-0000-0000-0000-0000000000d4', '10000000-0000-0000-0000-000000000001')$q$,
  'Betrachter schaltet seine sichtbare Liste stumm');
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
delete from public.list_notification_mutes where list_id = '10000000-0000-0000-0000-000000000001';
select pg_temp.als_postgres();
select is((select user_id from public.list_notification_mutes), '00000000-0000-0000-0000-0000000000d4'::uuid,
  'b2 loescht nur die eigene Stummschaltung, die von d4 bleibt');
delete from public.list_notification_mutes;

-- Versand-RPCs nur fuer den Dienst
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select throws_ok($q$select public.push_buendel_abholen()$q$, '42501', null, 'authenticated darf push_buendel_abholen nicht aufrufen');
select throws_ok($q$select public.push_abo_ergebnis(array['a'], array['b'])$q$, '42501', null, 'authenticated darf push_abo_ergebnis nicht aufrufen');
select pg_temp.als_anon();
select throws_ok($q$select public.push_buendel_abholen()$q$, '42501', null, 'anon darf push_buendel_abholen nicht aufrufen');
select throws_ok($q$select public.push_abo_ergebnis(array['a'], array['b'])$q$, '42501', null, 'anon darf push_abo_ergebnis nicht aufrufen');
select pg_temp.als_service();
select lives_ok($q$select public.push_buendel_abholen()$q$, 'service_role darf push_buendel_abholen aufrufen');
select lives_ok($q$select public.push_abo_ergebnis(array['a'], array['b'])$q$, 'service_role darf push_abo_ergebnis aufrufen');
select pg_temp.als_postgres();

-- ===========================================================================
-- D. push_buendel_abholen
-- ===========================================================================
-- Abos: a1 (Besitzer), b2 (Bearbeiter), c3 (kein Mitglied), d4 (Betrachter)
delete from public.notification_events;
delete from public.push_subscriptions;
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000a1', 'https://fcm.googleapis.com/fcm/send/a1', pg_temp.kp(), pg_temp.ka()),
  ('00000000-0000-0000-0000-0000000000b2', 'https://fcm.googleapis.com/fcm/send/b2', pg_temp.kp(), pg_temp.ka()),
  ('00000000-0000-0000-0000-0000000000c3', 'https://fcm.googleapis.com/fcm/send/c3', pg_temp.kp(), pg_temp.ka()),
  ('00000000-0000-0000-0000-0000000000d4', 'https://fcm.googleapis.com/fcm/send/d4', pg_temp.kp(), pg_temp.ka());

-- D1: Ruhezeit 2 min
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
          '30000000-0000-0000-0000-000000000001', 'Brot', now() - interval '1 minute');
select pg_temp.abholen();
select is((select j from erg), '[]'::jsonb, 'Ruhezeit nicht erreicht (1 min): kein Buendel');
select is(pg_temp.n_ev(), 1, 'Ruhezeit nicht erreicht: Event bleibt liegen');
update public.notification_events set created_at = now() - interval '119 seconds';
select pg_temp.abholen();
select is((select j from erg), '[]'::jsonb, 'knapp vor der Ruhezeit (119 s): kein Buendel');
update public.notification_events set created_at = now() - interval '2 minutes';
select pg_temp.abholen();
select is((select jsonb_array_length(j) from erg), 1, 'genau 2 min Ruhe: ein Buendel faellig');
select is(pg_temp.n_ev(), 0, 'Abholen loescht die Events');
select pg_temp.abholen();
select is((select j from erg), '[]'::jsonb, 'zweiter Aufruf liefert nichts doppelt');

-- D2: Hoechstwartezeit 10 min
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000001', 'Brot', now() - interval '9 minutes 59 seconds'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000002', 'Eier', now() - interval '10 seconds');
select pg_temp.abholen();
select is((select j from erg), '[]'::jsonb, 'aeltestes Event 9:59 alt, juengstes frisch: noch nicht faellig');
update public.notification_events set created_at = now() - interval '11 minutes' where task_text = 'Brot';
select pg_temp.abholen();
select is((select jsonb_array_length(j) from erg), 1, 'aeltestes Event > 10 min alt: faellig trotz frischem jungem Event');
select is(pg_temp.n_ev(), 0, 'Hoechstwartezeit: beide Events abgeholt');

-- D3: veraltet
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
          '30000000-0000-0000-0000-000000000003', 'Alt', now() - interval '2 days');
select pg_temp.abholen();
select is((select j from erg), '[]'::jsonb, 'veraltete Gruppe (2 Tage) wird nicht gesendet');
select is(pg_temp.n_ev(), 0, 'veraltete Gruppe wird verworfen');
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000003', 'Alt', now() - interval '1 day 1 second'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'neu', '30000000-0000-0000-0000-000000000004', 'Frisch', now() - interval '3 minutes');
select pg_temp.abholen();
select is((select jsonb_array_length(j) from erg), 1, 'veraltete Gruppe verworfen, frische Gruppe derselben Liste gesendet');
select is((select j -> 0 ->> 'actor_id' from erg), '00000000-0000-0000-0000-0000000000a1', 'gesendet wird die Gruppe von a1');
select is(pg_temp.n_ev(), 0, 'beide Gruppen sind aus der Warteschlange');
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
          '30000000-0000-0000-0000-000000000003', 'Genau ein Tag', now() - interval '1 day');
select pg_temp.abholen();
select is((select jsonb_array_length(j) from erg), 1, 'genau 1 Tag alt gilt noch nicht als veraltet');

-- D4: Empfaenger
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
          '30000000-0000-0000-0000-000000000001', 'Brot', now() - interval '3 minutes');
select pg_temp.abholen();
select is(
  (select array_agg(e ->> 'user_id' order by e ->> 'user_id') from erg, jsonb_array_elements(j -> 0 -> 'empfaenger') e),
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4'],
  'Empfaenger: Besitzer und Betrachter; nicht der Bearbeiter, nicht der Fremde');
select is(pg_temp.n_ev(), 0, 'Events abgeholt');

insert into public.list_notification_mutes (user_id, list_id)
  values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001');
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
          '30000000-0000-0000-0000-000000000001', 'Brot', now() - interval '3 minutes');
select pg_temp.abholen();
select is(
  (select array_agg(e ->> 'user_id') from erg, jsonb_array_elements(j -> 0 -> 'empfaenger') e),
  array['00000000-0000-0000-0000-0000000000d4'],
  'Stummschaltung: a1 bekommt nichts, d4 weiterhin');

insert into public.list_notification_mutes (user_id, list_id)
  values ('00000000-0000-0000-0000-0000000000d4', '10000000-0000-0000-0000-000000000001');
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
          '30000000-0000-0000-0000-000000000001', 'Brot', now() - interval '3 minutes');
select pg_temp.abholen();
select is((select j from erg), '[]'::jsonb, 'alle Empfaenger stumm: kein Buendel');
select is(pg_temp.n_ev(), 0, 'alle Empfaenger stumm: Events trotzdem abgeholt');
delete from public.list_notification_mutes;

delete from public.push_subscriptions where user_id in
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4');
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu',
          '30000000-0000-0000-0000-000000000001', 'Brot', now() - interval '3 minutes');
select pg_temp.abholen();
select is((select j from erg), '[]'::jsonb, 'Empfaenger ohne Abo: kein Buendel');
select is(pg_temp.n_ev(), 0, 'Empfaenger ohne Abo: Events trotzdem abgeholt');

-- D5: Buendelinhalt (a1 mit zwei Geraeten, d4 mit einem; Events bewusst in falscher Reihenfolge)
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000a1', 'https://fcm.googleapis.com/fcm/send/a1', pg_temp.kp(), pg_temp.ka()),
  ('00000000-0000-0000-0000-0000000000a1', 'https://fcm.googleapis.com/fcm/send/a1-tablet', pg_temp.kp('t'), pg_temp.ka('t')),
  ('00000000-0000-0000-0000-0000000000d4', 'https://fcm.googleapis.com/fcm/send/d4', pg_temp.kp(), pg_temp.ka());
insert into public.notification_events (list_id, actor_id, via_agent, art, task_id, task_text, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', false, 'erledigt', '30000000-0000-0000-0000-000000000002', 'Brot', now() - interval '5 minutes'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', false, 'neu', '30000000-0000-0000-0000-000000000001', 'Milch', now() - interval '6 minutes');
select pg_temp.abholen();
select is((select jsonb_array_length(j) from erg), 1, 'Buendelinhalt: ein Buendel');
select is((select j -> 0 ->> 'list_id' from erg), '10000000-0000-0000-0000-000000000001', 'Buendelinhalt: list_id');
select is((select j -> 0 ->> 'list_title' from erg), 'Einkaufen', 'Buendelinhalt: list_title');
select is((select j -> 0 ->> 'list_kind' from erg), 'einkauf', 'Buendelinhalt: list_kind');
select is((select j -> 0 ->> 'actor_id' from erg), '00000000-0000-0000-0000-0000000000b2', 'Buendelinhalt: actor_id');
select is((select j -> 0 ->> 'actor_name' from erg), 'Mitglied', 'Buendelinhalt: actor_name aus display_name');
select is((select (j -> 0 ->> 'via_agent')::boolean from erg), false, 'Buendelinhalt: via_agent false ohne Agent-Event');
select is((select array_agg(e ->> 'text' order by ord) from erg, jsonb_array_elements(j -> 0 -> 'events') with ordinality as t(e, ord)),
  array['Milch', 'Brot'], 'Buendelinhalt: Events aufsteigend nach Zeit');
select is((select (j -> 0 -> 'events' -> 0) ?& array['task_id', 'art', 'text', 'at'] from erg), true,
  'Buendelinhalt: Event hat task_id, art, text, at');
select is((select count(*)::int from erg, jsonb_array_elements(j -> 0 -> 'empfaenger') e, jsonb_array_elements(e -> 'abos') a
            where e ->> 'user_id' = '00000000-0000-0000-0000-0000000000a1'), 2,
  'Buendelinhalt: beide Geraete von a1 sind aufgefuehrt');
select is((select (a ?& array['endpoint', 'p256dh', 'auth']) from erg, jsonb_array_elements(j -> 0 -> 'empfaenger') e, jsonb_array_elements(e -> 'abos') a
            where a ->> 'endpoint' = 'https://fcm.googleapis.com/fcm/send/d4'), true,
  'Buendelinhalt: Abo hat endpoint, p256dh, auth');

-- via_agent, wenn irgendein Event der Gruppe es ist
insert into public.notification_events (list_id, actor_id, via_agent, art, task_id, task_text, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', false, 'neu', '30000000-0000-0000-0000-000000000001', 'Eins', now() - interval '5 minutes'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', true, 'neu', '30000000-0000-0000-0000-000000000002', 'Zwei', now() - interval '4 minutes');
select pg_temp.abholen();
select is((select (j -> 0 ->> 'via_agent')::boolean from erg), true, 'via_agent ist true, wenn irgendein Event es ist');

-- Anzeigename: username, wenn display_name leer; "Jemand", wenn beides fehlt
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d4', 'neu', '30000000-0000-0000-0000-000000000001', 'x', now() - interval '3 minutes');
select pg_temp.abholen();
select is((select j -> 0 ->> 'actor_name' from erg), 'dora', 'actor_name: leerer display_name -> username');
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', 'neu', '30000000-0000-0000-0000-000000000001', 'x', now() - interval '3 minutes');
select pg_temp.abholen();
select is((select j -> 0 ->> 'actor_name' from erg), 'Jemand', 'actor_name: weder display_name noch username -> Jemand');

-- D6: mehrere Gruppen, nur die faelligen werden abgeholt
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000001', 'faellig', now() - interval '3 minutes'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000002', 'noch nicht', now() - interval '20 seconds');
select pg_temp.abholen();
select is((select jsonb_array_length(j) from erg), 1, 'zwei Gruppen, eine faellig: ein Buendel');
select is((select j -> 0 ->> 'list_id' from erg), '10000000-0000-0000-0000-000000000001', 'das faellige Buendel ist das der alten Gruppe');
select is(pg_temp.n_ev(), 1, 'die noch nicht faellige Gruppe bleibt liegen');
update public.notification_events set created_at = now() - interval '3 minutes';
select pg_temp.abholen();
select is((select j -> 0 ->> 'list_title' from erg), 'Familie', 'spaeter wird auch die zweite Gruppe abgeholt');

-- D7: hoechstens 200 Events je Gruppe, aeltere werden trotzdem geloescht
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
  select '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', gen_random_uuid(), 'e' || g,
         now() - interval '1 hour' + make_interval(secs => g)
  from generate_series(1, 205) g;
select pg_temp.abholen();
select is((select jsonb_array_length(j -> 0 -> 'events') from erg), 200, 'hoechstens 200 Events je Gruppe');
select is((select j -> 0 -> 'events' -> 0 ->> 'text' from erg), 'e6', 'es bleiben die 200 neuesten (aelteste fallen heraus)');
select is((select j -> 0 -> 'events' -> 199 ->> 'text' from erg), 'e205', 'aufsteigend sortiert bis zum neuesten');
select is(pg_temp.n_ev(), 0, 'auch die abgeschnittenen aelteren Events sind geloescht');

-- D9: Aufbewahrung gilt je Event, nicht je Gruppe: ein altes Event faehrt nicht in einer
-- frischen Gruppe mit (sein Text laege sonst Tage in der Tabelle und stuende in der Meldung)
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000001', 'Alt vor 5 Tagen', now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000002', 'Frisch', now() - interval '3 minutes');
select pg_temp.abholen();
select is((select jsonb_array_length(j) from erg), 1, 'altes und frisches Event derselben Gruppe: ein Buendel');
select is((select jsonb_array_length(j -> 0 -> 'events') from erg), 1, 'das veraltete Event kommt nicht mehr im Buendel mit');
select is((select j -> 0 -> 'events' -> 0 ->> 'text' from erg), 'Frisch', 'im Buendel steht nur das frische Event');
select is(pg_temp.n_ev(), 0, 'altes und frisches Event sind aus der Warteschlange');

-- Ein altes Event darf eine frische Gruppe nicht ueber die Hoechstwartezeit faellig machen
insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000001', 'Alt vor 3 Tagen', now() - interval '3 days'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'neu', '30000000-0000-0000-0000-000000000002', 'Neu', now() - interval '30 seconds');
select pg_temp.abholen();
select is((select j from erg), '[]'::jsonb, 'altes Event + frisches Event (30 s): noch nicht faellig');
select is((select array_agg(task_text) from public.notification_events), array['Neu'],
  'das alte Event ist verworfen, nur das frische bleibt liegen');
delete from public.notification_events;

-- D11: Laufzeit waechst linear mit der Gruppenzahl (eine Gruppe = Liste + Bearbeiter).
-- Jedes Konto kann beliebig viele Listen anlegen und freigeben; ein quadratischer Lauf
-- wuerde die Warteschlange fuer alle blockieren (Zeitgrenze am Datenbankzugang).
insert into public.lists (id, user_id, title)
  select ('40000000-0000-0000-0000-' || lpad(to_hex(g), 12, '0'))::uuid, '00000000-0000-0000-0000-0000000000a1', 'Perf ' || g
  from generate_series(1, 10000) g;
insert into public.list_shares (list_id, user_id, role)
  select id, '00000000-0000-0000-0000-0000000000b2', 'editor' from public.lists where title like 'Perf %';
create temp table perf_zeit (sek numeric);
-- Dreimal messen, der schnellste Lauf zaehlt: ein kalter Cache oder ein Lastspitzen-Lauf
-- (Docker startet nebenher Container) soll den Test nicht kippen, ein quadratischer Plan
-- ist bei jedem Lauf langsam.
do $$
declare
  t0 timestamptz;
  d numeric;
  beste numeric;
begin
  for i in 1..3 loop
    insert into public.notification_events (list_id, actor_id, art, task_id, task_text, created_at)
      select id, '00000000-0000-0000-0000-0000000000b2', 'neu', gen_random_uuid(), 'x', now() - interval '3 minutes'
      from public.lists where title like 'Perf %';
    t0 := clock_timestamp();
    perform pg_temp.abholen();
    d := extract(epoch from clock_timestamp() - t0);
    beste := least(coalesce(beste, d), d);
  end loop;
  insert into perf_zeit values (beste);
end $$;
select is((select jsonb_array_length(j) from erg), 10000, '10000 Gruppen: ein Buendel je Gruppe');
select cmp_ok((select sek from perf_zeit), '<', 2.0, 'Abholen von 10000 Gruppen dauert unter 2 s (schnellster von 3 Laeufen; linear, nicht quadratisch)');
delete from public.lists where title like 'Perf %';

-- D8: Aufgabe in der Liste angelegt und geloescht -- Bündel enthaelt beide Events (Verdichtung macht die Function)
-- (kein eigener Test noetig: die DB liefert die Rohereignisse, die Verdichtung ist Sache der Edge Function)

-- ===========================================================================
-- E. push_abo_ergebnis
-- ===========================================================================
delete from public.push_subscriptions;
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000a1', 'https://fcm.googleapis.com/fcm/send/ok', pg_temp.kp(), pg_temp.ka()),
  ('00000000-0000-0000-0000-0000000000a1', 'https://fcm.googleapis.com/fcm/send/weg', pg_temp.kp(), pg_temp.ka()),
  ('00000000-0000-0000-0000-0000000000a1', 'https://fcm.googleapis.com/fcm/send/unberuehrt', pg_temp.kp(), pg_temp.ka());
select pg_temp.als_service();
select public.push_abo_ergebnis(array['https://fcm.googleapis.com/fcm/send/ok'], array['https://fcm.googleapis.com/fcm/send/weg']);
select pg_temp.als_postgres();
select isnt((select last_ok_at from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/ok'), null,
  'push_abo_ergebnis: last_ok_at fuer "ok" gesetzt');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/weg'), 0,
  'push_abo_ergebnis: Abo in "weg" geloescht');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/unberuehrt' and last_ok_at is null), 1,
  'push_abo_ergebnis: andere Abos bleiben unberuehrt');
select pg_temp.als_service();
select lives_ok($q$select public.push_abo_ergebnis(null, null)$q$, 'push_abo_ergebnis: NULL-Arrays sind erlaubt');
select pg_temp.als_postgres();

-- ===========================================================================
-- F. Spaltenumbau an tasks: der Trigger darf Schreibvorgaenge nie scheitern lassen
--    (Spec Regel 1: der ganze Rumpf liegt im Ausnahmeblock, auch die Vorpruefung)
-- ===========================================================================
alter table public.tasks drop column timeframe;
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
select lives_ok($q$update public.tasks set position = 5 where id = '20000000-0000-0000-0000-000000000001'$q$,
  'Update gelingt, auch wenn der Trigger eine entfernte Spalte liest');
select lives_ok($q$update public.tasks set text = 'Nach Spaltenumbau' where id = '20000000-0000-0000-0000-000000000001'$q$,
  'relevantes Update gelingt, auch wenn der Trigger eine entfernte Spalte liest');
select pg_temp.als_postgres();

select * from finish();
rollback;
