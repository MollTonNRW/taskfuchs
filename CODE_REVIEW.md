# Code Review: TaskFuchs

**Datum:** 2026-03-16
**Reviewer:** Claude (automatisiertes Code-Review)
**Projekt:** TaskFuchs — Mobile-first Aufgabenverwaltung
**Stack:** SvelteKit 2 + Svelte 5 + Supabase + Tailwind CSS 4 + Cloudflare Pages

---

## Zusammenfassung

TaskFuchs ist eine gut strukturierte, funktionsreiche Aufgabenverwaltungs-App mit durchdachter Architektur. Der Code ist insgesamt sauber und konsistent. Es gibt jedoch einige Bereiche mit Verbesserungspotenzial in den Kategorien **Sicherheit**, **Fehlerbehandlung**, **Performance** und **Wartbarkeit**.

**Gesamtbewertung: 7/10** — Solide Basis mit einigen adressierbaren Schwachstellen.

---

## 1. Architektur & Struktur

### Positiv

- **Klare Trennung:** CRUD-Service (`supabase-crud.ts`), State-Management (`tasks.svelte.ts`), UI-Komponenten — gute Separation of Concerns
- **Svelte 5 Runes:** Konsequente Nutzung von `$state`, `$derived`, `$effect` im Task-Store
- **Optimistic Updates:** Konsistentes Pattern — lokaler State wird sofort aktualisiert, bei Fehler zurückgesetzt
- **Datenbankschema:** Sauberes Design mit Constraints, Indizes und RLS-Policies
- **Touch Drag & Drop:** Eigene Implementation (`touchDrag.ts`) mit Ghost-Elements, Auto-Scroll und Drop-Zone-Registry — durchdacht und funktional

### Verbesserungspotenzial

- **God-Component:** `+page.svelte` (955 Zeilen) übernimmt zu viele Verantwortlichkeiten — Context-Menüs, Suche, Bulk-Aktionen, Sort, Share-Dialog, Emoji-/Date-Picker, Keyboard-Shortcuts. Empfehlung: In Composables/Sub-Komponenten aufteilen.
- **Prop-Drilling:** `ListPanel.svelte` hat **22 Props** (davon 14 Callbacks). Das deutet auf fehlendes Dependency Injection hin. Ein Svelte Context oder ein Event-Bus würde die Schnittstelle vereinfachen.
- **Gemischtes State-Modell:** `tasks.svelte.ts` nutzt Svelte 5 Runes, aber `lists.ts`, `filters.ts`, `visibility.ts`, `profiles.ts` nutzen den alten `writable`-Store. Migration auf ein einheitliches Modell wäre empfehlenswert.

---

## 2. Sicherheit

### Positiv

- **Row Level Security:** Gründlich implementiert mit `SECURITY DEFINER`-Hilfsfunktionen zur Vermeidung von RLS-Rekursion (Migration 003)
- **Server-seitige Auth:** `hooks.server.ts` nutzt `getUser()` nach `getSession()` für sichere Token-Validierung
- **Keine Secrets im Code:** Umgebungsvariablen via `.env`, `.env.example` vorhanden

### Kritisch

- **`alert()` und `confirm()` für Fehler/Löschung:**
  - `tasks.svelte.ts:51` — `alert('Fehler beim Erstellen der Liste: ' + error.message)`
  - `tasks.svelte.ts:68` — `confirm('Liste wirklich löschen?')`
  - `tasks.svelte.ts:166` — `confirm('Aufgabe wirklich löschen?')`
  - **Problem:** `error.message` könnte benutzerkontrollierte Daten enthalten. Außerdem blockiert `alert()`/`confirm()` den Main-Thread. Empfehlung: Eigene Toast-/Dialog-Komponente verwenden.

- **Fehlende Input-Validierung auf Client-Seite:**
  - `+page.svelte:262` — `prompt()` wird direkt für Listenumbenennung verwendet, ohne Längenprüfung
  - Zwar gibt es `maxlength="500"` auf manchen Inputs, aber nicht überall konsistent
  - Supabase hat Constraints (Migration 002), aber Client-seitige Validierung fehlt weitgehend

- **`as any`-Casts bei Supabase Realtime:**
  - `+page.svelte:184` — `'postgres_changes' as any`
  - `+page.svelte:191` — gleicher Cast
  - **Problem:** Type-Safety wird umgangen. Besser: korrekte Typen aus `@supabase/supabase-js` importieren

