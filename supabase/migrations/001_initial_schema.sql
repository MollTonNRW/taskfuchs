-- TaskFuchs DB Schema
-- Supabase (PostgreSQL) — EU Frankfurt

-- =============================================
-- PROFILES (extends Supabase auth.users)
-- =============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- LISTS
-- =============================================
create table public.lists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null default 'Neue Liste',
  icon text not null default '📝',
  position int not null default 0,
  visible boolean not null default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  version int not null default 1
);

create index idx_lists_user on public.lists(user_id);

-- =============================================
-- TASKS (unified: tasks + subtasks + dividers)
-- parent_id = null → top-level task/divider
-- parent_id = task_id → subtask (2 levels for v1)
-- =============================================
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  list_id uuid references public.lists on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  parent_id uuid references public.tasks on delete cascade,
  text text not null default '',
  type text not null default 'task' check (type in ('task', 'divider')),
  divider_label text,
  done boolean not null default false,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'asap')),
  timeframe text check (timeframe in ('akut', 'zeitnah', 'mittelfristig', 'langfristig')),
  highlighted boolean not null default false,
  pinned boolean not null default false,
  emoji text,
  note text,
  due_date date,
  progress int not null default 0 check (progress between 0 and 3),
  position int not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  version int not null default 1
);

create index idx_tasks_list on public.tasks(list_id);
create index idx_tasks_parent on public.tasks(parent_id);
create index idx_tasks_user on public.tasks(user_id);

-- =============================================
-- LIST SHARES (multi-user, Phase 2 prep)
-- =============================================
create table public.list_shares (
  id uuid default gen_random_uuid() primary key,
  list_id uuid references public.lists on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz default now() not null,
  unique(list_id, user_id)
);

create index idx_list_shares_user on public.list_shares(user_id);
create index idx_list_shares_list on public.list_shares(list_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Profiles: users can read all profiles, update only their own
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Lists: owner can do everything, shared users can read
alter table public.lists enable row level security;

create policy "Users can view own lists"
  on public.lists for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.list_shares
      where list_shares.list_id = lists.id
      and list_shares.user_id = auth.uid()
    )
  );

create policy "Users can create own lists"
  on public.lists for insert with check (auth.uid() = user_id);

create policy "Users can update own lists"
  on public.lists for update using (
    auth.uid() = user_id
    or exists (
      select 1 from public.list_shares
      where list_shares.list_id = lists.id
      and list_shares.user_id = auth.uid()
      and list_shares.role in ('owner', 'editor')
    )
  );

create policy "Users can delete own lists"
  on public.lists for delete using (auth.uid() = user_id);

-- Tasks: access through list ownership or sharing
alter table public.tasks enable row level security;

create policy "Users can view tasks in accessible lists"
  on public.tasks for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.lists
      where lists.id = tasks.list_id
      and (
        lists.user_id = auth.uid()
        or exists (
          select 1 from public.list_shares
          where list_shares.list_id = lists.id
          and list_shares.user_id = auth.uid()
        )
      )
    )
  );

create policy "Users can create tasks in own lists"
  on public.tasks for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.lists
      where lists.id = tasks.list_id
      and (
        lists.user_id = auth.uid()
        or exists (
          select 1 from public.list_shares
          where list_shares.list_id = lists.id
          and list_shares.user_id = auth.uid()
          and list_shares.role in ('owner', 'editor')
        )
      )
    )
  );

create policy "Users can update tasks in accessible lists"
  on public.tasks for update using (
    auth.uid() = user_id
    or exists (
      select 1 from public.lists
      where lists.id = tasks.list_id
      and (
        lists.user_id = auth.uid()
        or exists (
          select 1 from public.list_shares
          where list_shares.list_id = lists.id
          and list_shares.user_id = auth.uid()
          and list_shares.role in ('owner', 'editor')
        )
      )
    )
  );

create policy "Users can delete tasks in own lists"
  on public.tasks for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.lists
      where lists.id = tasks.list_id
      and lists.user_id = auth.uid()
    )
  );

-- List shares: managed by list owner
alter table public.list_shares enable row level security;

create policy "Users can view shares for accessible lists"
  on public.list_shares for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.lists
      where lists.id = list_shares.list_id
      and lists.user_id = auth.uid()
    )
  );

create policy "List owners can manage shares"
  on public.list_shares for insert with check (
    exists (
      select 1 from public.lists
      where lists.id = list_shares.list_id
      and lists.user_id = auth.uid()
    )
  );

create policy "List owners can update shares"
  on public.list_shares for update using (
    exists (
      select 1 from public.lists
      where lists.id = list_shares.list_id
      and lists.user_id = auth.uid()
    )
  );

create policy "List owners can delete shares"
  on public.list_shares for delete using (
    exists (
      select 1 from public.lists
      where lists.id = list_shares.list_id
      and lists.user_id = auth.uid()
    )
  );

-- =============================================
-- UPDATED_AT TRIGGERS
-- =============================================

-- Fuer Tabellen MIT version-Spalte (Optimistic Concurrency)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$ language plpgsql;

-- Fuer Tabellen OHNE version-Spalte (nur updated_at)
create or replace function public.set_updated_at_only()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_lists_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at_only();
