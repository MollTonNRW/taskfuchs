-- Migration 019: Spalte tasks.pinned_by
--
-- Haelt fest, WER einen Task angepinnt hat, fuer das "gepinnt von ..."-Badge im
-- Pinboard. Wird beim Pinnen auf die User-ID gesetzt, beim Entpinnen auf NULL.
-- Bestehende Pins (pinned=true, pinned_by=NULL) zeigen kein Badge -- akzeptiert.
--
-- Keine RLS-Aenderung noetig: pinned_by erbt die Task-Policies; Schreiben erfordert
-- wie bisher UPDATE-Recht (Owner oder editor+ auf geteilter Liste).
-- on delete set null: faellt der pinnende User weg, bleibt der Pin bestehen, nur
-- die Urheber-Info wird geleert.

alter table public.tasks
  add column if not exists pinned_by uuid references auth.users(id) on delete set null;
