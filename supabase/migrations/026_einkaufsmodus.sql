-- ==========================================
-- 026: Einkaufs-Modus — Datenmodell (rein additiv)
--
-- lists.kind: 'aufgaben' (bisher alle) oder 'einkauf'.
-- tasks.abgelegt: Artikel nach „Einkauf fertig" — erledigt UND abgelegt =
-- „zuletzt gekauft" (nur noch als Chip). Fuer Aufgabenlisten immer false.
-- Beide Spalten mit Default: die bisherige App-Fassung merkt nichts davon.
-- Kategorien sind Trenner-Zeilen (type 'divider'), Artikel ihre
-- Unteraufgaben — dafuer braucht es keine Schemaaenderung.
-- Spezifikation: docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md
-- Wiederholbar.
-- ==========================================
alter table public.lists add column if not exists kind text not null default 'aufgaben';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lists_kind_check') then
    alter table public.lists add constraint lists_kind_check check (kind in ('aufgaben', 'einkauf'));
  end if;
end $$;

alter table public.tasks add column if not exists abgelegt boolean not null default false;
