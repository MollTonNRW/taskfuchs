-- pgTAP: Erinnerungen an Fristen (Migration 028)
-- Spec: docs/superpowers/specs/2026-11-16-erinnerungen-fristen-design.md
-- Ausfuehren: supabase test db  (lokale Supabase, Migrationen bis 028 angewendet)
--
-- Alle Personen, Listen und Endpoints sind fiktiv. Der Test laeuft in einer Transaktion und
-- wird zurueckgerollt. Zeitpunkte sind fest (November = MEZ, UTC+1):
--   2026-11-16 06:59 UTC = 07:59 Berlin, 07:00 UTC = 08:00 Berlin, 08:30 UTC = 09:30 Berlin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

-- ---------------------------------------------------------------------------
-- Testpersonen
--   a1 Besitzer (Standard 08:00), b2 Mitglied der geteilten Liste, c3 ohne Abo,
--   e5 Erinnerung aus, f6 Uhrzeit 09:30
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'besitzer@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'mitglied@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'ohneabo@test.local'),
  ('00000000-0000-0000-0000-0000000000e5', 'aus@test.local'),
  ('00000000-0000-0000-0000-0000000000f6', 'spaet@test.local');

insert into public.lists (id, user_id, title, kind) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Privat', 'aufgaben'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Familie', 'aufgaben'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'Einkaufen', 'einkauf'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e5', 'Aus', 'aufgaben'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000f6', 'Spaet', 'aufgaben'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000c3', 'Ohne Abo', 'aufgaben');
insert into public.list_shares (list_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'editor');

-- Gueltige Beispiel-Schluessel (base64url ohne Padding): p256dh 87, auth 22 Zeichen
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000a1', 'https://fcm.googleapis.com/fcm/send/frist-a1', 'B' || repeat('p', 86), repeat('a', 22)),
  ('00000000-0000-0000-0000-0000000000b2', 'https://fcm.googleapis.com/fcm/send/frist-b2', 'B' || repeat('q', 86), repeat('b', 22)),
  ('00000000-0000-0000-0000-0000000000e5', 'https://fcm.googleapis.com/fcm/send/frist-e5', 'B' || repeat('r', 86), repeat('c', 22)),
  ('00000000-0000-0000-0000-0000000000f6', 'https://fcm.googleapis.com/fcm/send/frist-f6', 'B' || repeat('s', 86), repeat('d', 22));

insert into public.tasks (list_id, user_id, text, due_date, done, type, abgelegt, assigned_to) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Steuer', '2026-11-16', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Arzt', '2026-11-10', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Uralt', '2026-09-01', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Morgen', '2026-11-17', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Uebermorgen', '2026-11-18', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Erledigt', '2026-11-16', true, 'task', false, null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Abgelegt', '2026-11-16', false, 'task', true, null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Trenner', '2026-11-16', false, 'divider', false, null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Ohne Frist', null, false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Fuer b2', '2026-11-16', false, 'task', false, '00000000-0000-0000-0000-0000000000b2'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'Geteilt offen', '2026-11-16', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'Milch', '2026-11-16', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000e5', 'Aus heute', '2026-11-16', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000f6', 'Spaet heute', '2026-11-16', false, 'task', false, null),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000c3', 'Ohne Abo heute', '2026-11-16', false, 'task', false, null),
  -- f6 zugewiesen, sieht die Liste aber nicht (Freigabe entzogen): erinnert wird der Besitzer
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Verwaist', '2026-11-16', false, 'task', false, '00000000-0000-0000-0000-0000000000f6');
-- Unteraufgaben zaehlen nicht (wie die Ansicht „Dringend“)
insert into public.tasks (list_id, user_id, text, due_date, parent_id)
select list_id, user_id, 'Unteraufgabe', '2026-11-16', id from public.tasks where text = 'Steuer';

-- ---------------------------------------------------------------------------
-- Hilfen
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

create temp table erg (j jsonb);
grant all on table erg to public;
create or replace function pg_temp.abholen(p_jetzt timestamptz) returns void language plpgsql as $$
begin
  perform pg_temp.als_service();
  delete from erg;
  insert into erg select public.push_fristen_abholen(p_jetzt);
  perform pg_temp.als_postgres();
end $$;
-- Eintrag einer Person aus dem letzten Abholen
create or replace function pg_temp.fuer(p uuid) returns jsonb language sql as $$
  select e from erg, jsonb_array_elements(erg.j->'tage') e where e->>'user_id' = p::text $$;
