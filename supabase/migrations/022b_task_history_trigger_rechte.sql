-- ==========================================
-- 022b: Trigger-Funktionen der Aufgabenhistorie nicht per RPC aufrufbar
--
-- Der Supabase-Advisor meldete nach 022 task_history_in_papierkorb()
-- (SECURITY DEFINER) als fuer anon/authenticated ausfuehrbar. Aufrufen laesst
-- sich eine Trigger-Funktion ausserhalb eines Triggers ohnehin nicht, aber
-- das Recht gehoert trotzdem weg. Trigger feuern unabhaengig vom
-- EXECUTE-Recht des Ausloesenden (geprueft wird nur bei CREATE TRIGGER).
-- ==========================================
revoke execute on function public.task_history_in_papierkorb() from public, anon, authenticated;
revoke execute on function public.task_history_stempeln() from public, anon, authenticated;
