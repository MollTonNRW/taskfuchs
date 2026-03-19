-- ==========================================
-- 008: Gamification Tables
-- ==========================================

-- Gamification Profile (XP, Coins, Level, Streak)
create table if not exists public.gamification_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp int not null default 0,
  coins int not null default 0,
  level int not null default 1,
  streak_days int not null default 0,
  streak_last_date date,
  best_streak int not null default 0,
  total_tasks_done int not null default 0,
  weekly_tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Freigeschaltete Achievements
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  notified boolean not null default false,
  unique (user_id, achievement_id)
);

-- Taegliche Quests
create table if not exists public.daily_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_type text not null,
  target int not null,
  progress int not null default 0,
  reward_xp int not null default 0,
  reward_coins int not null default 0,
  completed boolean not null default false,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Gekaufte Cosmetics
create table if not exists public.user_cosmetics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_id text not null,
  purchased_at timestamptz not null default now(),
  unique (user_id, cosmetic_id)
);

-- Aktive Cosmetics (pro Slot)
create table if not exists public.active_cosmetics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null,
  cosmetic_id text not null,
  unique (user_id, slot)
);

-- ==========================================
-- RLS Policies
-- ==========================================

alter table public.gamification_profiles enable row level security;
alter table public.user_achievements enable row level security;
alter table public.daily_quests enable row level security;
alter table public.user_cosmetics enable row level security;
alter table public.active_cosmetics enable row level security;

-- gamification_profiles
create policy "Users can view own gamification profile"
  on public.gamification_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own gamification profile"
  on public.gamification_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own gamification profile"
  on public.gamification_profiles for update
  using (auth.uid() = user_id);

-- user_achievements
create policy "Users can view own achievements"
  on public.user_achievements for select
  using (auth.uid() = user_id);

create policy "Users can insert own achievements"
  on public.user_achievements for insert
  with check (auth.uid() = user_id);

create policy "Users can update own achievements"
  on public.user_achievements for update
  using (auth.uid() = user_id);

-- daily_quests
create policy "Users can view own daily quests"
  on public.daily_quests for select
  using (auth.uid() = user_id);

create policy "Users can insert own daily quests"
  on public.daily_quests for insert
  with check (auth.uid() = user_id);

create policy "Users can update own daily quests"
  on public.daily_quests for update
  using (auth.uid() = user_id);

-- user_cosmetics
create policy "Users can view own cosmetics"
  on public.user_cosmetics for select
  using (auth.uid() = user_id);

create policy "Users can insert own cosmetics"
  on public.user_cosmetics for insert
  with check (auth.uid() = user_id);

-- active_cosmetics
create policy "Users can view own active cosmetics"
  on public.active_cosmetics for select
  using (auth.uid() = user_id);

create policy "Users can insert own active cosmetics"
  on public.active_cosmetics for insert
  with check (auth.uid() = user_id);

create policy "Users can update own active cosmetics"
  on public.active_cosmetics for update
  using (auth.uid() = user_id);

create policy "Users can delete own active cosmetics"
  on public.active_cosmetics for delete
  using (auth.uid() = user_id);

-- ==========================================
-- Auto-Create Trigger (wie profiles)
-- ==========================================

create or replace function public.handle_new_user_gamification()
returns trigger as $$
begin
  insert into public.gamification_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created_gamification
  after insert on auth.users
  for each row execute function public.handle_new_user_gamification();

-- ==========================================
-- Indizes
-- ==========================================

create index if not exists idx_user_achievements_user_id on public.user_achievements(user_id);
create index if not exists idx_daily_quests_user_id on public.daily_quests(user_id);
create index if not exists idx_daily_quests_user_date on public.daily_quests(user_id, date);
create index if not exists idx_user_cosmetics_user_id on public.user_cosmetics(user_id);
create index if not exists idx_active_cosmetics_user_id on public.active_cosmetics(user_id);
