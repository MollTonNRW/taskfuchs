-- ==========================================
-- 026b: Liste „Einkaufen" auf den Einkaufs-Modus umstellen
--
-- ERST NACH DEM DEPLOY des Codes anwenden, der Einkaufslisten darstellen
-- kann — die alte Fassung zeigt Trenner mit Unteraufgaben nicht an.
-- „Einkaufen" ist heute mit Aufgaben als Kategorien gebaut (Gemuese,
-- Kuehlabteilung … mit den Artikeln als Unteraufgaben). Die zwoelf
-- Kategorie-Eintraege werden Kategorien (auch die derzeit leeren: Obst,
-- Gewuerze, Snacks), bereits abgehakte Artikel gelten als „zuletzt gekauft".
-- Laeuft ohne auth.uid() — die Trigger aus 024 greifen nicht.
-- Wiederholbar: bereits umgestellte Listen (kind = 'einkauf') bleiben unberuehrt.
--
-- Lose Artikel: n8n/Telegram legen Artikel als Aufgabe der OBERSTEN Ebene
-- an (am 26.09. standen so „2x Spicy Sauce" und „Energy" in der Liste).
-- Darum werden nur die zwoelf bekannten Kategorienamen zu Trennern; alle
-- anderen Zeilen der obersten Ebene bleiben Artikel und werden von der App
-- beim Oeffnen per Stichwort einsortiert (sonst Abschnitt „Ohne Kategorie").
-- Fehlt eine der zwoelf Kategorien, bricht die Migration ab, ohne etwas zu
-- aendern.
--
-- Pins: eine Kategorie ist kein Eintrag der Pinnwand. Die App zeigt Trenner
-- dort ohnehin nicht, „Alle loesen" zaehlte sie aber mit (Toast meldete
-- mehr Pins, als zu sehen waren). Darum faellt ein Pin beim Umstellen weg.
-- ==========================================
do $$
declare
  l record;
  n integer;
  kategorien constant text[] := array[
    'Gemüse', 'Kühlabteilung', 'Obst', 'Dosen', 'Grundnahrung', 'Gewürze',
    'Tiefkühl', 'Snacks', 'Drogerie', 'Getränke', 'Kind', 'Sonstiges'
  ];
begin
  for l in select id from public.lists where title = 'Einkaufen' and kind = 'aufgaben' loop
    select count(distinct text) into n
      from public.tasks
     where list_id = l.id and parent_id is null and type = 'task' and text = any (kategorien);
    if n <> array_length(kategorien, 1) then
      raise exception '026b: „Einkaufen" (%) hat nur % von % Kategorien', l.id, n, array_length(kategorien, 1);
    end if;

    update public.tasks
       set type = 'divider', done = false, pinned = false, pinned_by = null
     where list_id = l.id and parent_id is null and type = 'task' and text = any (kategorien);

    -- Abgehakte Artikel unter den Kategorien gelten als „zuletzt gekauft".
    update public.tasks c
       set abgelegt = true
      from public.tasks k
     where c.list_id = l.id and c.parent_id = k.id and k.type = 'divider' and c.done;

    update public.lists set kind = 'einkauf' where id = l.id;
  end loop;
end $$;
