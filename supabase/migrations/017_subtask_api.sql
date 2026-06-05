-- ==========================================
-- 017: Subtask-API + Integritaets-Regeln
--
-- Kontext: Das Datenmodell unterstuetzt Subtasks bereits seit 001 ueber
-- tasks.parent_id (self-FK). Bisher war die 1-Ebenen-Regel aber NUR eine
-- Frontend-Konvention — es gab weder DB-seitige Integritaet noch eine
-- server-seitige API, um einer bestehenden Aufgabe per Text-Lookup eine
-- echte Subtask anzuhaengen (der n8n-Webhook kennt nur Top-Level create_task;
-- parent_hint dort ist nur die Divider-Kategorie fuer Einkaufslisten).
--
-- Diese Migration schliesst beide Luecken:
--   1) Integritaet: Self-Parent-CHECK + Trigger (max 1 Ebene, kein Subtask an
--      Divider, gleiche Liste wie Parent) — Defense-in-Depth fuer Frontend UND API.
--   2) RPC add_subtask(): server-seitige Subtask-Erstellung mit Parent-Lookup,
--      ok/ambiguous/not_found-Vertrag analog zu taskfuchs-delete/-move.
-- ==========================================

-- ------------------------------------------
-- 1) Integritaets-Constraints
-- ------------------------------------------

-- Eine Aufgabe darf nicht ihr eigener Parent sein
alter table public.tasks
  add constraint tasks_no_self_parent
  check (parent_id is null or parent_id <> id);

-- Trigger: erzwingt die Subtask-Regeln bei INSERT / UPDATE OF parent_id.
-- SECURITY DEFINER, damit der Parent-Lookup unabhaengig von RLS funktioniert
-- (reine Integritaetspruefung — keine Datenrueckgabe an den Caller).
create or replace function public.enforce_subtask_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.tasks%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent from public.tasks where id = new.parent_id;

  if not found then
    raise exception 'Parent-Task % existiert nicht', new.parent_id;
  end if;

  -- Max 1 Ebene: der Parent darf nicht selbst eine Subtask sein
  if v_parent.parent_id is not null then
    raise exception 'Subtasks duerfen nur 1 Ebene tief sein (Parent % ist selbst eine Subtask)', new.parent_id;
  end if;

  -- An einen Trenner kann keine Subtask gehaengt werden
  if v_parent.type = 'divider' then
    raise exception 'Subtasks koennen nicht an einen Trenner angehaengt werden';
  end if;

  -- Ein Trenner kann selbst keine Subtask sein
  if new.type = 'divider' then
    raise exception 'Ein Trenner kann keine Subtask sein';
  end if;

  -- Subtask muss in derselben Liste wie der Parent liegen
  if v_parent.list_id <> new.list_id then
    raise exception 'Subtask muss in derselben Liste wie der Parent liegen';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_subtask_rules on public.tasks;
create trigger trg_enforce_subtask_rules
  before insert or update of parent_id on public.tasks
  for each row execute function public.enforce_subtask_rules();

-- ------------------------------------------
-- 2) RPC: add_subtask
--
-- Haengt einer bestehenden Top-Level-Aufgabe eine Subtask an. Parent wird per
-- Substring-Suche (ilike) im Text gefunden, optional auf eine Liste eingegrenzt.
--
-- Auth-Modell (wie 013, aber service-role-kompatibel):
--   - Authentifizierter Aufruf (Frontend): auth.uid() muss p_user_id entsprechen.
--   - Service-Role-Aufruf (n8n-Webhook): auth.uid() ist NULL → p_user_id wird
--     als vertrauenswuerdig akzeptiert (Workflow liegt hinter Cloudflare Access).
--
-- Rueckgabe (jsonb), Vertrag analog taskfuchs-delete/-move:
--   Erfolg:      {"ok": true, "subtask": {id, text, parent_id, parent_text, list_id}}
--   Nicht gef.:  {"ok": false, "error": "parent_not_found"}
--   Mehrdeutig:  {"ok": false, "error": "ambiguous", "candidates": [{id, text, list_id}, ...]}
--   Leer/zu lang:{"ok": false, "error": "empty_text" | "text_too_long"}
-- ------------------------------------------
create or replace function public.add_subtask(
  p_user_id      uuid,
  p_parent_text  text,
  p_subtask_text text,
  p_list_text    text default null,
  p_priority     text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_count int;
  v_parent      public.tasks%rowtype;
  v_candidates  jsonb;
  v_new_id      uuid;
  v_position    int;
  v_text        text := btrim(coalesce(p_subtask_text, ''));
begin
  -- Auth-Gate
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Zugriff verweigert';
  end if;

  -- Eingabe-Validierung
  if v_text = '' then
    return jsonb_build_object('ok', false, 'error', 'empty_text');
  end if;
  if char_length(v_text) > 500 then
    return jsonb_build_object('ok', false, 'error', 'text_too_long');
  end if;

  if p_priority is null or p_priority not in ('low', 'normal', 'high', 'asap') then
    p_priority := 'normal';
  end if;

  -- Parent-Kandidaten zaehlen (nur Top-Level Tasks des Users, kein Divider)
  select count(*) into v_match_count
  from public.tasks t
  where t.user_id = p_user_id
    and t.parent_id is null
    and t.type = 'task'
    and t.text ilike '%' || p_parent_text || '%'
    and (p_list_text is null
         or exists (select 1 from public.lists l
                    where l.id = t.list_id and l.title ilike '%' || p_list_text || '%'));

  if v_match_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'parent_not_found');
  elsif v_match_count > 1 then
    select jsonb_agg(jsonb_build_object('id', t.id, 'text', t.text, 'list_id', t.list_id))
      into v_candidates
    from public.tasks t
    where t.user_id = p_user_id
      and t.parent_id is null
      and t.type = 'task'
      and t.text ilike '%' || p_parent_text || '%'
      and (p_list_text is null
           or exists (select 1 from public.lists l
                      where l.id = t.list_id and l.title ilike '%' || p_list_text || '%'));
    return jsonb_build_object('ok', false, 'error', 'ambiguous', 'candidates', v_candidates);
  end if;

  -- Eindeutiger Parent
  select t.* into v_parent
  from public.tasks t
  where t.user_id = p_user_id
    and t.parent_id is null
    and t.type = 'task'
    and t.text ilike '%' || p_parent_text || '%'
    and (p_list_text is null
         or exists (select 1 from public.lists l
                    where l.id = t.list_id and l.title ilike '%' || p_list_text || '%'))
  limit 1;

  -- Naechste Position unter den vorhandenen Subtasks (analog Frontend: sibling count)
  select coalesce(max(position) + 1, 0) into v_position
  from public.tasks where parent_id = v_parent.id;

  insert into public.tasks (list_id, user_id, parent_id, text, type, priority, position)
  values (v_parent.list_id, p_user_id, v_parent.id, v_text, 'task', p_priority, v_position)
  returning id into v_new_id;

  return jsonb_build_object(
    'ok', true,
    'subtask', jsonb_build_object(
      'id', v_new_id,
      'text', v_text,
      'parent_id', v_parent.id,
      'parent_text', v_parent.text,
      'list_id', v_parent.list_id
    )
  );
end;
$$;

-- Frontend (authenticated) + n8n-Webhook (service_role) duerfen aufrufen
revoke all on function public.add_subtask(uuid, text, text, text, text) from public;
grant execute on function public.add_subtask(uuid, text, text, text, text) to authenticated;
grant execute on function public.add_subtask(uuid, text, text, text, text) to service_role;
