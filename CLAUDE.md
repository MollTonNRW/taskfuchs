# TaskFuchs — Projekt-Referenz

Diese Datei dokumentiert Architektur, Komponenten und Konventionen von TaskFuchs für Mitwirkende und KI-Assistenten, die mit dem Code arbeiten.

Eine User-orientierte Kurzbeschreibung steht in [README.md](README.md). Setup-Schritte ebenfalls dort.

## Projekt-Überblick

TaskFuchs ist eine Multi-User Task-Management-App (Mobile-First PWA + Android APK). Interaktive Checklisten mit Unteraufgaben, Prioritäten, Zeitrahmen, Fortschrittsbalken und Animationen bei allen Interaktionen.

- **Zielgruppe:** Familien, WGs, kleine Teams — Einkaufslisten, Putzpläne, gemeinsame Aufgaben
- **Plattformen:** Web (PWA) + Android (TWA)

## Tech-Stack

| Kategorie | Technologie | Version |
|-----------|-------------|---------|
| Framework | SvelteKit 2 + Svelte 5 | svelte ^5.51, @sveltejs/kit ^2.50 |
| Styling | Tailwind CSS 4 + daisyUI 5 | tailwindcss ^4.2, daisyui ^5.5 |
| Backend | Supabase (PostgreSQL, Auth, Realtime) | @supabase/supabase-js ^2.99, @supabase/ssr ^0.9 |
| Hosting | Cloudflare Pages | @sveltejs/adapter-cloudflare ^7.2 |
| Build | Vite 7 | vite ^7.3 |
| Sprache | TypeScript (strict mode) | ^5.9 |
| Linting | ESLint + Prettier + svelte-check | eslint ^10, prettier ^3.8 |
| Mobile | TWA (Trusted Web Activity) | Gradle-Projekt unter `android/` |

### Nicht implementiert (geplant)
- Offline-Cache: Dexie.js (IndexedDB) — in Architektur vorgesehen, noch nicht gebaut
- Service Worker Sync: Workbox — SW existiert, kein Offline-Sync
- Push Notifications

## Projektstruktur

