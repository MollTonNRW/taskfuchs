-- ==========================================
-- 024: Besitz und Verschieben absichern
--
-- Die UPDATE-Policies auf tasks und lists (003) haben kein WITH CHECK. Postgres
-- prueft die neue Zeile darum gegen dieselbe USING-Bedingung — und die ist
-- nach dem Umschreiben leicht zu erfuellen:
--   1. Ein Editor setzt tasks.user_id auf sich. Danach traegt ihn die
--      Ersteller-Klausel (user_id = auth.uid()): er sieht und bearbeitet die
--      Aufgabe (samt Verlauf) auch dann noch, wenn ihm die Freigabe entzogen
--      wird.
--   2. Wer eine Aufgabe angelegt hat, setzt list_id auf eine FREMDE Liste.
--      Die neue Zeile besteht wieder ueber user_id = auth.uid() — die Aufgabe
--      landet in einer Liste, in die er nie schreiben durfte.
--      Dasselbe ohne jede Pruefung ueber die RPC batch_reorder_tasks
--      (security definer, setzt list_id aus dem Aufruf).
--   3. Ein Editor setzt lists.user_id auf sich und wird Besitzer der Liste;
--      der bisherige Besitzer verliert den Zugriff.
--   4. Unteraufgaben lassen sich per parent_id (Insert, Update oder RPC
--      batch_reorder_subtasks) an Aufgaben haengen, die man nicht
--      bearbeiten darf.
--
-- Loesung: je ein BEFORE-Trigger, der nur greift, wenn ein angemeldeter
-- Nutzer schreibt (auth.uid() gesetzt) — also auch innerhalb der
-- security-definer-RPCs, aber nicht fuer n8n (service_role, ohne auth.uid()),
-- den E-Ink-Dienst (nur lesend) oder Migrationen.
--   - tasks.user_id und lists.user_id: bleiben still beim alten Wert.
--     Die App aendert beide nie per Update (geprueft 25.09.2026: App, G2 —
--     G2 aendert nur note/text).
--   - tasks.list_id aendern: nur in Listen, die man besitzt oder als
--     owner/editor geteilt bekommen hat. Sonst Fehler 42501.
--   - tasks.parent_id setzen (Insert oder Aenderung): nur an Aufgaben in
--     Listen, in die man schreiben darf. Sonst Fehler 42501.
--
-- Datenstand 25.09.2026: keine Unteraufgabe in anderer Liste als ihre
-- Eltern-Aufgabe, keine Aufgabe eines Erstellers ohne Schreibrecht auf ihre
-- Liste — die Regeln treffen keinen Bestand.
-- Wiederholbar (create or replace / drop if exists).
-- ==========================================

create or replace function public.tasks_schreibschutz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich uuid := auth.uid();
  v_eltern_liste uuid;
begin
  if v_ich is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- 1) Ersteller ist unveraenderlich.
    new.user_id := old.user_id;

    -- 2) Verschieben nur in beschreibbare Listen.
    if new.list_id is distinct from old.list_id
       and not (public.is_list_owner(new.list_id)
                or public.has_list_share(new.list_id, array['owner', 'editor'])) then
      raise exception 'Keine Schreibrechte fuer die Zielliste' using errcode = '42501';
    end if;
  end if;

  -- 4) Unteraufgabe nur an bearbeitbare Aufgaben haengen.
  if new.parent_id is not null
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    select t.list_id into v_eltern_liste from public.tasks t where t.id = new.parent_id;
    if v_eltern_liste is null
       or not (public.is_list_owner(v_eltern_liste)
               or public.has_list_share(v_eltern_liste, array['owner', 'editor'])) then
      raise exception 'Keine Schreibrechte fuer die uebergeordnete Aufgabe' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_schreibschutz on public.tasks;
create trigger tasks_schreibschutz
  before insert or update on public.tasks
  for each row execute function public.tasks_schreibschutz();

create or replace function public.lists_besitzschutz()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- 3) Besitzer einer Liste ist unveraenderlich.
  if auth.uid() is not null then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists lists_besitzschutz on public.lists;
create trigger lists_besitzschutz
  before update on public.lists
  for each row execute function public.lists_besitzschutz();

-- Trigger-Funktionen nicht per RPC aufrufbar (vgl. 022b). Trigger feuern
-- unabhaengig vom EXECUTE-Recht des Ausloesenden.
revoke execute on function public.tasks_schreibschutz() from public, anon, authenticated;
revoke execute on function public.lists_besitzschutz() from public, anon, authenticated;