- **`Record<string, unknown>` in CRUD:**
  - `supabase-crud.ts:46` — `updateTaskField(sb, id, fields: Record<string, unknown>)`
  - Erlaubt beliebige Felder — keine Compile-Time-Prüfung, ob die Felder tatsächlich existieren

---

## 3. Fehlerbehandlung

### Kritisch

- **Stille Fehler:** Viele Operationen loggen Fehler nicht und geben dem Benutzer keine Rückmeldung:
  - `tasks.svelte.ts:64` — `renameList`: Bei Fehler wird nur der State zurückgesetzt, kein Feedback
  - `tasks.svelte.ts:82` — `changeListIcon`: gleiches Problem
  - `tasks.svelte.ts:97` — `reorderList`: gleiches Problem
  - Insgesamt **~20 Funktionen** mit dem Pattern "bei Fehler → nur Rollback"

- **`deleteTaskDirect` ohne Error-Handling:**
  - `tasks.svelte.ts:657-661` — Fire-and-Forget ohne `await`, kein Fehler-Handling, kein Rollback
  ```typescript
  function deleteTaskDirect(id: string) {
      tasks = tasks.filter((t) => t.id !== id && t.parent_id !== id);
      crud.deleteTaskWithSubtasks(sb, id, subtaskIds); // kein await!
  }
  ```
  - Wenn der DB-Delete fehlschlägt, ist der Task lokal gelöscht aber existiert noch in der DB

- **`duplicateList` ohne vollständigen Rollback:**
  - `tasks.svelte.ts:567-608` — Wenn das Kopieren von Subtasks fehlschlägt, bleiben teilweise kopierte Tasks in der DB

- **OAuth-Callback:**
  - `+server.ts:8-9` — `exchangeCodeForSession` Fehler → Redirect, aber kein Logging
  - Fehlermeldung "callback_failed" ist generisch und nicht hilfreich für Debugging

### Empfehlungen

1. Zentrales Error-Handling-System (Toast-Benachrichtigungen) einführen
2. Logging-Framework für Server-seitige Fehler
3. `deleteTaskDirect` mit `await` und Rollback versehen

---

## 4. Performance

### Positiv

- **`$derived`-Nutzung:** Berechnete Werte wie `searchResults`, `visibleLists`, `subtaskCount` werden korrekt abgeleitet
- **`childrenByParent` Map:** `TaskItem.svelte:114-123` — Effiziente Vorberechnung der Eltern-Kind-Beziehungen

### Verbesserungspotenzial

- **N+1-Problem bei Reorder-Operationen:**
  - `supabase-crud.ts:31-35` — `reorderListDb`: Sequentielle Einzelupdates in einer Schleife
  - `supabase-crud.ts:74-80` — `bulkMoveToList`: Gleiches Problem
  - `supabase-crud.ts:87-94` — `reorderTasksDb`: Gleiches Problem
  - **Bei 20 Tasks = 20 DB-Requests.** Empfehlung: Supabase RPC-Funktion (Stored Procedure) für Batch-Updates

- **N+1 bei `duplicateList`:**
  - `tasks.svelte.ts:585-607` — Jeder Task wird einzeln eingefügt (`await` in Schleife)
  - Empfehlung: Batch-Insert mit `.insert([...array])`

- **`getSubtasks()` in `ListPanel.svelte:92-94`:**
  ```typescript
  function getSubtasks(parentId: string): Task[] {
      return tasks.filter((t) => t.parent_id === parentId);
  }
  ```
  - Wird für **jeden Task** in der Liste aufgerufen — O(n*m) Komplexität
  - Empfehlung: Vorberechnete Map wie in `TaskItem.svelte`

- **`filteredTasksForList` wird pro Render neu berechnet:**
  - `+page.svelte:164-174` — Normale Funktion statt `$derived`. Wird bei jedem Reactivity-Cycle für **jede sichtbare Liste** aufgerufen. Bei vielen Listen und Tasks könnte das teuer werden.

- **`ids.includes()` in Bulk-Operationen:**
  - `tasks.svelte.ts:337,345,352` — `ids.includes(t.id)` hat O(n) Lookup. Bei großen Auswahlen besser `Set` verwenden.

