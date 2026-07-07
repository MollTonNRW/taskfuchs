# Mobile-Fixes — Design-Spec

**Datum:** 2026-07-07 · **Branch:** `feature/mobile-fixes` (abgezweigt von `feature/pinboard-realtime-sync`)
**Scope:** 9 Mobile-UX-Fixes für die v2-App unter `/app`. Die „Sonderliste Einkaufsliste" ist **nicht** Teil dieses Specs (eigener Spec folgt).

## Kontext / Ist-Zustand

Befunde der Code-Exploration (6 parallele Read-Only-Analysen, 07.07.):

- Aufgaben-Umbenennen hat auf Mobile **keinen Pfad**: Das Task-Kontextmenü hat keinen Umbenennen-Eintrag (`src/lib/composables/v2/useContextMenus.svelte.ts:179-295`), der Inline-Edit in `TaskCard.svelte` ist toter Code (die `ondblclick`-Prop ist in der App immer gesetzt und öffnet den Fokus-Modus), und der Titel-Edit im Fokus-Overlay hängt an `dblclick` — auf Touch unzuverlässig.
- Long-Press auf der Task-Karte ist doppelt belegt: 300 ms armiert Touch-Drag (`src/lib/actions/touchDrag.ts`, ganze Karte ist Drag-Handle), ~500 ms feuert auf Android zusätzlich das native `contextmenu`-Event.
- Subtask-Umbenennen ist mobil unmöglich (nur `dblclick`, `SubtaskCard.svelte:45-53`); das definierte Subtask-Kontextmenü (`useContextMenus.svelte.ts:156-174`) ist aus der Listenansicht unerreichbar.
- Kontextmenü wird am Screenrand abgeschnitten: `.v2-context-menu` hat `max-height: 80vh` mit `overflow: visible` statt `overflow-y: auto` (`src/v2.css:1200-1213`); das Clamping-`$effect` in `ContextMenu.svelte:27-52` liest `y` nur im Overflow-Branch (Svelte-5-Dependency-Tracking → kein Re-Run bei bereits offenem Menü); Submenüs werden nur horizontal geklemmt.
- Listen-Tab-Long-Press schließt sofort: `handleTabTouchEnd` (`src/routes/app/+page.svelte:642-644`) ruft kein `preventDefault` → der emulierte Ghost-Click nach dem Loslassen trifft das Menü-Backdrop (`onclick={onclose}`, `ContextMenu.svelte:59-66`); bei längerem Halten schließt zusätzlich das native `contextmenu`-Event auf dem Backdrop. `ontouchmove` bricht den Long-Press ohne Bewegungs-Schwellwert ab.
- Neue Liste: einziger Einstieg ist der Sidebar-Button (`+layout.svelte:623`); der Rückgabe-Index von `store.createList()` wird verworfen (`+page.svelte:454-459`), kein Tab-Wechsel, kein Feedback. Bonus-Bug: `lastAddListSignal` startet bei Page-Remount bei 0, während das `v2Events`-Singleton den Zähler behält → Phantom-Liste.
- Header stapelt sich: `.v2-header` und `.v2-header-actions` nutzen `flex-wrap: wrap` (`v2.css:248/304/2150`); die Listen-Tab-Leiste löst dasselbe Problem korrekt mit `overflow-x: auto` (`v2.css:2169-2202`).
- 52 UI-Strings mit Ersatzschreibweisen (ae/oe/ue/ss) in 20 Dateien.
- Colorful-Theme: `[data-col]`-Regel legt 3 px `border-left` in Listenfarbe auf die Task-Karte (`v2.css:146-150`) — direkt neben der 3 px Priority-Bar (`::before`, `v2.css:910-926`) und mit denselben Farb-Tokens.
- Das Task-Menü hat bereits „Unteraufgaben löschen (N)" (`useContextMenus.svelte.ts:182-186`, ohne Undo); das Listen-Menü hat „Alle Unteraufgaben löschen" (mit 8-s-Undo).
- Fokus-Overlay (`FocusOverlay.svelte`): Notiz-Textarea vorhanden (Auto-Save bei blur/close); Emoji-Button **löscht** das Emoji statt einen Picker zu öffnen (`onclick={() => onUpdateEmoji(task.id, '')}`).

## Entscheidungen (User, 07.07.)

1. **Gesten:** Menü-Eintrag „Umbenennen" + einfacher Tap auf Karte öffnet Fokus-Modus; Long-Press bleibt exklusiv Drag; Doppeltap entfällt komplett.
2. **Auswählen:** wandert ins Task-Menü (startet Mehrfachauswahl mit der Aufgabe vorselektiert); Desktop behält den Header-Button.
3. **Fixieren (highlighted):** Feature **komplett entfernen** (Menü, Glow, Sortier-Bevorzugung, Filter, Daten-Reset).
4. **Notiz/Erledigt/Trenner:** aus dem Task-Menü entfernen (Desktop + Mobil); Notiz bleibt über den Fokus-Modus editierbar, Erledigt über die Checkbox, Trenner über das Listen-Menü.

