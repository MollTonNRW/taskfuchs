-- ==========================================
-- 025: RPC-Rechte aufraeumen
--
-- Befunde aus dem Supabase-Advisor (25.09.2026):
--   - lookup_user_by_email (security definer) war fuer anon aufrufbar:
--     jeder ohne Login konnte pruefen, ob eine E-Mail registriert ist, und
--     bekam die Nutzer-ID dazu. Gebraucht wird die Funktion nur vom
--     Teilen-Dialog — der ist angemeldet.
--   - Die Gamification-RPCs (complete_task_reward, complete_quest_reward,
--     generate_daily_quests) waren fuer angemeldete Nutzer aufrufbar,
--     obwohl die App die Gamification seit dem Redesign „A Klar" nicht mehr
--     kennt. Kein Aufrufer mehr: App, G2, E-Ink, n8n geprueft 25.09.2026.
--     Die Tabellen bleiben; nur die Aufrufbarkeit entfaellt.
--   - Trigger- und Event-Trigger-Funktionen (handle_new_user,
--     handle_new_user_gamification, rls_auto_enable) standen als RPC offen.
--     Trigger feuern unabhaengig vom EXECUTE-Recht (vgl. 022b).
--   - batch_reorder_* wirken nur fuer auth.uid() — fuer anon ohnehin leer,
--     das Recht faellt trotzdem weg.
--
-- Bewusst NICHT: is_list_owner / has_list_share — die RLS-Policies rufen
-- sie auf; ohne EXECUTE fuer anon wuerde jede anon-Abfrage auf lists/tasks
-- mit einem Rechtefehler statt mit einer leeren Menge enden.
-- Wiederholbar (revoke ist idempotent).
-- ==========================================

revoke execute on function public.lookup_user_by_email(text) from public, anon;
grant execute on function public.lookup_user_by_email(text) to authenticated;

revoke execute on function public.complete_task_reward(uuid) from public, anon, authenticated;
revoke execute on function public.complete_quest_reward(uuid) from public, anon, authenticated;
revoke execute on function public.generate_daily_quests() from public, anon, authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_user_gamification() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

revoke execute on function public.batch_reorder_lists(jsonb) from public, anon;
revoke execute on function public.batch_reorder_tasks(jsonb) from public, anon;
revoke execute on function public.batch_reorder_subtasks(jsonb) from public, anon;
grant execute on function public.batch_reorder_lists(jsonb) to authenticated;
grant execute on function public.batch_reorder_tasks(jsonb) to authenticated;
grant execute on function public.batch_reorder_subtasks(jsonb) to authenticated;
