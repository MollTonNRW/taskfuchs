# TaskFuchs Funktions-Audit

**Datum:** 2026-03-17
**Auditor:** Code Review Agent (Opus 4.6)
**Grundlage:** Quelltextanalyse aller Hauptdateien, kein Laufzeittest

---

## 1. Feature-Status-Tabelle

### Core CRUD

| Feature | Status | Kommentar |
|---------|--------|-----------|
| Listen erstellen | OK | `createList` mit Positionsberechnung, Deduplizierung gegen Realtime |
| Listen umbenennen | WARNUNG | Inline-Edit (Doppelklick) funktioniert korrekt. Kontextmenu nutzt noch `prompt()` -- blockiert Main-Thread |
| Listen loeschen | OK | `confirmAction` (nicht-blockierend), Optimistic mit Rollback, loescht Tasks korrekt mit |
| Listen Icon aendern | OK | Icon-Picker mit 12 Standard-Emojis |
| Tasks erstellen (Quick-Add) | OK | FAB-Button immer sichtbar, Optimistic + Fingerprint-Duplikat-Schutz |
| Tasks bearbeiten (Inline-Edit) | OK | Doppelklick startet Edit, Enter speichert, Escape bricht ab |
| Tasks loeschen | OK | ConfirmDialog, Undo-Toast mit Reinsert-Logik |
| Unteraufgaben erstellen | OK | Inline-Input mit Auto-Scroll, bis zu 2 Ebenen tief |
| Unteraufgaben bearbeiten | OK | Klick auf Text startet Edit |
| Unteraufgaben loeschen | OK | Direkt ohne Confirm (angemessen fuer Subtasks) |
| Checkbox-Propagation (Parent -> Kinder) | WARNUNG | Parent auf done=true setzt Kinder korrekt. Aber: Reverse-Propagation (alle Kinder done -> Parent auto-done) fehlt -- nur visuelles `checkbox-invite` Pulsieren |
| Prioritaeten (4 Stufen) | OK | Priority-Bar click, PriorityPicker Popover, Kontextmenu-Submenu, Tastatur-Cycle |
| Fortschrittsbalken | OK | Auto-Berechnung aus Unteraufgaben (rekursiv), Fallback auf manuelle 4-Stufen. Progress 100% setzt auto-done |
| Optimistic Updates mit Rollback | WARNUNG | Konsistent implementiert. Aber: Bei `changeTaskProgress` mit `autoDone` wird DB-Update fuer Subtasks direkt via `sb.from('tasks')` gemacht statt ueber `crud.bulkUpdateField`, Rollback wuerde dann die Subtask-Updates nicht rueckgaengig machen |

### UI/UX

| Feature | Status | Kommentar |
|---------|--------|-----------|
| Mobile-First: Tabs / Side-by-Side | OK | `md:hidden` / `hidden md:flex` Breakpoint-Split |
| Dark/Light Mode + 4 Themes | OK | Theme-Store mit localStorage-Persistenz |
| Kontextmenu (Rechtsklick + 3-Punkt) | OK | Umfangreiches Menu mit Submenu-Unterstuetzung, Divider-spezifisches Menu |
| Fokus-Modus (Overlay) | OK | Alle Operationen durchgereicht, eigener EmojiPicker, Notiz-Textarea |
| Pinnwand | OK | D&D zum Pinnen, Unpin-Animation, Long-Press fuer Focus-Mode, "Alle loesen" |
| Drag & Drop (Tasks) | OK | HTML5 D&D + Touch D&D mit Ghost-Elementen, Off-by-one Fix implementiert |
| Drag & Drop (Subtasks) | OK | Cross-Parent-Moves unterstuetzt |
| Drag & Drop (Listen) | OK | Desktop D&D + Touch D&D |
| Suche (Ctrl+K) | OK | Filtert Tasks nach Text + Notiz, min. 2 Zeichen, max. 20 Ergebnisse |
| Sortierung (6 Modi) | OK | Position, Prioritaet, Name, Faelligkeit, Erstelldatum, Fortschritt. Persistiert in localStorage |
| Bulk-Aktionen | OK | Auswahl, Erledigt, Prioritaet, Verschieben, Loeschen. Nachkommen werden bei Move mitgenommen |
| Emoji pro Task | OK | Picker, Click zum Aendern, wird im FocusOverlay angezeigt |
| Notizen pro Task | OK | NotePopover und FocusOverlay-Textarea, gespeichert als null wenn leer |
| Spaltenbreite anpassbar | OK | Resize-Handle zwischen Spalten, min 280px / max 600px |
| Listen minimieren (Desktop) | OK | Schmale Icon-Spalte mit Titel vertikal, Task-Counter |