## A — Gesten-Modell

Neue Belegung (Task-Karte, Mobile & Desktop):

| Geste | Aktion |
|---|---|
| Tap/Klick auf Checkbox | Abhaken |
| Tap/Klick auf Karte | Fokus-Modus öffnen; im Auswahl-Modus: Selektion togglen |
| Tap/Klick auf ⋮ | Task-Menü |
| Halten 300 ms + Ziehen | Drag & Drop (unverändert) |
| Rechtsklick (nur echte Maus) | Task-Menü |
| Horizontaler Swipe | Listenwechsel (unverändert) |

Umsetzung:

- `TaskCard.svelte`: Die `ondblclick`-Prop wird zu `onopen` umbenannt und von einem `onclick`-Handler auf der Karte aufgerufen; der `dblclick`-Handler und der tote Inline-Edit-Code entfallen. Interaktive Kinder (Checkbox, ⋮, Subtask-Zähler, Bulk-Checkbox) behalten `stopPropagation`. Click-Unterdrückung direkt nach einem Touch-Drag (kein versehentliches Öffnen nach Drop).
- Natives Long-Press-Kontextmenü unterdrücken: `-webkit-touch-callout: none; user-select: none;` auf `.v2-task-card` und `.v2-list-tab`; im `contextmenu`-Handler Touch-Quellen ignorieren (Erkennung über zuletzt gesehenes `pointerdown`/`touchstart` bzw. `pointerType`), sodass nur echte Maus-Rechtsklicks das Menü öffnen. Auf Touch öffnet das Menü ausschließlich der ⋮-Button.
- `SubtaskCard.svelte`: eigener ⋮-Button (mobil immer sichtbar, Desktop bei Hover — gleiches CSS-Muster wie `v2-task-menu-btn`) + `oncontextmenu` → bestehendes Subtask-Menü; `dblclick`-Edit ersetzt durch Tap/Klick auf den Text (öffnet Inline-Edit; Checkbox toggelt weiterhin separat).
- Subtask-Menü (`useContextMenus.svelte.ts:156-174`) wird aus `ListPanel`/`TaskCard` verdrahtet und bekommt „Umbenennen" (InputDialog, wie Listen-Rename).
- `FocusOverlay.svelte`: Titel-Edit per einfachem Klick/Tap (`onclick={startEdit}` statt `ondblclick`); Emoji-Button öffnet den EmojiPicker (statt Emoji zu löschen).

## B — Menüs: Reparatur + neue Einträge

Positionierung/Scrolling (`ContextMenu.svelte` + `v2.css`):

- `.v2-context-menu`: `max-height: calc(100dvh - 16px)` (bzw. `min(…, 80vh)`), `overflow-y: auto`, `overscroll-behavior: contain`.
- Clamping-Fix: Position wird beim Öffnen **und bei jeder x/y-Prop-Änderung** neu geklemmt (x/y unbedingt als Dependencies des `$effect` lesen, nicht nur im Overflow-Branch); Messung darf nicht während der Scale-Einblendeanimation verfälscht werden (Animation nur auf einem inneren Wrapper oder Messung via `offsetWidth/Height`).
- Submenüs (`.v2-context-submenu`): zusätzlich vertikales Clamping (Flip nach oben bzw. `max-height` + Scroll).
- Gleiche Kur (Scroll + Clamping-Dependency) für `NotePopover`, `DatePicker`, `EmojiPicker`, `PriorityPicker`, soweit betroffen.
- Backdrop-Härtung: Das Backdrop ignoriert Pointer-Events für ~350 ms nach dem Öffnen (Schutz gegen Ghost-Click/natives contextmenu direkt nach Long-Press-Öffnung).

Task-Menü — Einträge danach:

| Eintrag | Status |
|---|---|
| Neue Aufgabe darunter | bleibt |
| **Umbenennen** | **neu** (InputDialog, `store.updateTask`) |
| Unteraufgabe erstellen | bleibt |
| Unteraufgaben löschen (N) | bleibt, bekommt **8-s-Undo** (`undoableBulkDelete` statt Direkt-Delete) |
| **Auswählen** | **neu**: aktiviert Bulk-Modus, Aufgabe vorselektiert |
| In andere Liste / Priorität / Zeitrahmen / Zuweisen | bleiben (Submenüs) |
| An Pinnwand pinnen / lösen | bleibt |
| Terminieren | bleibt |
| Mit Symbol versehen | bleibt |
| Aufgabe löschen | bleibt |
| ~~Erledigt~~ / ~~Fixieren~~ / ~~Notiz hinzufügen~~ / ~~Trenner erstellen~~ | **entfernt** |

Listen-Menü: „Alle Unteraufgaben löschen" **entfernt**; Rest unverändert.

## C — Listen-Tabs & Neue Liste

Long-Press-Fix (`+page.svelte:626-647`):

