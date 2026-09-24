-- ==========================================
-- 023: tasks.progress entfernen — ersetzt durch die Aufgabenhistorie (022)
--
-- ERST NACH DEM DEPLOY des Codes anwenden, der `progress` nicht mehr
-- schreibt. Die alte Fassung setzt beim Anlegen einer Aufgabe noch
-- `progress: 0` — gegen eine Tabelle ohne die Spalte schluege das fehl.
-- Offene Browser-Tabs mit der alten Version muessen einmal neu laden
-- (Service-Worker ist network-first, Navigationen ungecacht).
--
-- Voraussetzung: 022 (public.task_history samt Trigger) ist angewendet.
--
-- Geprueft 24.09.2026: keine View, keine Funktion, kein n8n-Workflow
-- (homelab-taskfuchs-mutations/-read), keine API-Route und das G2-Projekt
-- lesen tasks.progress. Die Treffer in Gamification-Funktionen betreffen
-- daily_quests.progress und bleiben unberuehrt.
--
-- Wiederholbar: steht die Spalte nicht mehr, tut die Migration nichts.
-- ==========================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'progress'
  ) then
    raise notice '023: tasks.progress existiert nicht mehr — nichts zu tun';
    return;
  end if;

  -- 1) Uebernahme: jeder gesetzte Fortschritt einer Aufgabe oberster Ebene
  --    wird ein Stand-Eintrag. Autor ist der Ersteller der Aufgabe, Zeitpunkt
  --    ihre letzte Aenderung. Ohne angemeldeten Nutzer laesst der Trigger aus
  --    022 beide Werte unangetastet.
  insert into public.task_history (task_id, kind, body, created_by, created_at)
  select
    t.id,
    'stand',
    'Fortschritt vor der Umstellung: ' || case t.progress
      when 1 then 'Angefangen (33 %)'
      when 2 then 'Fast fertig (66 %)'
      when 3 then 'Fertig (100 %)'
    end,
    t.user_id,
    t.updated_at
  from public.tasks t
  where t.parent_id is null
    and t.type = 'task'
    and t.progress in (1, 2, 3)
    -- Schutz gegen doppelte Uebernahme, falls ein frueherer Lauf nach dem
    -- Insert abgebrochen ist.
    and not exists (
      select 1 from public.task_history h
      where h.task_id = t.id
        and h.kind = 'stand'
        and h.body like 'Fortschritt vor der Umstellung: %'
    );

  -- 2) Spalte entfernen.
  alter table public.tasks drop column progress;
end $$;