### Neue Features

| Feature | Status | Kommentar |
|---------|--------|-----------|
| Swipe Listen-Wechsel (Mobile) | OK | Touch-Events mit 50px Threshold horizontal, 30px vertical Guard |
| Aufgabe in Liste konvertieren | OK | Nur sichtbar wenn Task Unteraufgaben hat, erstellt neue Liste + migriert Subtasks |
| Alle Unteraufgaben loeschen (pro Task) | OK | Im Kontextmenu, zeigt Anzahl an |
| Alle Unteraufgaben loeschen (pro Liste) | OK | Im Listen-Kontextmenu |
| Undo-Toast bei Loeschen | OK | Task wird mit Subtasks per `reinsertTask`/`reinsertTasks` wiederhergestellt |
| Undo-Toast bei Abhaken | OK | `toggleTask` zeigt Undo-Toast nach done=true |
| Unteraufgaben ein-/ausklappen (pro Liste) | OK | `collapsedSubtasksListIds` Set, Toggle im Listen-Kontextmenu |
| Unteraufgaben ein-/ausklappen (Sidebar-Setting) | OK | `subtasksCollapsedByDefault` Store mit localStorage |
| Add-Button (FAB) immer sichtbar | OK | Am unteren Rand jeder ListPanel, sticky |
| ConfirmDialog (nicht-blockierend) | OK | Promise-basiert, Escape/Enter/Click |
| Fingerprint Duplikat-Erkennung | OK | `pendingFingerprints` Set: text + list_id + parent_id |
| Auto-Scroll bei neuer Unteraufgabe | OK | `scrollIntoView` nach `tick()` |

### Auth & Sharing

| Feature | Status | Kommentar |
|---------|--------|-----------|
| Google OAuth + Email/Passwort | OK | Login + Register Seiten, OAuth Callback Handler |
| Auth Guard | OK | `+layout.server.ts` mit `safeGetSession()` + redirect |
| Share-Dialog (Email-Lookup, Rollen) | OK | `lookup_user_by_email` RPC, Editor/Viewer Rollen, Remove + Change Role |
| RLS Policies | nicht geprueft | Nur Migrations-Dateien vorhanden, keine Laufzeit-Validierung moeglich |

### Sonstige Features (entdeckt waehrend Audit)

| Feature | Status | Kommentar |
|---------|--------|-----------|
| Trenner (Divider) | OK | Erstellen, Umbenennen (Inline + prompt), Loeschen, D&D mit Tasks |
| Task zuweisen | OK | Kontextmenu-Submenu mit Profilliste, Avatar-Badge am Task |
| Terminieren (Due Date) | OK | DatePicker via Kontextmenu, Anzeige als Badge |
| Listen duplizieren | WARNUNG | Sequentielle Inserts (N+1 Problem), keine Fehlerbehandlung fuer Teil-Fehler |
| Demo-Daten laden | OK | Seed bei erstem Login + manueller Button |
| Liste einklappen/zuklappen | OK | Per-Liste Toggle im Panel-Header |
| Erledigte Eintraege loeschen (pro Liste) | OK | Im Listen-Kontextmenu |
| Alle Aufgaben abhaken (pro Liste) | OK | Im Listen-Kontextmenu |
| Fixieren (Highlight) | OK | Verhindert Drag, orangener Glow-Pulse, Lock-Toast bei Click |
| Filter (Priority, View) | WARNUNG | Stores existieren und werden in `filteredTasksForList` genutzt, aber kein UI zum Aktivieren gefunden |

