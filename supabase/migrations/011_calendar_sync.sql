-- Migration 011: Google Calendar Sync
-- Tabelle fuer Google OAuth Tokens + calendar_event_id auf tasks

-- 1. Tabelle user_google_tokens
CREATE TABLE IF NOT EXISTS public.user_google_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  calendar_id text NOT NULL DEFAULT 'primary',
  sync_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. calendar_event_id auf tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS calendar_event_id text;

-- 3. RLS aktivieren + Policies
ALTER TABLE public.user_google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_tokens"
  ON public.user_google_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_tokens"
  ON public.user_google_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_tokens"
  ON public.user_google_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_tokens"
  ON public.user_google_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Index fuer calendar_event_id (partial, nur non-null)
CREATE INDEX IF NOT EXISTS idx_tasks_calendar_event_id
  ON public.tasks(calendar_event_id)
  WHERE calendar_event_id IS NOT NULL;
