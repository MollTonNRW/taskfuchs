-- ==========================================
-- 013: RPC Auth Check
-- Reward-RPCs duerfen nur eigene Profile aendern
-- Codex Review P1: RPCs vertrauten auf caller-supplied user IDs
-- ==========================================

create or replace function public.increment_xp(p_user_id uuid, p_amount int)
returns int as $$
declare
  new_xp int;
begin
  if p_user_id != auth.uid() then
    raise exception 'Zugriff verweigert';
  end if;

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
  if p_user_id != auth.uid() then
    raise exception 'Zugriff verweigert';
  end if;

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
  if p_user_id != auth.uid() then
    raise exception 'Zugriff verweigert';
  end if;

  return query
    update public.gamification_profiles
      set xp = gamification_profiles.xp + p_xp,
          coins = gamification_profiles.coins + p_coins,
          updated_at = now()
      where user_id = p_user_id
      returning gamification_profiles.xp, gamification_profiles.coins;
end;
$$ language plpgsql security definer;