---

## 2. Gefundene Bugs

### BLOCKER (Muss behoben werden)

**B1: `prompt()` blockiert noch an 2 Stellen den Main-Thread**
- Datei: `/src/lib/composables/useContextMenus.svelte.ts` Zeile 80 und 95
- "Liste umbenennen" und "Trenner umbenennen" im Kontextmenu nutzen `prompt()`
- Da die Listen-Umbenennung per Doppelklick ein Inline-Edit hat und der Trenner ebenfalls Inline-Edit unterstuetzt, sind die `prompt()`-Aufrufe im Kontextmenu inkonsistent und blockierend
- Empfehlung: Kontextmenu-Action sollte `startRename()` aufrufen oder einen modalen Input-Dialog nutzen

**B2: Inkonsistenter Rollback bei `changeTaskProgress` mit autoDone**
- Datei: `/src/lib/stores/tasks.svelte.ts` Zeile 230-249
- Wenn `progress === 3` (100%), werden Subtasks via `sb.from('tasks').update({done:true}).eq('parent_id', id)` direkt aktualisiert statt ueber `crud.bulkUpdateField`
- Problem: Bei Fehler des Haupt-Updates wird `tasks = oldTasks` zurueckgesetzt, aber die direkte Subtask-DB-Mutation bleibt bestehen
- Zusaetzlich: Die direkte Supabase-Nutzung umgeht das CRUD-Layer

**B3: Undo nach Abhaken kann Race Condition mit Realtime verursachen**
- Datei: `/src/lib/stores/tasks.svelte.ts` Zeile 172-190
- `toggleTask` ruft bei `done=true` den Undo-Toast auf. Wenn der User auf Undo klickt, wird `toggleTask(id, false)` aufgerufen
- Zwischenzeitlich kann ein Realtime UPDATE-Event den Task-State ueberschreiben
- Der Undo-Callback referenziert die Task-ID korrekt, aber es gibt keinen Schutz gegen zwischenzeitliche Aenderungen durch andere Benutzer

### WARNUNG (Sollte behoben werden)

**W1: `+page.ts` laedt ALLE Tasks des Users ohne Filterung nach Listen-Zugehoerigkeit**
- Datei: `/src/routes/app/+page.ts` Zeile 14-16
- Die Query nutzt kein `.eq('user_id', ...)` -- sie verleast sich auf RLS
- Das ist funktional korrekt durch RLS, aber: Bei Shared-Listen werden ALLE Tasks geladen die der User sehen darf, auch aus Listen die nicht ihm gehoeren
- Bei vielen Shared-Listen koennte die initiale Payload gross werden

**W2: Filter-UI fehlt**
- Die Filter-Stores (`priorityFilters`, `viewFilters`, `timeframeFilters`) werden in `useSortFilter.svelte.ts` ausgelesen
- `timeframeFilters` wird im `filteredTasksForList` gar nicht angewendet
- Es gibt kein sichtbares UI-Element um diese Filter zu aktivieren (kein Button in der Toolbar oder Sidebar)
- Die Filter funktionieren nur programmatisch, nicht fuer den Endbenutzer

**W3: Trenner-Position bei Erstellung potentiell fehlerhaft**
- Datei: `/src/lib/composables/useContextMenus.svelte.ts` Zeile 66
- Beim Erstellen eines Trenners ueber das Listen-Kontextmenu wird `position = listTasks.length` gesetzt
- Das zaehlt aber ALLE Top-Level-Tasks (auch erledigte), was korrekt ist
- Beim Erstellen via Task-Kontextmenu (Zeile 172) wird `task.position + 1` verwendet, aber die nachfolgenden Tasks werden NICHT verschoben -- der Trenner bekommt dieselbe Position wie ein existierender Task

