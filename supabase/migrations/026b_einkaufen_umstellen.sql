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
-- ==========================================
do $$
declare
  l record;
begin
  for l in select id from public.lists where title = 'Einkaufen' and kind = 'aufgaben' loop
    update public.tasks
       set type = 'divider', done = false
     where list_id = l.id and parent_id is null and type = 'task';

    update public.tasks
       set abgelegt = true
     where list_id = l.id and parent_id is not null and done;

    update public.lists set kind = 'einkauf' where id = l.id;
  end loop;
end $$;