---

## 5. Wartbarkeit & Code-Qualität

### Positiv

- **TypeScript Strict Mode:** Aktiviert, saubere Typisierung über generierte DB-Typen
- **Konsistente Benennung:** Deutsche UI-Labels, englische Code-Bezeichner
- **Gute Kommentierung:** Wichtige Logik (Off-by-one-Fixes, Reorder-Algorithmus) ist kommentiert
- **Migrations:** Nummeriert und inkrementell — guter Ansatz

### Verbesserungspotenzial

- **Keine Tests:**
  - Kein einziger Unit-, Integration- oder E2E-Test vorhanden
  - Besonders kritisch für: Reorder-Logik, Optimistic Updates, Realtime-Handler, RLS-Policies
  - Empfehlung: Mindestens Tests für `tasks.svelte.ts` (Business-Logik) und `touchDrag.ts`

- **Duplizierter Code:**
  - `addTask` (103-119) und `addTaskAfter` (121-138) sind zu ~90% identisch
  - `toggleTask` (140-153) und `toggleSubtask` (311-316) — könnte eine Funktion sein
  - Optimistic-Update-Pattern wird ~25x manuell wiederholt — könnte als Helper abstrahiert werden

- **Magic Numbers:**
  - `TaskItem.svelte:88` — `setTimeout(clickTimer, 300)` — 300ms Double-Click-Threshold ohne Konstante
  - `touchDrag.ts:32-34` — `DRAG_THRESHOLD = 8`, `SCROLL_EDGE = 60`, `SCROLL_SPEED = 8` — gut benannt, als Vorbild
  - `+page.svelte:655` — `searchResults.slice(0, 20)` — max. 20 Ergebnisse, nicht konfigurierbar

- **Unused Imports:**
  - `supabase-crud.ts:3` — `Timeframe` wird importiert aber nie verwendet
  - `supabase-crud.ts:7` — `ListShare` wird importiert aber nicht direkt als Typ in einer Funktion benutzt

- **`version`-Feld nicht genutzt:**
  - Sowohl `lists` als auch `tasks` haben ein `version`-Feld für Optimistic Concurrency Control
  - Die `version` wird im DB-Trigger inkrementiert, aber **nie client-seitig geprüft**
  - Empfehlung: Entweder implementieren (`WHERE version = $expected`) oder entfernen

---

## 6. Realtime & Concurrency

### Problem: Race Conditions bei Optimistic Updates

- **Pattern:**
  ```typescript
  tasks = tasks.map(t => t.id === id ? {...t, done} : t);  // optimistisch
  const { error } = await crud.updateTaskField(sb, id, { done });
  if (error) tasks = oldTasks;  // rollback
  ```
- **Problem:** Wenn zwischen dem optimistischen Update und dem Rollback ein Realtime-Event eintrifft, wird der Rollback den Realtime-Update überschreiben.

### Problem: `pendingTaskIds` Tracking ist fragil

- `tasks.svelte.ts:639` — `if (pendingTaskIds.size > 0)` — prüft, ob **irgendein** Pending-ID existiert, nicht ob es die spezifische ist. Bei gleichzeitigem Anlegen mehrerer Tasks könnten Realtime-Events fälschlicherweise ignoriert werden.

### Empfehlungen

1. Versionsprüfung bei Updates einbauen (das `version`-Feld existiert bereits)
2. `pendingTaskIds.has(newTask.id)` statt `pendingTaskIds.size > 0` verwenden
3. Debouncing bei häufigen Updates (z.B. Drag & Reorder) in Betracht ziehen

---

## 7. UX & Accessibility

### Positiv

- **Keyboard-Shortcuts:** `Ctrl+K` für Suche, `/` für Schnellsuche, `Escape` für Schließen
- **Touch-Unterstützung:** Dediziertes Touch-D&D-System mit haptischem Feedback
- **PWA-fähig:** Service Worker, Manifest, TWA-Konfiguration

### Verbesserungspotenzial

- **Accessibility (a11y):**
  - Mehrere `svelte-ignore a11y_*` Kommentare in Komponenten — diese Warnungen sollten behoben statt ignoriert werden
  - `TaskItem.svelte:216-228` — `onclick` auf `<div>` ohne `role="button"` und `tabindex`
  - `ListPanel.svelte:268` — `oncontextmenu` auf einem nicht-interaktiven Element
  - Keine ARIA-Labels für Drag & Drop Zustände
  - Screen-Reader können die App vermutlich nicht sinnvoll bedienen

