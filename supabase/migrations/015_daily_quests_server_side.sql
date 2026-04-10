-- ==========================================
-- 015: daily_quests Mutations serverseitig (Codex Cheat-Vektor Fix)
--
-- Nach 014 bleibt der Reward-Exploit via direkte daily_quests-Mutation offen:
--   1) Client kann Quest mit target=1, reward_xp=999999 inserten → claimen
--   2) Client kann progress direkt auf target setzen → claimen
--   3) Client kann Quest loeschen → Re-Roll via generate_daily_quests() (zusaetzlich)
--
-- Fix: INSERT/UPDATE/DELETE nur noch via SECURITY DEFINER RPCs.
-- SELECT-Policy bleibt (Client muss Quests lesen).
-- complete_quest_reward (Migration 014) bleibt funktionsfaehig — ist SECURITY DEFINER,
-- laeuft als Function Owner, RLS wird bypassed.
-- ==========================================

-- --------------------------------------------
-- 1) generate_daily_quests() — serverseitig 2 Quests pro Tag erzeugen
-- --------------------------------------------
create or replace function public.generate_daily_quests()
returns setof public.daily_quests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := current_date;
  v_existing_count int;
  v_pool jsonb := '[
    {"quest_type":"complete_tasks","target":3,"reward_xp":30,"reward_coins":15},
    {"quest_type":"complete_tasks","target":5,"reward_xp":50,"reward_coins":25},
    {"quest_type":"complete_tasks","target":10,"reward_xp":100,"reward_coins":50},
    {"quest_type":"complete_subtasks","target":3,"reward_xp":20,"reward_coins":10},
    {"quest_type":"complete_subtasks","target":5,"reward_xp":40,"reward_coins":20},
    {"quest_type":"complete_tasks","target":1,"reward_xp":15,"reward_coins":10},
    {"quest_type":"complete_tasks","target":7,"reward_xp":70,"reward_coins":35},
    {"quest_type":"complete_subtasks","target":10,"reward_xp":60,"reward_coins":30},
    {"quest_type":"complete_tasks","target":2,"reward_xp":20,"reward_coins":10},
    {"quest_type":"complete_subtasks","target":1,"reward_xp":10,"reward_coins":5}
  ]'::jsonb;
  v_picked jsonb;
  v_used_types text[] := array[]::text[];
  v_slot int;
begin
  if v_uid is null then
    raise exception 'Nicht authentifiziert';
  end if;

  -- Wenn heute schon Quests existieren: bestehende zurueckgeben (idempotent + race-safe)
  select count(*) into v_existing_count
    from public.daily_quests
    where user_id = v_uid and date = v_today;

  if v_existing_count > 0 then
    return query
      select * from public.daily_quests
      where user_id = v_uid and date = v_today
      order by slot;
    return;
  end if;

  -- 1. Durchlauf: 2 Quests picken, moeglichst verschiedene quest_types
  v_slot := 1;
  for v_picked in
    select value
    from jsonb_array_elements(v_pool)
    order by random()
  loop
    exit when v_slot > 2;
    -- Bei Slot 2: gleichen quest_type wie Slot 1 ueberspringen (wenn moeglich)
    if v_slot = 2 and (v_picked->>'quest_type') = any(v_used_types) then
      continue;
    end if;
    begin
      insert into public.daily_quests(
        user_id, quest_type, target, reward_xp, reward_coins,
        date, slot, progress, completed
      )
      values (
        v_uid,
        v_picked->>'quest_type',
        (v_picked->>'target')::int,
        (v_picked->>'reward_xp')::int,
        (v_picked->>'reward_coins')::int,
        v_today,
        v_slot,
        0,
        false
      );
      v_used_types := array_append(v_used_types, v_picked->>'quest_type');
      v_slot := v_slot + 1;
    exception when unique_violation then
      -- Race: anderer Call hat parallel eingefuegt → alle existierenden zurueckgeben
      return query
        select * from public.daily_quests
        where user_id = v_uid and date = v_today
        order by slot;
      return;
    end;
  end loop;

  -- Fallback: falls nur 1 gepickt (z.B. alle Pool-Eintraege gleicher Typ) — zweite beliebige nehmen
  if v_slot <= 2 then
    for v_picked in
      select value from jsonb_array_elements(v_pool) order by random()
    loop
      exit when v_slot > 2;
      begin
        insert into public.daily_quests(
          user_id, quest_type, target, reward_xp, reward_coins,
          date, slot, progress, completed
        )
        values (
          v_uid,
          v_picked->>'quest_type',
          (v_picked->>'target')::int,
          (v_picked->>'reward_xp')::int,
          (v_picked->>'reward_coins')::int,
          v_today,
          v_slot,
          0,
          false
        );
        v_slot := v_slot + 1;
      exception when unique_violation then
        return query
          select * from public.daily_quests
          where user_id = v_uid and date = v_today
          order by slot;
        return;
      end;
    end loop;
  end if;

  return query
    select * from public.daily_quests
    where user_id = v_uid and date = v_today
    order by slot;
end;
$$;

-- --------------------------------------------
-- 2) increment_quest_progress(p_quest_type text, p_amount int)
-- Server-seitige Progress-Erhoehung, clamped auf target
-- --------------------------------------------
create or replace function public.increment_quest_progress(
  p_quest_type text,
  p_amount int default 1
)
returns setof public.daily_quests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Nicht authentifiziert';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 100 then
    raise exception 'Ungueltiger Amount';
  end if;

  if p_quest_type is null or length(p_quest_type) = 0 then
    raise exception 'Ungueltiger Quest-Type';
  end if;

  update public.daily_quests
    set progress = least(progress + p_amount, target)
    where user_id = v_uid
      and date = current_date
      and quest_type = p_quest_type
      and completed = false;

  return query
    select * from public.daily_quests
    where user_id = v_uid and date = current_date
    order by slot;
end;
$$;

-- --------------------------------------------
-- 3) RLS Policies bereinigen
-- SELECT bleibt. INSERT/UPDATE/DELETE droppen.
-- (DELETE wird gedroppt, weil sonst ein Re-Roll via generate_daily_quests() moeglich waere.)
-- Echte Policy-Namen aus Migration 008 verifiziert via pg_policies.
-- --------------------------------------------
drop policy if exists "Users can insert own daily quests" on public.daily_quests;
drop policy if exists "Users can update own daily quests" on public.daily_quests;
drop policy if exists "Users can delete own daily quests" on public.daily_quests;
-- "Users can view own daily quests" (SELECT) bleibt erhalten

-- --------------------------------------------
-- 4) Grants
-- --------------------------------------------
revoke execute on function public.generate_daily_quests() from public;
revoke execute on function public.generate_daily_quests() from anon;
grant execute on function public.generate_daily_quests() to authenticated;

revoke execute on function public.increment_quest_progress(text, int) from public;
revoke execute on function public.increment_quest_progress(text, int) from anon;
grant execute on function public.increment_quest_progress(text, int) to authenticated;
