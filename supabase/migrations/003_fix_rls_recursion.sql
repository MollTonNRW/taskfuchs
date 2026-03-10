-- Fix: Infinite recursion in RLS policies
-- Problem: lists policies reference list_shares, list_shares policies reference lists
-- Solution: SECURITY DEFINER function bypasses RLS for ownership check

-- Helper function: checks if current user owns a list (bypasses RLS)
create or replace function public.is_list_owner(list_uuid uuid)
returns boolean as $$
  select exists (
    select 1 from public.lists
    where id = list_uuid and user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Helper function: checks if current user has a share on a list (bypasses RLS)
create or replace function public.has_list_share(list_uuid uuid, allowed_roles text[] default null)
returns boolean as $$
  select exists (
    select 1 from public.list_shares
    where list_id = list_uuid
      and user_id = auth.uid()
      and (allowed_roles is null or role = any(allowed_roles))
  );
$$ language sql security definer stable;

-- =============================================
-- Drop and recreate lists policies
-- =============================================
drop policy if exists "Users can view own lists" on public.lists;
create policy "Users can view own lists"
  on public.lists for select using (
    auth.uid() = user_id
    or public.has_list_share(id)
  );

drop policy if exists "Users can update own lists" on public.lists;
create policy "Users can update own lists"
  on public.lists for update using (
    auth.uid() = user_id
    or public.has_list_share(id, array['owner', 'editor'])
  );

-- INSERT and DELETE policies don't reference list_shares, so they're fine

-- =============================================
-- Drop and recreate list_shares policies
-- =============================================
drop policy if exists "Users can view shares for accessible lists" on public.list_shares;
create policy "Users can view shares for accessible lists"
  on public.list_shares for select using (
    auth.uid() = user_id
    or public.is_list_owner(list_id)
  );

drop policy if exists "List owners can manage shares" on public.list_shares;
create policy "List owners can manage shares"
  on public.list_shares for insert with check (
    public.is_list_owner(list_id)
  );

drop policy if exists "List owners can update shares" on public.list_shares;
create policy "List owners can update shares"
  on public.list_shares for update using (
    public.is_list_owner(list_id)
  );

drop policy if exists "List owners can delete shares" on public.list_shares;
create policy "List owners can delete shares"
  on public.list_shares for delete using (
    public.is_list_owner(list_id)
  );

-- =============================================
-- Drop and recreate tasks policies (also use helpers)
-- =============================================
drop policy if exists "Users can view tasks in accessible lists" on public.tasks;
create policy "Users can view tasks in accessible lists"
  on public.tasks for select using (
    auth.uid() = user_id
    or public.is_list_owner(list_id)
    or public.has_list_share(list_id)
  );

drop policy if exists "Users can create tasks in own lists" on public.tasks;
create policy "Users can create tasks in own lists"
  on public.tasks for insert with check (
    auth.uid() = user_id
    and (
      public.is_list_owner(list_id)
      or public.has_list_share(list_id, array['owner', 'editor'])
    )
  );

drop policy if exists "Users can update tasks in accessible lists" on public.tasks;
create policy "Users can update tasks in accessible lists"
  on public.tasks for update using (
    auth.uid() = user_id
    or public.is_list_owner(list_id)
    or public.has_list_share(list_id, array['owner', 'editor'])
  );

drop policy if exists "Users can delete tasks in own lists" on public.tasks;
create policy "Users can delete tasks in own lists"
  on public.tasks for delete using (
    auth.uid() = user_id
    or public.is_list_owner(list_id)
  );
