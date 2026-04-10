-- ==========================================
-- 014: Secure Reward RPCs (Codex HIGH Security Fix)
-- Server-side Reward-Berechnung. Client kann keine xp/coin-Werte mehr uebergeben.
--
-- Enthaelt:
--   1) rewarded_tasks Tabelle (Double-Submit Schutz)
--   2) daily_quests.slot + UNIQUE INDEX (Race Condition Fix)
--   3) complete_task_reward RPC (server-side Reward-Berechnung)
--   4) complete_quest_reward RPC (atomar: quest + reward)
--   5) REVOKE (inkl. PUBLIC!) / GRANT (nur authenticated)
--
-- Wichtig:
--   - NULL-sichere Auth-Checks (is distinct from + explizite null-Pruefung)
--   - REVOKE FROM PUBLIC noetig, sonst hat anon via Default Execute-Rechte
-- ==========================================

-- --------------------------------------------
-- 1) rewarded_tasks Tabelle (Double-Submit Schutz)
-- --------------------------------------------
create table if not exists public.rewarded_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  rewarded_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

alter table public.rewarded_tasks enable row level security;

drop policy if exists "rewarded_tasks select own" on public.rewarded_tasks;
create policy "rewarded_tasks select own"
  on public.rewarded_tasks
  for select
  using (user_id = auth.uid());

drop policy if exists "rewarded_tasks insert own" on public.rewarded_tasks;
create policy "rewarded_tasks insert own"
  on public.rewarded_tasks
  for insert
  with check (user_id = auth.uid());

-- --------------------------------------------
-- 2) daily_quests.slot + UNIQUE INDEX (Race Protection)
-- --------------------------------------------
alter table public.daily_quests add column if not exists slot int;

-- Backfill: row_number pro (user_id, date), deterministisch via created_at + id
update public.daily_quests dq
  set slot = sub.rn
  from (
    select id, row_number() over (partition by user_id, date order by created_at, id) as rn
    from public.daily_quests
  ) sub
  where dq.id = sub.id
    and dq.slot is null;

alter table public.daily_quests alter column slot set not null;

create unique index if not exists daily_quests_user_date_slot_uniq
  on public.daily_quests(user_id, date, slot);

-- --------------------------------------------
-- 3) complete_task_reward RPC
-- Server-seitige Reward-Berechnung + Double-Submit Schutz
-- --------------------------------------------
create or replace function public.complete_task_reward(p_task_id uuid)
returns table(
  xp_gained int,
  coins_gained int,
  new_xp int,
  new_coins int,
  already_rewarded boolean
) as $$
declare
  v_uid uuid := auth.uid();
  v_task record;
  v_xp int;
  v_coins int;
  v_new_xp int;
  v_new_coins int;
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

  -- Reward server-seitig berechnen
  if v_task.parent_id is not null then
    -- Subtask
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

  return query select v_xp, v_coins, v_new_xp, v_new_coins, false;
end;
$$ language plpgsql security definer set search_path = public;

-- --------------------------------------------
-- 4) complete_quest_reward RPC
-- Atomare Quest-Completion + Reward-Grant in einer Transaction
-- --------------------------------------------
create or replace function public.complete_quest_reward(p_quest_id uuid)
returns table(
  xp_gained int,
  coins_gained int,
  new_xp int,
  new_coins int
) as $$
declare
  v_uid uuid := auth.uid();
  v_quest record;
  v_new_xp int;
  v_new_coins int;
begin
  if v_uid is null then
    raise exception 'Nicht authentifiziert';
  end if;

  -- Lock auf die Quest
  select dq.id, dq.user_id, dq.progress, dq.target, dq.reward_xp, dq.reward_coins, dq.completed
    into v_quest
    from public.daily_quests dq
    where dq.id = p_quest_id
    for update;

  if v_quest.id is null then
    raise exception 'Quest nicht gefunden';
  end if;

  if v_quest.user_id is distinct from v_uid then
    raise exception 'Zugriff verweigert';
  end if;

  if v_quest.completed then
    raise exception 'Quest bereits abgeschlossen';
  end if;

  if v_quest.progress < v_quest.target then
    raise exception 'Quest-Ziel nicht erreicht';
  end if;

  update public.daily_quests
    set completed = true
    where id = p_quest_id;

  update public.gamification_profiles
    set xp = xp + v_quest.reward_xp,
        coins = coins + v_quest.reward_coins,
        updated_at = now()
    where user_id = v_uid
    returning xp, coins into v_new_xp, v_new_coins;

  return query select v_quest.reward_xp, v_quest.reward_coins, v_new_xp, v_new_coins;
end;
$$ language plpgsql security definer set search_path = public;

-- --------------------------------------------
-- 5) REVOKE legacy (inkl. PUBLIC!), GRANT nur authenticated
-- --------------------------------------------
-- Legacy RPCs komplett sperren
revoke execute on function public.grant_rewards(uuid, int, int) from public;
revoke execute on function public.grant_rewards(uuid, int, int) from authenticated, anon;
revoke execute on function public.increment_xp(uuid, int) from public;
revoke execute on function public.increment_xp(uuid, int) from authenticated, anon;
revoke execute on function public.increment_coins(uuid, int) from public;
revoke execute on function public.increment_coins(uuid, int) from authenticated, anon;

-- Neue RPCs: PUBLIC/anon entfernen, authenticated erlauben
revoke execute on function public.complete_task_reward(uuid) from public;
revoke execute on function public.complete_task_reward(uuid) from anon;
grant execute on function public.complete_task_reward(uuid) to authenticated;

revoke execute on function public.complete_quest_reward(uuid) from public;
revoke execute on function public.complete_quest_reward(uuid) from anon;
grant execute on function public.complete_quest_reward(uuid) to authenticated;