```
.
├── .github/workflows/
│   └── deploy.yml                  # GitHub Actions → Cloudflare Pages
├── android/                        # TWA Build (Gradle, Keystore-Referenz, APK)
├── prototype/                      # HTML-Prototyp-Snapshots (v1–v5)
├── supabase/migrations/            # DB Migrations (chronologisch)
├── static/
│   ├── icons/                      # PWA Icons (48–512px)
│   ├── manifest.json               # PWA Manifest
│   ├── .well-known/                # Digital Asset Links (TWA)
│   └── _headers                    # CSP + Security Headers
├── src/
│   ├── app.css                     # ~750 Zeilen: Animationen, Themes, Layout
│   ├── app.html                    # HTML Shell (viewport-fit=cover, iOS)
│   ├── hooks.server.ts             # Supabase SSR Auth Middleware
│   ├── service-worker.ts           # Basic Service Worker (Cache)
│   ├── v2.css                      # ~2200 Zeilen: v2-Styles
│   ├── lib/
│   │   ├── components/             # UI-Komponenten (v1)
│   │   ├── components/v2/          # v2-Komponenten (28 Stück)
│   │   ├── composables/v2/         # v2-Composables
│   │   ├── stores/                 # State Management
│   │   ├── stores/v2/              # v2-Event-Bus & Stores
│   │   ├── services/               # Supabase CRUD Service
│   │   ├── actions/                # Svelte Actions (Touch D&D)
│   │   ├── types/                  # TypeScript DB-Typen
│   │   ├── constants.ts            # Priority/Timeframe Labels + Colors
│   │   └── seed-data.ts            # Demo-Daten für neue User
│   └── routes/
│       ├── +layout.svelte/ts       # Root Layout + Supabase Client Init
│       ├── +page.svelte            # Landing (→ /app oder /auth/login)
│       ├── app/                    # Hauptbereich (Listen, Tasks, alle Features)
│       ├── auth/                   # Login, Register, OAuth Callback
│       └── api/seed/+server.ts     # Demo-Seed Endpoint (POST)
├── .env.example                    # Template für Supabase-Credentials
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## v2 (aktive Version)

v2 ist die aktive Produktionsversion unter `/app`.

| Eigenschaft | Wert |
|---|---|
| Route | `/app` |
| Hauptseite | `src/routes/app/+page.svelte` |
| Layout/Header | `src/routes/app/+layout.svelte` |
| Komponenten | `src/lib/components/v2/` (28 Stück) |
| Composables | `src/lib/composables/v2/` |
| Event-Bus | `src/lib/stores/v2/events.svelte.ts` |
| Styles | `src/v2.css` (~2200 Zeilen) |

### View-Modi (Header-Toggle in +layout.svelte)
- `list` — Einzelne Liste mit Tab-Navigation (Default)
- `kanban` — Kanban-Board (Offen/In Arbeit/Erledigt)
- `scroll` — Alle Listen nebeneinander, horizontal scrollbar

## Komponenten-Übersicht

### Seiten / Routes

| Datei | Beschreibung |
|-------|-------------|
| `routes/+page.svelte` | Landing: Redirect zu /app (eingeloggt) oder /auth/login |
| `routes/app/+page.svelte` | Hauptseite (~955 Zeilen): Listen-Tabs (Mobile) / Side-by-Side (Desktop), Suche (Ctrl+K), Bulk-Aktionen, Sort, Kontextmenü, Keyboard Shortcuts, Realtime Subscriptions |
| `routes/app/+layout.svelte` | App Shell: Header mit Theme-Picker, Dark/Light Toggle, Sidebar (zusammenklappbar), Logout |
| `routes/auth/login/+page.svelte` | Login: Email/Passwort + Google OAuth |
| `routes/auth/register/+page.svelte` | Registrierung: Email/Passwort + Google OAuth, Passwort min. 8 Zeichen |
| `routes/auth/callback/+server.ts` | OAuth Callback: Code → Session Exchange |
| `routes/api/seed/+server.ts` | POST Endpoint: Demo-Listen + Tasks für neue User |

### UI-Komponenten (`src/lib/components/`)

| Komponente | Zeilen | Beschreibung |
|-----------|--------|-------------|
| `ListPanel.svelte` | ~650 | Listen-Container: Header, Quick-Add Input, Task-Liste, Erledigt-Bereich (klappbar), Column Resize. 22 Props (14 Callbacks) |
| `TaskItem.svelte` | ~520 | Einzelne Aufgabe: Checkbox (animiert), Priority-Bar, Inline-Edit, Emoji, Fortschrittsbalken, Subtask-Counter, Kontextmenü-Button, D&D Handles |
| `SubtaskItem.svelte` | ~280 | Unteraufgabe: Checkbox, Inline-Edit, D&D Handle, Priority Badge |
| `FocusOverlay.svelte` | ~300 | Modal-Overlay: Aufgabe zentriert mit Blur-Backdrop, interaktive Unteraufgaben, Emoji/Priority/Timeframe editierbar |
| `Pinboard.svelte` | ~210 | Pinnwand oben: Angepinnte Tasks als Cards, D&D zum Pinnen/Entpinnen, klappbar |
| `ContextMenu.svelte` | ~100 | Rechtsklick-Menü: Löschen, Priorität, Zeitrahmen, Unteraufgabe, Trenner, Verschieben, Emoji, Fixieren |
| `ShareDialog.svelte` | ~160 | Listen teilen: Email-Lookup, Rolle (Owner/Editor/Viewer), Mitglieder verwalten |
| `EmojiPicker.svelte` | ~50 | Emoji-Grid (8 Spalten), position: fixed, animiert |
| `PriorityPicker.svelte` | ~60 | Inline-Dropdown: 4 Prioritätsstufen |
| `DatePicker.svelte` | ~70 | Datum + Uhrzeit Picker für Fälligkeitsdatum |
| `NotePopover.svelte` | ~50 | Notiz-Sprechblase pro Aufgabe |
| `ToastContainer.svelte` | ~45 | Toast-Benachrichtigungen |

### Stores (`src/lib/stores/`)

| Store | Typ | Beschreibung |
|-------|-----|-------------|
| `tasks.svelte.ts` | Svelte 5 Runes (~750 Zeilen) | Haupt-Store: Listen + Tasks CRUD, Optimistic Updates, Realtime Handler, Reorder, Bulk-Ops, Duplicate, Share — erstellt via `createTaskStore()` |
| `filters.ts` | writable | Aktive Filter: Priorität, Zeitrahmen, Highlight, Termin |
| `lists.ts` | writable | Listen-Array (Legacy, wird durch tasks.svelte.ts ersetzt) |
| `profiles.ts` | writable | User-Profile Cache für Sharing-Avatare |
| `theme.ts` | writable/derived | Theme-Preset (minimal/colorful/neon/aurora), Dark Mode, localStorage Persistenz |
| `toast.ts` | Store | Toast-Notifications (success/error/info) |
| `visibility.ts` | writable | Sichtbarkeit einzelner Listen |

### Services & Actions

| Datei | Beschreibung |
|-------|-------------|
| `services/supabase-crud.ts` | Alle Supabase DB-Operationen: Insert/Update/Delete für Lists, Tasks, Subtasks. Reorder, BulkMove, DuplicateList, Share-Lookup |
| `actions/touchDrag.ts` | Svelte Action für Touch Drag & Drop: Ghost-Element, Auto-Scroll, Drop-Zone Registry, Threshold (8 px) |
| `types/database.ts` | Generierte TypeScript-Typen für Supabase DB |
| `constants.ts` | Priority Labels/Colors/Weights, Timeframe Labels, Progress Labels, Sort Labels |
| `seed-data.ts` | Demo-Daten: 3 Listen mit Beispiel-Tasks |

## Backend / Supabase

### Tabellen

| Tabelle | Primär-Felder | Zweck |
|---------|---------------|-------|
| `profiles` | id (FK auth.users), username, display_name, avatar_url | User-Profile, auto-erstellt bei Signup via Trigger |
| `lists` | id, user_id, title, icon, position, visible, version | Aufgabenlisten pro User |
| `tasks` | id, list_id, user_id, parent_id, text, type, done, priority, timeframe, progress, position, emoji, note, due_date, highlighted, pinned, assigned_to, version | Unified: Tasks + Unteraufgaben + Trenner (via parent_id + type) |
| `list_shares` | id, list_id, user_id, role (owner/editor/viewer) | Multi-User Sharing |

### Design-Entscheidungen
- **Unified Tasks-Tabelle:** Tasks, Unteraufgaben und Trenner in einer Tabelle (via `parent_id` + `type`)
- **parent_id = null:** Top-Level Task oder Divider
- **parent_id = task_id:** Unteraufgabe (1 Ebene implementiert)
- **version-Feld:** Existiert für Optimistic Concurrency Control, wird aktuell client-seitig nicht geprüft
- **RLS:** Aktiv auf allen Tabellen, Owner-Isolation + Sharing via list_shares

### Migrations

| Nr | Datei | Inhalt |
|----|-------|--------|
| 001 | `initial_schema.sql` | Alle Tabellen, RLS Policies, Auto-Profile Trigger, Indizes |
| 002 | `input_length_constraints.sql` | CHECK Constraints: title ≤100, text ≤500, note ≤5000 |
| 003 | `fix_rls_recursion.sql` | SECURITY DEFINER Hilfsfunktionen gegen RLS-Rekursion |
| 004 | `due_date_to_text.sql` | due_date Spalte zu Text-Typ ändern |
| 005 | `add_assigned_to.sql` | assigned_to Spalte für User-Zuweisung |
| 006 | `lookup_user_by_email.sql` | RPC-Funktion: User-ID per Email nachschlagen (für Sharing) |

### Auth
- Google OAuth + Email/Passwort (Supabase Auth)
- Passwort-Mindestlänge: 8 Zeichen
- Server-seitige Validierung: `hooks.server.ts` nutzt `getUser()` nach `getSession()`
- OAuth Callback: `/auth/callback` → Code-Exchange
- Supabase Anon Key ist öffentlich (RLS schützt), Service Role Key **nie** im Frontend

### Realtime
- Supabase Realtime Subscriptions auf `lists` und `tasks` Tabellen
- Pattern: `postgres_changes` Channel mit INSERT/UPDATE/DELETE Events
- Duplikat-Schutz via `pendingTaskIds` Set (bekanntes Problem: `.size > 0` statt `.has()`)

## Feature-Liste (implementiert)

### Core
- [x] Listen CRUD (Erstellen, Umbenennen inline, Löschen, Icon-Picker)
- [x] Tasks CRUD (Quick-Add, Inline-Edit per Doppelklick, Löschen, Abhaken)
- [x] Unteraufgaben (1 Ebene, standardmäßig eingeklappt)
- [x] Checkbox-Propagation (Eltern → Kinder) + Reverse Propagation
- [x] Prioritäten: 4 Stufen (Low/Normal/High/ASAP) mit Farbcodierung
- [x] Zeitrahmen: 4 Stufen (Akut/Zeitnah/Mittelfristig/Langfristig)
- [x] Fortschrittsbalken: 4 Stufen (0/33/66/100 %)
- [x] Supabase Realtime (Live-Updates)
- [x] Optimistic UI Updates

### UI/UX
- [x] Mobile-First: Tabs (Mobile) / Side-by-Side (Desktop)
- [x] Dark/Light Mode
- [x] 4 Theme-Presets: Minimal, Colorful, Neon, Aurora
- [x] Zusammenklappbare Seitenleiste
- [x] Kontextmenü (Rechtsklick / Long-Press)
- [x] Fokus-Modus (Klick auf Task → Overlay mit Blur-Backdrop)
- [x] Pinnwand (Tasks oben anpinnen per D&D)
- [x] Drag & Drop: Tasks, Unteraufgaben, Listen, Pinnwand
- [x] Touch Drag & Drop (eigene Implementation mit Ghost-Elements)
- [x] Suche (Ctrl+K / Cmd+K)
- [x] Sortierung: 6 Modi
- [x] Bulk-Aktionen (Mehrfachauswahl)
- [x] Emoji-Vergabe pro Task
- [x] Notizen/Sprechblase pro Task
- [x] Spaltenbreite per Drag anpassbar
- [x] Erledigt-Bereich klappbar mit Separator
- [x] iOS Safe Area + viewport-fit=cover
- [x] Sticky Mobile Tab-Leiste mit backdrop-blur
- [x] Keyboard Shortcuts

### Auth & Sharing
- [x] Google OAuth + Email/Passwort
- [x] User-Profile (automatisch bei Signup)
- [x] Share-Dialog (Email-Lookup, Rollen: Owner/Editor/Viewer)
- [x] Demo-Seed für neue User

### Geplant
- [ ] Offline-Cache (Dexie.js)
- [ ] Volltextsuche über alle Tasks
- [ ] Wiederkehrende Aufgaben
- [ ] Push Notifications
- [ ] Mehrstufige Unteraufgaben (beliebig tief)
- [ ] Gamification (Streaks, Konfetti)
- [ ] Brain-Dump Import
- [ ] Filter in Seitenleiste

## Animations-System

Zweistufig: **CSS Keyframes** (in `app.css`) für komplexe, mehrstufige Animationen und **Svelte Transitions** für einfache Ein-/Ausblendungen.

### CSS Keyframes (25 Animationen in app.css)

| Animation | Keyframe | Beschreibung | Timing |
|-----------|----------|-------------|--------|
| Soft Drop | `task-slide-in` | Neue Task erscheint: translateY(-12px) → bounce → settle | 0.4s cubic-bezier(.34,1.56,.64,1) |
| Swipe Away | `task-slide-out` | Task löschen: translateX(0→120px) + max-height collapse | 0.4s ease |
| Satisfaction Shrink | `check-pop` | Checkbox Pop-Effekt bei Abhaken | 0.35s spring |
| Checkmark Draw | `draw-check` | SVG Pfad-Animation (stroke-dashoffset) | 0.3s ease |
| Card Check | `task-check` | Task-Karte schrumpft + verblasst | 0.5s ease |
| Card Uncheck | `task-uncheck` | Task-Karte expandiert bei Rückgängig | 0.35s spring |
| Highlight Pulse | `highlight-pulse` | Fixierte Tasks: Pulsierender Glow (orange) | 3s infinite |
| ASAP Blink | `asap-pulse` | ASAP-Priority: Roter Glow-Pulse | 2.5s infinite |
| Magnet Snap | `pin-card-in` | Pin-Card erscheint: scale + bounce | 0.45s spring |
| Pin Glow | `pin-glow` | Orangener Glow nach Pin-Aktion | 0.6s ease |
| Pin Exit | `pin-card-out` | Pin-Card verschwindet | 0.3s ease |
| Breathing Space | `idle-float` | Leere Liste: Sanftes Schweben | infinite |
| Idle Pulse | `idle-fade-pulse` | Leere Liste: Sanftes Pulsieren | infinite |
| Progress Shimmer | `progress-shimmer` | 100 % Fortschritt: Schimmernder Gradient | infinite |
| Priority Pulse | `priority-pulse` | Priority-Bar Klick: scaleY + brightness | einmalig |
| Emoji Wobble | `emoji-wobble` | Emoji-Button Hover: Wackeln | einmalig |
| Quick-Add Press | `quick-add-press` | Add-Button Drück-Effekt | einmalig |
| Checkbox Invite | `checkbox-invite` | Alle Subtasks erledigt: Grüner Pulse | 2s infinite |
| Fade In/Out | `fade-in`, `fade-out` | Generisches Ein-/Ausblenden | 0.25–0.3s |
| Scale In | `scale-in` | Skaliertes Einblenden | 0.3s spring |
| Theme Fade | `theme-fade` | Theme-Wechsel: blur + opacity | 0.4s |
| Context Menu In | `context-menu-in` | Kontextmenü-Einblendung | 0.2s spring |
| Note Pop In | `note-pop-in` | Notiz-Popover erscheint | 0.25s spring |
| Move Up | `move-up` | Task wird verschoben: Opacity-Flash | 0.4s spring |

### Svelte Transitions
- `slide` — Subtask-Bereich ein-/ausklappen
- `fade` — Listen-Wechsel auf Mobile (via `{#key}` Block)
- `animate:flip` — Reorder-Animation bei D&D

### CSS Utility-Klassen
```css
.task-enter    /* task-slide-in */
.task-exit     /* task-slide-out */
.task-check    /* task-check */
.task-uncheck  /* task-uncheck */
.fade-in       /* fade-in */
.scale-in      /* scale-in */
.pin-card      /* pin-card-in + pin-glow */
.asap-blink    /* asap-pulse infinite */
```

## Design-System

### Theme-Architektur
- 4 Presets: Minimal, Colorful, Neon, Aurora
- Dark/Light Toggle: Minimal + Colorful unterstützen beide Modi; Neon + Aurora erzwingen Dark
- CSS Custom Properties: Alle Themes nutzen `--tf-*` Variablen
- Per-Liste Farben: Colorful + Aurora haben `[data-col="0-4"]`-basierte Gradient-Backgrounds
- Persistenz: Theme + Dark-Mode in localStorage (`tf-preset`, `tf-dark`)
- DaisyUI: `data-theme="light"/"dark"` auf `<html>` für Basis-Utilities

### CSS Custom Properties (`--tf-*`)
```
--tf-bg              Seiten-Hintergrund
--tf-surface         Karten/Panel-Hintergrund
--tf-surface-hover   Hover-State
--tf-border          Standard-Rahmenfarbe
--tf-text            Primäre Textfarbe
--tf-text-secondary  Sekundäre Textfarbe
--tf-text-muted      Dezente Textfarbe
--tf-header-bg       Header-Hintergrund
--tf-header-border   Header-Rahmen
--tf-input-bg        Input-Hintergrund
--tf-input-border    Input-Rahmen
--tf-accent          Akzentfarbe
--tf-accent-gradient Akzent-Gradient
```

### Prioritäts-Farben
| Stufe | Farbe | Badge |
|-------|-------|-------|
| Low | `#22c55e` (grün) | bg-green-50, text-green-600 |
| Normal | `#eab308` (gelb) | bg-yellow-50, text-yellow-600 |
| High | `#ef4444` (rot) | bg-red-50, text-red-600 |
| ASAP | `#dc2626` (dunkelrot) | bg-red-500, text-white |

### Fortschritts-Farben
| Stufe | Prozent | Farbe |
|-------|---------|-------|
| 0 | 0 % | transparent |
| 1 | 33 % | blau (#3b82f6) |
| 2 | 66 % | gelb (#f59e0b) |
| 3 | 100 % | grün (#22c55e) |

## Bekannte Probleme / offene Punkte

Aus dem letzten Code-Review (Bewertung 7/10):

**Hoch:**
1. `deleteTaskDirect` — Fire-and-Forget ohne `await`, kein Rollback bei DB-Fehler
2. `pendingTaskIds.size > 0` statt `.has()` — Race Condition bei parallelen Inserts
3. `activeListIndex` — kein Bounds-Checking nach Listen-Löschung
4. `addTaskAfter` position 0.5 — wird als int abgeschnitten, identische Position
5. `alert()`/`confirm()` — blockiert Main-Thread

**Mittel:**
6. N+1-Queries bei Reorder-Operationen
7. `routes/app/+page.svelte` ist God-Component (955 Zeilen)
8. `ListPanel` hat 22 Props — fehlendes DI
9. `version`-Feld existiert aber wird nie client-seitig geprüft
10. Gemischtes State-Modell: tasks.svelte.ts (Runes) vs. andere (writable)
11. Accessibility: Mehrere `svelte-ignore a11y_*`, fehlende ARIA-Labels

**Niedrig:**
12. Keine Tests (Unit, Integration, E2E)
13. Code-Duplikation (Optimistic-Pattern wird ~25× wiederholt)
14. Unused Imports in supabase-crud.ts
15. Kein Offline-Support (Dexie.js geplant)

### Race Conditions
- Realtime-Event zwischen Optimistic Update und Rollback kann zu inkonsistentem State führen
- Divider-Sortierung nicht deterministisch (`return 0` in Sortierfunktion)

## Deployment-Pipeline

### GitHub Actions (`.github/workflows/deploy.yml`)
```
Trigger: push auf main
Steps:
1. checkout
2. Node.js 20 setup
3. npm ci
4. npm run build (mit PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY aus Secrets)
5. wrangler pages deploy .svelte-kit/cloudflare
```

### Secrets (alle als GitHub Secrets gespeichert)
- `CLOUDFLARE_API_TOKEN`
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

### Branches
| Branch | Zweck |
|--------|-------|
| `main` | Production (Auto-Deploy via GitHub Actions) |

### Build-Befehle
```bash
npm run dev          # Lokaler Dev-Server (Vite, Port 5173)
npm run build        # Production Build
npm run preview      # Production Preview
npm run check        # svelte-check + TypeScript
npm run lint         # ESLint
npm run format       # Prettier
```

## Umgebungsvariablen

### `.env` (lokal, nicht in Git — siehe `.env.example`)
```
PUBLIC_SUPABASE_URL=https://<dein-projekt>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<dein-anon-key>
```

### Zugriff im Code
- **Client-seitig:** `$env/static/public` (PUBLIC_* Variablen)
- **Server-seitig:** `$env/static/private` (für Secrets, aktuell nicht genutzt)
- Service Role Key wird **nur** in n8n verwendet, **nie** im Frontend

## Mobile App (TWA)

### Konfiguration
- **Typ:** Trusted Web Activity (Chrome Custom Tab, kein nativer Code)
- **Gradle-Projekt:** `android/` (Standalone)
- **Keystore:** Referenz unter `android/`, Keystore-Datei wird nicht eingecheckt (gitignored)
- **Digital Asset Links:** `static/.well-known/assetlinks.json`

### PWA Manifest
- `display: standalone`
- `start_url: /app`
- `theme_color: #f97316` (Orange)
- `lang: de`
- Icons: 48 px bis 512 px (PNG) + SVG

## Security-Zusammenfassung

### Kernprinzipien
- **RLS ist die zentrale Sicherheitsschicht** — jede Tabelle hat RLS + Policies
- **Service Role Key nie im Frontend** — nur in n8n
- **Kein `{@html}` mit User-Daten** — Svelte escaped automatisch
- **CSP + Security Headers** in `static/_headers`
- **Input-Validierung:** PostgreSQL Constraints + Frontend `maxlength` (dreifach)
- **DSGVO:** Supabase EU Frankfurt, Daten bleiben in der EU

### Offene Security-Punkte
- `alert(error.message)` könnte User-kontrollierte Daten zeigen
- `as any` Casts bei Realtime-Subscriptions umgehen Type-Safety
- `Record<string, unknown>` in CRUD erlaubt beliebige Felder
- Kein Offline-Sync Security (noch nicht implementiert)

## Entwicklungshinweise

### Svelte 5 Runes vs. Legacy Stores
- `tasks.svelte.ts` nutzt **Svelte 5 Runes** (`$state`, `$derived`, `$effect`)
- Alle anderen Stores nutzen **Legacy writable/derived**
- Bei neuen Features: Runes bevorzugen

### Optimistic Update Pattern
```typescript
const old = tasks; // Snapshot
tasks = tasks.map(t => t.id === id ? {...t, ...changes} : t); // Sofort
const { error } = await crud.updateTaskField(sb, id, changes); // Server
if (error) tasks = old; // Rollback
```
Dieses Pattern wird ~25× manuell wiederholt. Bei Refactoring: Helper-Funktion erstellen.

### Namenskonventionen
- **UI-Labels:** Deutsch (Priorität, Erledigt, Zeitnah)
- **Code-Bezeichner:** Englisch (task, list, priority, done)
- **Commits:** Deutsch, Imperativ
- **Branches:** `feature/beschreibung`, `fix/beschreibung`

## Konventionen für Mitwirkende

- Keine hardcoded Secrets, IPs oder Hostnamen — alle Credentials kommen aus `.env` (lokal) oder GitHub Secrets (Deploy)
- Keine Wiki-Links in `.md`-Dateien (nur Standard-Markdown-Links)
- Service Role Key nie ins Repo, nie in Logs, nie in Issues
- Bei Änderungen an Auth/RLS: alle Migrations testen, nicht nur die neue
