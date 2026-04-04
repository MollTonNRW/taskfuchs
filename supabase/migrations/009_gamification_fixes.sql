-- ==========================================
-- 009: Gamification Fixes
-- Atomar XP/Coins Operationen, DELETE Policies, freeze_tokens
-- ==========================================

-- ==========================================
-- C1: RPC-Funktionen fuer atomare XP/Coins Updates
-- ==========================================

create or replace function public.increment_xp(p_user_id uuid, p_amount int)
returns int as $$
declare
  new_xp int;
begin
  update public.gamification_profiles
    set xp = xp + p_amount, updated_at = now()
    where user_id = p_user_id
    returning xp into new_xp;
  return new_xp;
end;
$$ language plpgsql security definer;

create or replace function public.increment_coins(p_user_id uuid, p_amount int)
returns int as $$
declare
  new_coins int;
begin
  update public.gamification_profiles
    set coins = coins + p_amount, updated_at = now()
    where user_id = p_user_id
    returning coins into new_coins;
  return new_coins;
end;
$$ language plpgsql security definer;

create or replace function public.grant_rewards(p_user_id uuid, p_xp int, p_coins int)
returns table(new_xp int, new_coins int) as $$
begin
  return query
    update public.gamification_profiles
      set xp = gamification_profiles.xp + p_xp,
          coins = gamification_profiles.coins + p_coins,
          updated_at = now()
      where user_id = p_user_id
      returning gamification_profiles.xp, gamification_profiles.coins;
end;
$$ language plpgsql security definer;

-- ==========================================
-- M4: freeze_tokens Spalte
-- ==========================================

alter table public.gamification_profiles
  add column if not exists freeze_tokens int not null default 2;

-- ==========================================
-- M5: DELETE RLS Policies (fehlten)
-- ==========================================

create policy "Users can delete own gamification profile"
  on public.gamification_profiles for delete
  using (auth.uid() = user_id);

create policy "Users can delete own daily quests"
  on public.daily_quests for delete
  using (auth.uid() = user_id);

create policy "Users can delete own achievements"
  on public.user_achievements for delete
  using (auth.uid() = user_id);

create policy "Users can delete own cosmetics"
  on public.user_cosmetics for delete
  using (auth.uid() = user_id);

-- active_cosmetics hat bereits eine DELETE policy in 008
