-- Migration: due_date von date zu text aendern
-- Erlaubt sowohl "2026-03-15" als auch "2026-03-15T14:00" Formate

ALTER TABLE public.tasks
  ALTER COLUMN due_date TYPE text USING due_date::text;
