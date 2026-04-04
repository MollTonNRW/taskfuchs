-- Migration 010: Leaderboard RLS
-- Alle authentifizierten User duerfen Gamification-Profile sehen (fuer Leaderboard)
-- Die bestehende Policy "Users can view own gamification profile" bleibt bestehen —
-- PostgreSQL evaluiert OR zwischen Policies, die neue ist breiter und subsumiert die alte.

CREATE POLICY "Authenticated users can view all gamification profiles"
  ON public.gamification_profiles FOR SELECT
  USING (auth.role() = 'authenticated');