-- Termin-Meldungen des letzten Abholens als „Text@Frist“
create or replace function pg_temp.termine() returns text[] language sql as $$
  select coalesce(array_agg((e->>'text') || '@' || (e->>'due_date') order by o), '{}')
  from erg, jsonb_array_elements(erg.j->'termine') with ordinality as x(e, o) $$;
create or replace function pg_temp.texte(p uuid) returns text[] language sql as $$
  select array_agg(a->>'text' order by o) from jsonb_array_elements(pg_temp.fuer(p)->'aufgaben') with ordinality as x(a, o) $$;

-- ---------------------------------------------------------------------------
-- 1. Tabellen, RLS, Rechte
-- ---------------------------------------------------------------------------
select has_table('public', 'push_fristen_einstellungen', 'Tabelle push_fristen_einstellungen');
select has_table('public', 'push_fristen_versand', 'Tabelle push_fristen_versand');
select has_table('public', 'push_termin_versand', 'Tabelle push_termin_versand');
select is((select relrowsecurity from pg_class where oid = 'public.push_termin_versand'::regclass), true, 'RLS an: Termin-Versand');
select is((select relrowsecurity from pg_class where oid = 'public.push_fristen_einstellungen'::regclass), true, 'RLS an: Einstellungen');
select is((select relrowsecurity from pg_class where oid = 'public.push_fristen_versand'::regclass), true, 'RLS an: Versand');
select is(has_table_privilege('anon', 'public.push_fristen_einstellungen', 'select'), false, 'anon liest keine Einstellungen');
select is(has_table_privilege('authenticated', 'public.push_fristen_einstellungen', 'select'), true, 'authenticated liest (eigene) Einstellungen');
select is(has_table_privilege('authenticated', 'public.push_fristen_einstellungen', 'insert,update,delete'), false, 'authenticated schreibt nicht direkt');
select is(has_table_privilege('authenticated', 'public.push_fristen_versand', 'select,insert,update,delete'), false, 'Versandprotokoll fuer Clients unsichtbar');
select is(has_table_privilege('authenticated', 'public.push_termin_versand', 'select,insert,update,delete'), false, 'Termin-Protokoll fuer Clients unsichtbar');
select is(has_table_privilege('authenticated', 'public.push_fristen_aufgaben', 'select'), false, 'View fuer Clients gesperrt');
select is(has_function_privilege('authenticated', 'public.tf_frist_tag(text)', 'execute'), false, 'Hilfsfunktion fuer Clients gesperrt');
select is(public.tf_frist_tag('2026-02-30'), null, 'ungueltiges Datum ergibt NULL statt Fehler');
select is(public.tf_frist_zeit('2026-11-19T09:00'), '2026-11-19 08:00:00+00'::timestamptz, 'Uhrzeit gilt in Berlin (MEZ)');
select is(has_function_privilege('anon', 'public.push_fristen_einstellen(boolean, time, boolean, integer)', 'execute'), false, 'anon: einstellen gesperrt');
select is(has_function_privilege('authenticated', 'public.push_fristen_einstellen(boolean, time, boolean, integer)', 'execute'), true, 'authenticated: einstellen erlaubt');
select is(has_function_privilege('authenticated', 'public.push_fristen_faellig(timestamptz)', 'execute'), false, 'authenticated: faellig gesperrt');
select is(has_function_privilege('authenticated', 'public.push_fristen_abholen(timestamptz)', 'execute'), false, 'authenticated: abholen gesperrt');
select is(has_function_privilege('service_role', 'public.push_fristen_abholen(timestamptz)', 'execute'), true, 'service_role: abholen erlaubt');

