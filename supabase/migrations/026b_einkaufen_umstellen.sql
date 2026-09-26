-- ==========================================
-- 026b: Liste „Einkaufen" auf den Einkaufs-Modus umstellen
--
-- ERST NACH DEM DEPLOY des Codes anwenden, der Einkaufslisten darstellen
-- kann — die alte Fassung zeigt Trenner mit Unteraufgaben nicht an.
-- „Einkaufen" ist heute mit Aufgaben als Kategorien gebaut (Gemuese,
-- Kuehlabteilung … mit den Artikeln als Unteraufgaben). ALLE Eintraege der
-- obersten Ebene werden Kategorien (auch die derzeit leeren: Obst, Gewuerze,
-- Snacks), bereits abgehakte Artikel gelten als „zuletzt gekauft".
-- Laeuft ohne auth.uid() — die Trigger aus 024 greifen nicht.
-- Wiederholbar: bereits umgestellte Listen (kind = 'einkauf') bleiben unberuehrt.
--
-- Absicherung gegen lose Artikel: n8n/Telegram legen Artikel als Aufgabe
-- der OBERSTEN Ebene an. Stuende zwischen Pruefung und Anwendung so einer
-- in der Liste, wuerde er hier zur Kategorie. Darum bricht die Migration
-- ab, wenn die oberste Ebene nicht aus genau den erwarteten 12 Kategorien
-- besteht — dann den Eindringling von Hand unter seine Kategorie haengen
-- (oder die Zahl nach Pruefung anpassen) und erneut anwenden.
--
-- Pins: eine Kategorie ist kein Eintrag der Pinnwand. Die App zeigt Trenner
-- dort ohnehin nicht, „Alle loesen" zaehlte sie aber mit (Toast meldete
-- mehr Pins, als zu sehen waren). Darum faellt ein Pin beim Umstellen weg.
-- ==========================================
do $$
declare
  l record;
  n integer;
  erwartet constant integer := 12;
begin
  for l in select id from public.lists where title = 'Einkaufen' and kind = 'aufgaben' loop
    select count(*) into n
      from public.tasks
     where list_id = l.id and parent_id is null and type = 'task';
    if n <> erwartet then
      raise exception '026b: „Einkaufen" (%) hat % Eintraege der obersten Ebene, erwartet %: %',
        l.id, n, erwartet,
        (select string_agg(text, ', ' order by position)
           from public.tasks
          where list_id = l.id and parent_id is null and type = 'task');
    end if;

    update public.tasks
       set type = 'divider', done = false, pinned = false, pinned_by = null
     where list_id = l.id and parent_id is null and type = 'task';

    update public.tasks
       set abgelegt = true
     where list_id = l.id and parent_id is not null and done;

    update public.lists set kind = 'einkauf' where id = l.id;
  end loop;
end $$;
