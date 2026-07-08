-- 020: Fixieren-Feature entfernt (UI). Bestehende Fixierungen zuruecksetzen,
-- damit keine Task dauerhaft im (nicht mehr abschaltbaren) Zustand haengt.
-- Die Spalte tasks.highlighted bleibt aus Kompatibilitaetsgruenden bestehen.
update public.tasks set highlighted = false where highlighted = true;