-- ---------------------------------------------------------------------------
-- 2. Einstellungen speichern
-- ---------------------------------------------------------------------------
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.push_fristen_einstellen(true, '07:30', true) $$, 'eigene Einstellung speichern');
select lives_ok($$ select public.push_fristen_einstellen(true, '08:00', false) $$, 'eigene Einstellung aendern');
select throws_ok($$ select public.push_fristen_einstellen(true, '07:15', false) $$, '23514', null, 'nur Halbstundentakt');
select throws_ok($$ select public.push_fristen_einstellen(true, '23:00', false) $$, '23514', null, 'nicht nach 22:00');
select throws_ok($$ select public.push_fristen_einstellen(null, '08:00', false) $$, '22023', null, 'NULL abgelehnt');
select throws_ok($$ select public.push_fristen_einstellen(true, '08:00', false, 45) $$, '23514', null, 'Vorlauf nur aus der Liste');
select is((select count(*)::int from public.push_fristen_einstellungen), 1, 'Person sieht nur die eigene Zeile');
select pg_temp.als('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.push_fristen_einstellungen), 0, 'andere sehen sie nicht');
select pg_temp.als_ohne_sub();
select throws_ok($$ select public.push_fristen_einstellen(true, '08:00', false) $$, '42501', null, 'ohne Anmeldung abgelehnt');
select pg_temp.als('00000000-0000-0000-0000-0000000000e5');
select public.push_fristen_einstellen(false, '08:00', false);
select pg_temp.als('00000000-0000-0000-0000-0000000000f6');
select public.push_fristen_einstellen(true, '09:30', false);
select pg_temp.als_postgres();
select is((select (aktiv, uhrzeit, vortag, vorlauf)::text from public.push_fristen_einstellungen where user_id = '00000000-0000-0000-0000-0000000000a1'),
  '(t,08:00:00,f,30)', 'Werte der letzten Aenderung (Vorlauf Standard 30)');

-- ---------------------------------------------------------------------------
-- 3. Faellig? (Uhrzeit, Zeitzone)
-- ---------------------------------------------------------------------------
select is(public.push_fristen_faellig('2026-11-16 06:59:00+00'), false, '07:59 Berlin: noch niemand dran');
select is(public.push_fristen_faellig('2026-11-16 07:00:00+00'), true, '08:00 Berlin: Standard-Uhrzeit erreicht');

-- ---------------------------------------------------------------------------
-- 4. Abholen um 08:00 Berlin
-- ---------------------------------------------------------------------------
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.push_fristen_abholen('2026-11-16 07:00:00+00') $$, '42501', null, 'Personen duerfen nicht abholen');
select pg_temp.als_postgres();
select pg_temp.abholen('2026-11-16 07:00:00+00');
select is((select jsonb_array_length(j->'tage') from erg), 2, 'zwei Personen mit faelligen Aufgaben (a1, b2)');
select is(pg_temp.texte('00000000-0000-0000-0000-0000000000a1'), array['Arzt', 'Geteilt offen', 'Steuer', 'Verwaist'],
  'a1: heute und ueberfaellig, eigene Listen, Unzugewiesenes der geteilten Liste und verwaiste Zuweisung; ohne Unteraufgabe');
select is((pg_temp.fuer('00000000-0000-0000-0000-0000000000a1')->>'anzahl')::int, 4, 'a1: Gesamtzahl 4');
select is(pg_temp.texte('00000000-0000-0000-0000-0000000000b2'), array['Fuer b2'], 'b2: nur die ihr zugewiesene Aufgabe');
select is(pg_temp.fuer('00000000-0000-0000-0000-0000000000a1')->>'heute', '2026-11-16', 'Kalendertag Berlin');
select is(jsonb_array_length(pg_temp.fuer('00000000-0000-0000-0000-0000000000a1')->'abos'), 1, 'a1: ein Abo');
select is(pg_temp.fuer('00000000-0000-0000-0000-0000000000a1')->'abos'->0->>'endpoint', 'https://fcm.googleapis.com/fcm/send/frist-a1', 'a1: richtiges Abo');
select is(pg_temp.fuer('00000000-0000-0000-0000-0000000000e5'), null, 'Erinnerung aus: nichts');
select is(pg_temp.fuer('00000000-0000-0000-0000-0000000000f6'), null, '09:30 noch nicht erreicht: nichts');
select is((select array_agg(user_id::text || ':' || aufgaben order by user_id) from public.push_fristen_versand),
  array['00000000-0000-0000-0000-0000000000a1:4', '00000000-0000-0000-0000-0000000000b2:1'], 'Versand vermerkt (mit Anzahl)');

select pg_temp.abholen('2026-11-16 07:05:00+00');
select is((select j->'tage' from erg), '[]'::jsonb, 'kein zweites Mal am selben Tag');
select is(public.push_fristen_faellig('2026-11-16 07:05:00+00'), false, 'faellig danach aus');

-- f6 um 09:30
select is(public.push_fristen_faellig('2026-11-16 08:30:00+00'), true, '09:30 Berlin: f6 dran');
select pg_temp.abholen('2026-11-16 08:30:00+00');
select is(pg_temp.texte('00000000-0000-0000-0000-0000000000f6'), array['Spaet heute'], 'f6 zur eigenen Uhrzeit, ohne die Aufgabe einer Liste, die sie nicht sieht');

-- ---------------------------------------------------------------------------
-- 5. Naechster Tag: Vortag, Obergrenze, Aufraeumen
-- ---------------------------------------------------------------------------
select pg_temp.als('00000000-0000-0000-0000-0000000000a1');
select public.push_fristen_einstellen(true, '08:00', true);
select pg_temp.als_postgres();
insert into public.tasks (list_id, user_id, text, due_date, assigned_to)
select '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Viele ' || lpad(i::text, 2, '0'),
       '2026-11-17', '00000000-0000-0000-0000-0000000000b2'
