# Pinboard-Sync reparieren + „gepinnt von"-Badge

**Datum:** 2026-06-21
**Status:** Design (genehmigt, vor Umsetzungsplan)
**Auslöser:** User-Wunsch „Pinboards synchen" analog zur bestehenden „Liste teilen"-Funktion.

## Zusammenfassung

Pins (und generell Live-Updates) synchronisieren nicht zwischen Usern, die sich eine
Liste teilen. Die Untersuchung hat ergeben, dass das **kein** Pinboard-spezifisches
Problem ist, sondern dass die **gesamte Supabase-Realtime-Synchronisation serverseitig
nie aktiviert wurde**. Der Fix ist eine kleine, nicht-destruktive Migration. Zusätzlich
bekommt jede Pin-Card ein Badge, das zeigt, **wer** einen Task angepinnt hat — sichtbar
nur bei fremden Pins.

## Root-Cause-Analyse (verifiziert gegen Produktions-DB)

Diagnose via Supabase Management API (`/database/query`) gegen Projekt `kniflzaljtychimboqcp`:

```json
{
  "realtime_publication_tables": null,
  "replica_identity": {
    "tasks": "default(PK only)",
    "lists": "default(PK only)",
    "list_shares": "default(PK only)"
  },
  "list_shares_count": 2,
  "pinned_tasks_total": 16
}
```

Publication-Details:
```json
"supabase_realtime": { "allTables": false, insert/update/delete/truncate: true }
"tables_in_any_publication": ["messages_2026_06_15", ... ]  // nur Supabase-interne realtime.messages-Partitionen
```

**Befund:** Die Publication `supabase_realtime` existiert, enthält aber **keine** der
App-Tabellen. `tasks` und `lists` wurden nie via `ALTER PUBLICATION ... ADD TABLE`
hinzugefügt. Der Client (`src/routes/app/+page.svelte`, Kanäle `v2-tasks-realtime` /
`v2-lists-realtime`) abonniert `postgres_changes` korrekt — aber serverseitig wird nichts
publiziert, also kommt **kein einziges Event** an.

**Warum „Liste teilen" trotzdem zu funktionieren scheint:** Beim Seitenladen lädt
`src/routes/app/+page.ts` via `from('tasks').select('*')` alle per RLS zugänglichen
Tasks (inkl. geteilter Listen). Geteilte Listen erscheinen also nach einem Reload —
aber nie live.

**Warum REPLICA IDENTITY relevant ist:** Laut Supabase-Doku filtert Realtime jedes Event
serverseitig gegen die RLS-SELECT-Policy des Subscribers. Für ein UPDATE/DELETE an einem
Task einer **geteilten** Liste muss die Policy `has_list_share(list_id)` ausgewertet
werden — dafür muss `list_id` im Replikations-Record stehen. Mit `REPLICA IDENTITY FULL`
ist das garantiert; mit `default` (nur PK) kann die Filterung das Event für den anderen
User verwerfen.

## Ziel

1. **Teil A — Realtime reaktivieren:** Live-Sync für `tasks` und `lists` funktioniert
   zuverlässig für alle zugreifenden User (eigene + geteilte Listen), inkl. Pin/Unpin.
2. **Teil B — Badge „gepinnt von …":** Pin-Cards zeigen den Pinner, aber nur wenn es
   **nicht** der aktuelle User ist.

## Nicht-Ziele (YAGNI)

- Kein neues Pinboard-Datenmodell (`pinboards` / `pinboard_shares`) — bewusst verworfen.
  Das Pinboard bleibt die abgeleitete Menge `tasks.filter(pinned && !done)`.
- Keine separate „Pin-Verwalten"-Berechtigung — Pin folgt der bestehenden Task-UPDATE-RLS
  (editor+ auf geteilten Listen).
- Kein Realtime auf `list_shares` (kein Live-Refresh des Share-Dialogs) — out of scope.
- Keine Migration der 16 bestehenden Pins: deren `pinned_by` bleibt NULL (kein Badge),
  bis sie das nächste Mal gepinnt werden. Akzeptiert.

## Teil A — Realtime-Publication (Migration 018)

`supabase/migrations/018_realtime_publication.sql`:

