-- Migration: assigned_to Feld fuer Task-Zuweisung
-- Ermoeglicht das Zuweisen von Tasks an Benutzer

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to);