**W4: `duplicateList` hat N+1-Problem und keinen Transaktionsschutz**
- Datei: `/src/lib/stores/tasks.svelte.ts` Zeile 636-677
- Fuer jeden Task und Subtask wird ein einzelner Insert ausgefuehrt
- Bei Fehler mittendrin bleibt eine halbkopierte Liste zurueck
- Kein Rollback bei Teil-Fehler

**W5: `convertTaskToList` hat Timing-Problem**
- Datei: `/src/lib/stores/tasks.svelte.ts` Zeile 679-718
- Neue Tasks werden in der Schleife einzeln eingefuegt, dann erst der Original-Task geloescht
- Zwischen Insert und Delete kann ein Realtime-Event die neuen Tasks doppelt anzeigen
- Kein `pendingTaskIds`/`pendingFingerprints` Schutz fuer die kopierten Tasks

**W6: Bulk-Move zeigt alle Listen (inklusive der aktuellen)**
- Datei: `/src/lib/components/BulkToolbar.svelte` Zeile 58-59
- `{#each lists as l}` iteriert ueber ALLE Listen -- der User kann Tasks in ihre eigene Liste "verschieben"
- Das ist kein Bug im engeren Sinne (die Positionen werden aktualisiert), aber verwirrend fuer den User

**W7: FocusOverlay `noteText` wird nicht reaktiv aktualisiert**
- Datei: `/src/lib/components/FocusOverlay.svelte` Zeile 46
- `noteText` wird mit `task.note ?? ''` initialisiert, aber da es `$state` ist, wird es nicht aktualisiert wenn sich `task.note` aendert (z.B. durch Realtime-Update)
- Der User sieht den alten Notizentext bis er das Overlay schliesst und neu oeffnet

**W8: Subtask-Sortierung nicht garantiert**
- Datei: `/src/lib/components/ListPanel.svelte` Zeile 94-104
- `subtasksByParent` Map baut die Subtask-Arrays in Array-Reihenfolge auf, OHNE nach `position` zu sortieren
- Da die Tasks aus `filteredTasksForList` kommen (das nach position sortiert), funktioniert es zufaellig, aber nach einem Reorder-Event via Realtime koennte die Reihenfolge falsch sein

### NIT (Verbesserungsvorschlaege)

**N1: Zweifache Berechnung von Subtask-Counts**
- `TaskItem.svelte` berechnet `childrenByParent` aus `allTasks` und `ListPanel.svelte` berechnet `subtasksByParent` aus `tasks`
- Redundante Berechnung, sollte einmal berechnet und durchgereicht werden

**N2: Prioritaets-Konstanten in FocusOverlay dupliziert**
- Datei: `/src/lib/components/FocusOverlay.svelte` Zeile 52-54
- `priorityLabels`, `priorityColors`, `priorityOrder` werden lokal definiert statt aus `$lib/constants` importiert
- Das ist fragil bei Aenderungen

**N3: Suche durchsucht keine Unteraufgaben-Texte gezielt**
- Datei: `/src/routes/app/+page.svelte` Zeile 117-124
- `store.tasks.filter(...)` durchsucht ALLE Tasks (inklusive Subtasks), aber die Ergebnis-Anzeige zeigt Subtasks ohne ihren Parent-Kontext an

**N4: `deleteTaskDirect` ist ein Duplikat von `deleteTask` ohne Confirm**
- Datei: `/src/lib/stores/tasks.svelte.ts` Zeile 779-797
- Identische Logik wie `deleteTask` (Zeile 202-221), nur ohne `confirmAction`
- Sollte refactored werden: `deleteTask(id, skipConfirm: boolean)`

**N5: `loadUserData` in `supabase-crud.ts` filtert nach `user_id`**
- Datei: `/src/lib/services/supabase-crud.ts` Zeile 179-188
- Aber `+page.ts` filtert NICHT nach `user_id` -- die initiale Query haengt von RLS ab
- Inkonsistenz: `loadUserData` wuerde bei erneutem Laden nur eigene Tasks zeigen, die initiale Query auch Shared-Tasks