```sql
-- Aktiviert Supabase Realtime (postgres_changes) fuer die App-Tabellen.
-- Root Cause: Tabellen waren nie in der supabase_realtime Publication -> keine Live-Events.
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.lists;

-- REPLICA IDENTITY FULL: noetig, damit Realtime UPDATE/DELETE-Events an Tasks
-- geteilter Listen korrekt gegen RLS (has_list_share(list_id)) filtern kann.
alter table public.tasks replica identity full;
alter table public.lists replica identity full;
```

Eigenschaften: nicht-destruktiv, kein Datenverlust, sofort wirksam, reversibel
(`drop table from publication` / `replica identity default`).

**Rollout:** Nach Genehmigung anwenden über die Management API (`/database/query`) auf
Prod. Es existiert nur `main`/Prod.

## Teil B — `pinned_by`-Spalte + Badge (Migration 019)

`supabase/migrations/019_task_pinned_by.sql`:

```sql
alter table public.tasks
  add column if not exists pinned_by uuid references auth.users(id) on delete set null;
```

Keine RLS-Änderung nötig: `pinned_by` erbt die Task-Policies; Schreiben erfordert wie
bisher UPDATE-Recht (Owner oder editor+).

### Client-Änderungen

- **`src/lib/types/database.ts`** — `tasks` Row/Insert/Update um `pinned_by: string | null`.
- **`src/lib/stores/tasks.svelte.ts`**
  - `togglePin(id)`: beim Pinnen `pinned_by = userId`, beim Entpinnen `pinned_by = null`
    (optimistisch **und** im `updateTaskField`-Call).
  - `clearPinboard()`: `pinned_by = null` mitsetzen (optimistisch + `bulkUpdateField`).
- **`src/lib/components/v2/Pinboard.svelte`**
  - Neuer Prop `currentUserId: string`.
  - Badge nur rendern, wenn `task.pinned_by && task.pinned_by !== currentUserId`.
  - Anzeige von Name/Avatar über den bestehenden `profiles`-Store (derselbe Cache, der
    schon Sharing-Avatare liefert). Fallback: Initiale, wenn kein Profil geladen.
- **`src/routes/app/+page.svelte`** — `currentUserId` an `Pinboard` durchreichen; sicherstellen,
  dass die Profile der Mit-User (aus `list_shares`) im `profiles`-Store geladen sind.

## Datenfluss (nach Fix)

```
User A pinnt Task (geteilte Liste)
  -> togglePin: optimistic { pinned:true, pinned_by:A }
  -> updateTaskField -> UPDATE tasks ... (DB)
  -> Postgres WAL -> supabase_realtime Publication (NEU: enthaelt tasks)
  -> Realtime filtert pro Subscriber gegen RLS (REPLICA IDENTITY FULL liefert list_id)
  -> User B: postgres_changes UPDATE-Event
  -> handleRealtimeTask('UPDATE', new) -> tasks.map ersetzt Task
  -> Pinboard-Derivation zeigt Pin + Badge "gepinnt von A"
```

## Verifikation

1. **DB-Bestätigung (sofort):** Nach Migration 018 erneut `pg_publication_tables` /
   `pg_class.relreplident` abfragen — `tasks` & `lists` müssen in `supabase_realtime`
   stehen, `relreplident = 'f'`.
2. **Realtime-Roundtrip (End-to-End):** Temporäres Test-User-Paar via Admin-API anlegen,
   eine geteilte Liste + Task erzeugen, als User B eine Realtime-Subscription öffnen,
   als User A pinnen (UPDATE), prüfen dass User B das Event empfängt. Danach Testdaten
   wieder entfernen. Beweist die komplette Pipeline inkl. RLS-Filterung über `list_shares`.
3. **Teil B:** `npm run check` (TypeScript) grün; Badge erscheint bei fremdem `pinned_by`,
   nicht bei eigenem.

## Betroffene Dateien (Überblick)

| Datei | Änderung |
|-------|----------|
| `supabase/migrations/018_realtime_publication.sql` | NEU — Publication + REPLICA IDENTITY |
| `supabase/migrations/019_task_pinned_by.sql` | NEU — `pinned_by`-Spalte |
| `src/lib/types/database.ts` | `pinned_by` in tasks-Typen |
| `src/lib/stores/tasks.svelte.ts` | `togglePin`, `clearPinboard` setzen `pinned_by` |
| `src/lib/components/v2/Pinboard.svelte` | Badge-Rendering + `currentUserId`-Prop |
| `src/routes/app/+page.svelte` | `currentUserId` durchreichen, Profile-Vorladung |