- **Error States:**
  - Kein visuelles Feedback bei fehlgeschlagenen Operationen (nur Console-Logs)
  - Keine Offline-Erkennung/-Benachrichtigung (obwohl Service Worker existiert)
  - Kein Loading-State bei langsamen Operationen (außer beim Seeding)

---

## 8. Spezifische Bugs & Risiken

### Bug: Sortierung instabil bei Dividers

- `+page.svelte:90-91` — `if (a.type === 'divider' || b.type === 'divider') return 0;`
- `return 0` bei Dividers bedeutet, die Sortierung ist nicht deterministisch für Divider. Bei bestimmten Sort-Modi könnten Divider ihre Position verlieren.

### Bug: `activeListIndex` out-of-bounds

- `+page.svelte:32` — `activeListIndex = 0`
- Wenn Listen gelöscht werden, wird `activeListIndex` nicht korrigiert
- `+page.svelte:833` — `store.lists[activeListIndex]` könnte `undefined` sein, wenn die aktive Liste gelöscht wurde
- **Fix:** `$effect` einbauen, der `activeListIndex` clampt

### Risiko: Inkonsistenter State bei Listwechsel + Subtask-Verschiebung

- `moveTaskToList` (246-266) verschiebt Nachkommen, aber `reorderTask` (386-470) filtert bei der Quell-Liste nur `!t.done`-Tasks für die Renummerierung. Erledigte Tasks behalten ihre alte Position → Positions-Lücken.

### Risiko: `position: 0.5` bei `addTaskAfter`

- `tasks.svelte.ts:124` — `position = afterTask.position + 0.5`
- Fractional Positions werden in der DB als `int` gespeichert (Migration: `position int`)
- Die DB schneidet den Dezimalteil ab → Position wird identisch mit dem vorherigen Task

---

## 9. Empfehlungen (priorisiert)

### Hoch (sollte zeitnah adressiert werden)

1. **Tests einführen** — mindestens für Business-Logik (`tasks.svelte.ts`) und Reorder-Algorithmen
2. **`deleteTaskDirect` fixen** — `await` hinzufügen, Error-Handling einbauen
3. **`pendingTaskIds.size > 0` durch `.has()` ersetzen** — verhindert Race-Condition bei parallelen Inserts
4. **`activeListIndex` bounds-checking** — `$effect` zur Korrektur nach Löschung
5. **`position: 0.5` Bug fixen** — bei `addTaskAfter` stattdessen nach dem Insert alle Positionen renummerieren
6. **Zentrale Fehler-Benachrichtigungen** — Toast-System statt `alert()`/`console.error()`

### Mittel (nächste Iteration)

7. **N+1-Queries auflösen** — Batch-Updates via Supabase RPC
8. **`+page.svelte` aufteilen** — Composables für Search, BulkActions, ContextMenu, etc.
9. **Props-Overhead reduzieren** — Svelte Context für Store-Zugriff in verschachtelten Komponenten
10. **`version`-Feld nutzen** — Optimistic Concurrency Control implementieren oder Feld entfernen
11. **a11y-Warnungen beheben** — korrekte ARIA-Rollen und Keyboard-Navigation

### Niedrig (langfristig)

12. **State-Modell vereinheitlichen** — alle Stores auf Svelte 5 Runes migrieren
13. **Code-Deduplizierung** — Optimistic-Update-Helper, zusammenführbare Task/Subtask-Operationen
14. **Offline-Unterstützung** — Dexie.js ist in der Architektur vorgesehen, aber nicht implementiert
15. **Error Logging** — Server-seitiges Logging-Framework (z.B. Sentry) integrieren

---

## Fazit

TaskFuchs ist eine beeindruckend funktionsreiche App für ein kleines Team/Soloprojekt. Die Architektur-Entscheidungen sind durchdacht (Optimistic Updates, Realtime, Touch-D&D, RLS-Security). Die Hauptrisiken liegen in fehlenden Tests, stillen Fehlern und einigen Race-Conditions im Realtime-Layer. Die oben genannten "Hoch"-Punkte sollten vor einem breiteren Rollout adressiert werden.