---

## 3. Code-Qualitaet

### Bewertung: 7.5 / 10

**Staerken:**
- Saubere Composable-Architektur mit `createSortFilter`, `createContextMenus`, `createPopovers`, `createShareDialog` -- gute Separation of Concerns
- Konsistentes Optimistic Update Pattern mit Rollback
- Fingerprint-basierte Duplikat-Erkennung fuer Realtime ist clever
- TypeScript-Typen durchgaengig aus der Datenbank-Definition abgeleitet
- ConfirmDialog als Promise-basierter Ersatz fuer `window.confirm` ist gut
- Undo-Toast mit Reinsert-Logik ist benutzerfreundlich
- Touch D&D als eigene Svelte Action ist gut gekapselt
- SubtasksByParent Map als Performance-Optimierung (statt O(n) filter pro Task)

**Schwaechen:**
- 2 verbleibende `prompt()`-Aufrufe (inkonsistent mit dem sonstigen nicht-blockierenden Ansatz)
- Filter-System ohne UI nutzlos
- Einige DB-Operationen umgehen das CRUD-Layer (z.B. `changeTaskProgress`)
- Keine Tests
- Duplizierter Code: `deleteTask`/`deleteTaskDirect`, Prioritaets-Konstanten in FocusOverlay
- N+1-Problem bei `duplicateList` und `convertTaskToList`

**Verbesserung seit letztem Review (7/10):**
- `confirm()` durch `confirmAction()` ersetzt (ausser prompt)
- `pendingTaskIds.has()` statt `.size > 0` (aus dem vorherigen Review als Bug gemeldet, jetzt korrekt)
- `activeListIndex` Bounds-Checking implementiert (Zeile 174-178)
- Composables reduzieren die God-Component erheblich (~660 Zeilen statt ~955)

---

## 4. Empfehlungen fuer die naechste Iteration

### Prioritaet Hoch
1. **`prompt()` eliminieren** -- Die 2 verbleibenden Stellen durch Inline-Edit oder den bestehenden ConfirmDialog-Ansatz ersetzen (Input-Dialog Variante)
2. **`changeTaskProgress` Rollback fixen** -- Subtask-Updates ueber CRUD-Layer laufen lassen, gesamten Rollback-Block anpassen
3. **Subtask-Sortierung garantieren** -- In `subtasksByParent` nach `position` sortieren

### Prioritaet Mittel
4. **Filter-UI bauen** -- Die vorhandenen Stores mit Buttons in der Toolbar verbinden, oder die Stores entfernen wenn nicht benoetigt
5. **Trenner-Position Fix** -- Bei Erstellung via Task-Kontextmenu nachfolgende Tasks nach hinten verschieben
6. **FocusOverlay `noteText` reaktiv machen** -- `$effect` nutzen um `noteText` bei Aenderung von `task.note` zu aktualisieren
7. **`duplicateList`/`convertTaskToList` robuster machen** -- Batch-Insert mit `.insert([...])` statt Schleife, Error-Handling fuer Teil-Fehler

### Prioritaet Niedrig
8. **FocusOverlay Konstanten-Import** -- `priorityLabels`/`priorityColors`/`priorityOrder` aus `$lib/constants` importieren
9. **`deleteTask`/`deleteTaskDirect` zusammenfuehren** -- Optionaler `skipConfirm`-Parameter
10. **Bulk-Move: Aktuelle Liste ausfiltern** -- Im BulkToolbar die Liste der aktuellen Auswahl ausschliessen
11. **Tests einfuehren** -- Zumindest fuer den Task-Store (`tasks.svelte.ts`) und die CRUD-Operationen

---

*Erstellt am 2026-03-17 durch automatisierte Quelltext-Analyse. Kein Laufzeittest durchgefuehrt.*
