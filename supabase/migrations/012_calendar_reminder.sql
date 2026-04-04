-- Migration 012: Konfigurierbare Kalender-Erinnerung
-- Neue Spalte reminder_minutes in user_google_tokens

ALTER TABLE public.user_google_tokens
  ADD COLUMN IF NOT EXISTS reminder_minutes int NOT NULL DEFAULT 30;