from generate_series(1, 24) i;
insert into public.push_fristen_versand (user_id, tag) values ('00000000-0000-0000-0000-0000000000a1', '2026-10-01');

select pg_temp.abholen('2026-11-17 07:00:00+00');
select is(pg_temp.texte('00000000-0000-0000-0000-0000000000a1'), array['Arzt', 'Geteilt offen', 'Steuer', 'Verwaist', 'Morgen', 'Uebermorgen'],
  'a1 mit Vortag: auch morgen faellige Aufgaben');
select is((pg_temp.fuer('00000000-0000-0000-0000-0000000000b2')->>'anzahl')::int, 25, 'b2: Gesamtzahl zaehlt alle');
select is(jsonb_array_length(pg_temp.fuer('00000000-0000-0000-0000-0000000000b2')->'aufgaben'), 20, 'b2: hoechstens 20 Aufgaben in der Meldung');
select is((select count(*)::int from public.push_fristen_versand where tag = '2026-10-01'), 0, 'altes Protokoll aufgeraeumt');

-- ---------------------------------------------------------------------------
-- 6. Termine (Aufgaben mit Uhrzeit), kaputte Fristwerte
-- ---------------------------------------------------------------------------
insert into public.tasks (list_id, user_id, text, due_date) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Kinderarzt', '2026-11-19T09:00'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Kaputt 1', '2026-02-30'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Kaputt 2', 'morgen'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Kaputt 3', '2026-11-19T25:99'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'Einkauf mit Zeit', '2026-11-19T09:00');
-- 08:29 Berlin: noch nicht (30 Min. vor 09:00 ist 08:30); Tagesmeldungen vom 19. vorher abholen,
-- damit nur noch Termine faellig sein koennen
select pg_temp.abholen('2026-11-19 07:00:00+00');
select is(pg_temp.termine(), '{}'::text[], '08:00 Berlin: Termin um 09:00 noch nicht dran');
select lives_ok($$ select public.push_fristen_abholen('2026-11-19 07:01:00+00') $$, 'kaputte Fristwerte brechen den Lauf nicht ab');
select is(public.push_fristen_faellig('2026-11-19 07:29:00+00'), false, '08:29 Berlin: nichts faellig');
select is(public.push_fristen_faellig('2026-11-19 07:30:00+00'), true, '08:30 Berlin: Termin-Erinnerung faellig');
select pg_temp.abholen('2026-11-19 07:30:00+00');
select is(pg_temp.termine(), array['Kinderarzt@2026-11-19T09:00'], '30 Minuten vorher, ohne Einkaufsliste');
select is((select (j->'termine'->0->>'vorlauf')::int from erg), 30, 'Vorlauf in der Meldung');
select is((select (j->'termine'->0->>'minuten_bis')::int from erg), 30, 'Minuten bis zur Frist in der Meldung');
select pg_temp.abholen('2026-11-19 07:40:00+00');
select is(pg_temp.termine(), '{}'::text[], 'Termin nur einmal');
update public.tasks set due_date = '2026-11-19T10:00' where text = 'Kinderarzt';
select pg_temp.abholen('2026-11-19 08:30:00+00');
select is(pg_temp.termine(), array['Kinderarzt@2026-11-19T10:00'], 'verschoben: neue Erinnerung');
insert into public.tasks (list_id, user_id, text, due_date) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Laengst vorbei', '2026-11-19T05:00');
select pg_temp.abholen('2026-11-19 08:31:00+00');
select is(pg_temp.termine(), '{}'::text[], 'mehr als 2 Stunden vorbei: nicht nachholen');

-- ---------------------------------------------------------------------------
-- 7. Tagesmeldung nur drei Stunden ab der eigenen Uhrzeit nachholen
-- ---------------------------------------------------------------------------
select pg_temp.abholen('2026-11-20 09:59:00+00');
select isnt(pg_temp.fuer('00000000-0000-0000-0000-0000000000a1'), null, '10:59 Berlin: a1 (08:00) wird noch nachgeholt');
select pg_temp.abholen('2026-11-21 10:01:00+00');
select is(pg_temp.fuer('00000000-0000-0000-0000-0000000000a1'), null, '11:01 Berlin: a1 (08:00) nicht mehr (Ausfall, spaet angemeldet)');
select is(public.push_fristen_faellig('2026-11-21 11:31:00+00'), false, '12:31 Berlin: niemand mehr im Zeitfenster');

select * from finish();
rollback;
