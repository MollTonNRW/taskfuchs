-- ==========================================
-- 016: Quest-Progress an complete_task_reward koppeln
--
-- Rev's Review zu 015: increment_quest_progress(amount=10) erlaubt dem Client,
-- eine Quest mit target=10 in einem Call zu fuellen ohne echte Task-Completion.
-- Max Gewinn: 200 XP + 100 coins pro Tag.
--
-- Fix:
--   1) Progress wird NUR noch als Side-Effect von complete_task_reward inkrementiert
--      (nur im "tatsaechlich belohnt"-Pfad, nicht im already_rewarded-Pfad)
--   2) increment_quest_progress(text, int) RPC wird gedroppt
--
-- Invariant: Return-Shape von complete_task_reward bleibt unveraendert
-- (Signatur + TABLE-Spalten), damit Frontend nicht gleichzeitig brechen muss.
-- ==========================================

-- --------------------------------------------
-- 1) complete_task_reward mit Quest-Progress-Side-Effect
-- --------------------------------------------
create or replace function public.complete_task_reward(p_task_id uuid)
returns table(
  xp_gained int,
  coins_gained int,
  new_xp int,
  new_coins int,
  already_rewarded boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_task record;
  v_xp int;
  v_coins int;
  v_new_xp int;
  v_new_coins int;
  v_is_subtask boolean;
begin
  if v_uid is null then
    raise exception 'Nicht authentifiziert';
  end if;

  -- Task laden
  select t.id, t.user_id, t.parent_id, t.done, t.priority, t.type
    into v_task
    from public.tasks t
    where t.id = p_task_id;

  if v_task.id is null then
    raise exception 'Task nicht gefunden';
  end if;

  -- Ownership (NULL-sicher)
  if v_task.user_id is distinct from v_uid then
    raise exception 'Zugriff verweigert';
  end if;

  -- Divider zaehlen nicht als Task
  if v_task.type is distinct from 'task' then
    raise exception 'Ungueltiger Task-Typ';
  end if;

  -- Muss erledigt sein
  if v_task.done is not true then
    raise exception 'Task nicht erledigt';
  end if;

  -- Double-Submit Schutz: bereits belohnt?
  -- WICHTIG: hier KEIN Quest-Progress-Update, sonst koennte der Client
  --          durch wiederholte Aufrufe Progress pushen.
  if exists (
    select 1 from public.rewarded_tasks
    where user_id = v_uid and task_id = p_task_id
  ) then
    select gp.xp, gp.coins into v_new_xp, v_new_coins
      from public.gamification_profiles gp
      where gp.user_id = v_uid;
    return query select 0, 0, coalesce(v_new_xp, 0), coalesce(v_new_coins, 0), true;
    return;
  end if;

  v_is_subtask := v_task.parent_id is not null;

  -- Reward server-seitig berechnen
  if v_is_subtask then
    v_xp := 3;
    v_coins := 2;
  else
    case v_task.priority
      when 'low'    then v_xp := 5;  v_coins := 5;
      when 'normal' then v_xp := 10; v_coins := 10;
      when 'high'   then v_xp := 15; v_coins := 15;
      when 'asap'   then v_xp := 20; v_coins := 20;
      else               v_xp := 10; v_coins := 10;
    end case;
  end if;

  -- rewarded_tasks einfuegen (PK-Violation = Race, Transaction bricht ab)
  insert into public.rewarded_tasks(user_id, task_id)
    values (v_uid, p_task_id);

  -- gamification_profile updaten
  update public.gamification_profiles
    set xp = xp + v_xp,
        coins = coins + v_coins,
        updated_at = now()
    where user_id = v_uid
    returning xp, coins into v_new_xp, v_new_coins;

  -- NEU (016): Quest-Progress als Side-Effect der echten Task-Completion
  -- clamped auf target, nur offene Quests von heute
  update public.daily_quests
    set progress = least(progress + 1, target)
    where user_id = v_uid
      and date = current_date
      and completed = false
      and quest_type = case
                         when v_is_subtask then 'complete_subtasks'
                         else 'complete_tasks'
                       end;

  return query select v_xp, v_coins, v_new_xp, v_new_coins, false;
end;
$$;

-- --------------------------------------------
-- 2) increment_quest_progress droppen (Anti-Cheat)
-- Progress laeuft jetzt ausschliesslich ueber complete_task_reward
-- --------------------------------------------
drop function if exists public.increment_quest_progress(text, int);

-- --------------------------------------------
-- 3) Grants (CREATE OR REPLACE setzt Grants nicht zurueck, sicherheitshalber nochmal)
-- --------------------------------------------
revoke execute on function public.complete_task_reward(uuid) from public;
revoke execute on function public.complete_task_reward(uuid) from anon;
grant execute on function public.complete_task_reward(uuid) to authenticated;