- `handleTabTouchEnd`: `e.preventDefault()` wenn der Long-Press gefeuert hat (unterdrückt den emulierten Click).
- Natives `contextmenu` auf Tabs bei Touch unterdrücken (wie in A); der `oncontextmenu`-Handler bleibt für Maus-Rechtsklick.
- `ontouchmove`: Bewegungs-Schwellwert ~10 px statt Sofort-Abbruch.
- Backdrop-Härtung aus B fängt Restfälle ab.

Neue Liste:

- **„+"-Button am Ende der Tab-Leiste** (Mobile + Desktop) und im Scroll-View-Header.
- Nach `createList()`: `activeListIndex` auf die neue Liste setzen, Tab per `scrollIntoView` sichtbar machen, direkt den InputDialog „Liste benennen" öffnen (Vorbelegung „Neue Liste").
- Sidebar-Button bleibt, ruft danach `closeSidebar()` (Mobile).
- Phantom-Listen-Fix: `lastAddListSignal` beim Mount mit dem aktuellen `v2Events.addListSignal`-Stand initialisieren.
- Aufräumen (toter Code): ungenutzte `onListMenuClick`-Prop in `ListPanel.svelte`, `handleListMenuClick`/`[data-list-menu]`-Pfad in `+page.svelte`.

## D — Header (View-Tabs)

- `.v2-header-actions` (und mobile Overrides): `flex-wrap: nowrap` + `overflow-x: auto` + versteckte Scrollbar + `flex-shrink: 0`/`white-space: nowrap` auf den Buttons — identisches Muster wie `.v2-list-tabs`.
- „Auswählen"-Button: ab Desktop-Breakpoint (≥ 769 px) sichtbar, auf Mobile entfernt (Funktion steckt im Task-Menü).

## E — Umlaute

Alle 52 Fundstellen der Audit-Liste korrigieren (u. a. `useContextMenus.svelte.ts` 14×, `app/+layout.svelte` 13×, diverse `aria-label="Schliessen"`). Kopplung beachten: `gamification.svelte.ts` `RANKS` ist `as const` mit abgeleitetem Typ — Zeilen 13/32/36 konsistent ändern (`Anfänger`, `Großmeister`). `seed-data.ts`, `constants.ts`, `static/manifest.json` sind bereits sauber.

## F — Colorful-Theme

`v2.css:146-150` (3 px `border-left` in Listenfarbe auf `.v2-task-card`) ersetzen durch das Aurora-Muster (`v2.css:153-157`): Listen-Akzent als `border-top` auf dem `[data-col]`-Panel. Die linke Kartenkante gehört damit themeweit exklusiv der Priority-Bar.

## G — Fixieren (highlighted) komplett entfernen

- UI: Menü-Eintrag (`useContextMenus.svelte.ts:243-247`), Glow-Animation/CSS (`highlight-pulse`, zugehörige v2-Regeln), „Fixiert"-Filter in der Sidebar, Sortier-Bevorzugung (`useSortFilter.svelte.ts`: highlighted-zuerst) und Anzeige-Logik in `TaskCard`/Kanban.
- Store: `toggleHighlight` (`tasks.svelte.ts:305`) und zugehörige CRUD-Aufrufe entfernen; `highlighted`-Feld bleibt in den Typen (DB-Spalte bleibt bestehen).
- Migration `020_reset_highlighted.sql`: `UPDATE tasks SET highlighted = false WHERE highlighted;` — Daten-Reset, **kein** Spalten-Drop (Realtime/Types bleiben kompatibel, v1-Komponenten unberührt).
- v1-Komponenten (`src/lib/components/` ohne `v2/`) werden nicht angefasst.

## Fehlerbehandlung

Bestehendes Optimistic-Update-Muster (Snapshot → sofort → Server → Rollback bei Fehler) wird beibehalten; neue Menü-Aktionen (Umbenennen, Undo-Angleichung) nutzen die vorhandenen Store-Funktionen (`updateTask`, `undoableBulkDelete`). Keine neuen Fehlerpfade.

## Verifikation

1. `npm run check`, `npm run lint`, `npm run build`.
2. Manuelle End-to-End-Prüfung im Chrome mit Touch-Emulation (Pixel-Viewport): Task/Subtask/Liste umbenennen, Tab-Long-Press-Menü bleibt offen, Menü am unteren Screenrand scrollbar, Neue Liste über „+", Header einzeilig bei 360 px Breite, Colorful-Priority-Bar sichtbar, kein Glow mehr nach Fixieren-Entfernung, Drag & Drop weiterhin funktionsfähig.

## Out of Scope

- Sonderliste „Einkaufsliste" (eigener Spec; betrifft DB-Schema `lists.kind`, Task-Typ `category`, externe n8n-/Dashboard-Consumer).
- Touch-Drag für Subtasks und Pinnwand (heute nur Maus-D&D) — bewusst nicht Teil dieses Pakets.
- Refactoring der God-Component `+page.svelte`.
