# Taskfuchs — Claude Code auf agentingo

## Rolle

App-Entwicklung TaskFuchs. Zustaendig fuer:
- SvelteKit Frontend-Entwicklung
- Supabase Backend (DB, Auth, Realtime)
- Cloudflare Pages Deployment
- Bug Fixing und Feature Development
- Code Reviews und Refactoring

## Identitaet

- Instanz: taskfuchs
- Host: agentingo (Mac mini M4, 16 GB)
- Projekt: ~/ClaudeProjects/Taskfuchs/

## Text > Brain (HARTE REGEL)

Mental Notes ueberleben keine Compaction und keinen Session-Restart. Files tun das.
Wenn du dir etwas merken willst — fuer dich oder fuer die naechste Session —
**schreib es in ein File**. Niemals "ich merk mir das" sagen ohne es auch tatsaechlich
ins Dateisystem zu schreiben. Der `session-status.sh` Hook loggt automatisch jeden
User-Prompt + Write/Edit/Bash in die Tagesdatei — aber wichtige Entscheidungen,
Erkenntnisse oder offene Punkte schreibst du bewusst zusaetzlich dort hin.

## Session Start — IMMER ausfuehren

1. Remote-Awareness (NICHT pullen — Hooks schreiben live in `memory/taskfuchs/YYYY-MM-DD.md`, Working Tree ist per Design dirty):
   ```bash
   git -C ~/ClaudeProjects/infrastruktur fetch --quiet
   git -C ~/ClaudeProjects/infrastruktur log --oneline HEAD..origin/main
   ```
   Leere Ausgabe → nichts Neues. Nicht leer → kurz ueberfliegen, keine Sync-Aktion noetig. Der Session-Ende-Block pullt vor dem Push mit sauberem Working Tree (post-commit).
2. `source ~/ClaudeProjects/infrastruktur/.env`
3. `source ~/ClaudeProjects/infrastruktur/hosts.env`
4. Lese: `~/ClaudeProjects/infrastruktur/shared-state.md` (Tier 1 — immer)
5. Lese: `~/ClaudeProjects/infrastruktur/memory/taskfuchs-last.md` (Tier 2 — Index)
6. Lese: `~/ClaudeProjects/infrastruktur/memory/taskfuchs/$(date +%F).md` (Tier 3 — heute)
7. Lese: `~/ClaudeProjects/infrastruktur/memory/taskfuchs/$(date -v-1d +%F).md` (Tier 3 — gestern, falls vorhanden)
8. Git-Status pruefen: `git -C ~/ClaudeProjects/infrastruktur status`

## Session Ende — IMMER ausfuehren

1. `memory/taskfuchs/$(date +%F).md` um **manuelle Zusammenfassung** ergaenzen
   (Hook hat Roh-Log bereits geschrieben):
   - Was wurde entschieden
   - Offene Punkte fuer naechste Session
   - Erkenntnisse die fuer Wochen relevant sind
2. `memory/taskfuchs-last.md` Index aktualisieren (max 30 Zeilen — "Zuletzt kritisch" + "Offene Cross-Session TODOs")
3. `shared-state.md` — eigene Zeile im Log anfuegen (append-only, neueste oben). Fremde Eintraege nie aendern.
4. Commit + Push:
   ```bash
   cd ~/ClaudeProjects/infrastruktur
   git add -A
   git commit -m "session-end taskfuchs $(date +%d.%m.%Y)"
   git pull --rebase
   git push
   ```

## Checkpoint bei laengerem Task

**Hook-basiert (automatisch):** Jeder User-Prompt + jede Write/Edit/Bash wird vom
`session-status.sh` Hook in `memory/taskfuchs/$(date +%F).md` geloggt. Signifikante
Entscheidungen schreibst du zusaetzlich bewusst als `## HH:MM Entscheidung: ...`.
Commit ist nicht pro Subtask noetig — am Session-Ende reicht.

## Konventionen

- KEINE hardcoded IPs — hosts.env nutzen ($PI_IP statt 192.168.178.46)
- KEINE Wiki-Links in .md Dateien (nur Standard-Markdown-Links)
- KEINE API-Keys im Code oder CLAUDE.md
- Neue Credentials — in infrastruktur/.env + git push
- Neue IPs/Hosts — in infrastruktur/hosts.env + git push

## Andere Instanzen

- **Infrastruktur** — CC-Instanz-Verwaltung, Shared State, Credentials, Health-Checks
- **Homelab** — Homelab-Ops, Pi, n8n, HA, Netzwerk
- **Persoenlich** — Privates, Firmenverwaltung (Moll GmbH, MollTonCreative)
- **Network** — Monitoring + Bugfixing aller Netzwerkgeraete
- **Sandbox** — Experimentelle Tools, Evaluierung, lokale LLM-Anbindung

## Netzwerk

Hosts und IPs: hosts.env (nie hardcoden)
SSH: Key-Auth, ~/.ssh/config mit Aliases (pi, ha, nas)

## Kein Docker auf agentingo

n8n und OpenClaw laufen auf Pi (.46) — nicht hier.

---

# TaskFuchs — Projekt-Referenz

## Projekt-Uebersicht

TaskFuchs ist eine Multi-User Task-Management-App (Mobile-First PWA + Android APK), die Google Tasks abloesen soll. Interaktive Checklisten mit Unteraufgaben, Prioritaeten, Zeitrahmen, Fortschrittsbalken und kleinen Animationen bei allen Interaktionen. Steuerbar per App, WhatsApp (via OpenClaw) und Discord. Offline-First-Architektur geplant, aktuell Online-Only.

- **Zielgruppe:** Familien, WGs, kleine Teams — Einkaufslisten, Putzplaene, gemeinsame Aufgaben
- **Domain:** taskfuchs.molltoncreative.de (Cloudflare Pages)
- **APK:** de.molltoncreative.taskfuchs v1.1 (TWA, Play Store)
- **Repo:** MollTonNRW/taskfuchs (GitHub, privat)
- **Supabase:** Projekt-Ref `kniflzaljtychimboqcp` (EU Frankfurt)

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
- Push Notifications — noch nicht implementiert

## Projektstruktur

```
TaskFuchs/
├── .github/workflows/
│   └── deploy.yml                  # GitHub Actions → Cloudflare Pages
├── android/                        # TWA Build (Gradle, Keystore, APK)
│   ├── app/                        # Android App Module
│   ├── build.gradle                # Root Build Config
│   ├── twa-manifest.json           # TWA Konfiguration
│   └── taskfuchs-keystore.jks      # Keystore (NICHT in Git!)
├── prototype/                      # Gesicherter HTML-Prototyp (v1-v5)
├── supabase/migrations/            # DB Migrations (6 Dateien)
├── static/
│   ├── icons/                      # PWA Icons (48-512px)
│   ├── manifest.json               # PWA Manifest
│   ├── .well-known/                # Digital Asset Links (TWA)
│   ├── favicon.svg
│   └── icon.svg
├── src/
│   ├── app.css                     # ~750 Zeilen: Animationen, Themes, Layout
│   ├── app.html                    # HTML Shell (viewport-fit=cover, iOS)
│   ├── app.d.ts                    # TypeScript Declarations (locals)
│   ├── hooks.server.ts             # Supabase SSR Auth Middleware
│   ├── service-worker.ts           # Basic Service Worker (Cache)
│   ├── lib/
│   │   ├── components/             # 12 Svelte-Komponenten
│   │   ├── stores/                 # 7 Store-Dateien (State Management)
│   │   ├── services/               # Supabase CRUD Service
│   │   ├── actions/                # Svelte Actions (Touch D&D)
│   │   ├── types/                  # TypeScript DB-Typen
│   │   ├── constants.ts            # Priority/Timeframe Labels + Colors
│   │   ├── seed-data.ts            # Demo-Daten fuer neue User
│   │   └── index.ts                # Barrel Export
│   └── routes/
│       ├── +layout.svelte/ts       # Root Layout + Supabase Client Init
│       ├── +page.svelte            # Landing Page (→ /app oder /auth/login)
│       ├── app/
│       │   ├── +layout.svelte      # App Shell (Header, Sidebar, Theme)
│       │   ├── +layout.server.ts   # Auth Guard (redirect wenn nicht eingeloggt)
│       │   ├── +page.svelte        # HAUPTSEITE (~955 Zeilen) — Listen, Tasks, alle Features
│       │   └── +page.ts            # Load Function (Listen + Tasks + Profile)
│       ├── auth/
│       │   ├── login/+page.svelte  # Login (Email + Google OAuth)
│       │   ├── register/+page.svelte # Registrierung (Email + Google)
│       │   └── callback/+server.ts # OAuth Callback Handler
│       └── api/seed/+server.ts     # Demo-Seed Endpoint (POST)
├── package.json
├── svelte.config.js                # Cloudflare Adapter
├── vite.config.ts                  # Tailwind + SvelteKit Plugins
├── tsconfig.json
├── eslint.config.js
├── .env                            # Supabase Keys (NICHT in Git)
├── .env.example                    # Template fuer .env
└── CODE_REVIEW.md                  # Letztes Code Review (2026-03-16, 7/10)
```

## v2 (AKTIVE VERSION)

v2 ist die aktive Produktionsversion unter `/app`.

| Eigenschaft | Wert |
|---|---|
| Route | `/app` |
| Hauptseite | `src/routes/app/+page.svelte` |
| Layout/Header | `src/routes/app/+layout.svelte` |
| Komponenten | `src/lib/components/v2/` (28 Stueck) |
| Composables | `src/lib/composables/v2/` |
| Event-Bus | `src/lib/stores/v2/events.svelte.ts` |
| Styles | `src/v2.css` (~2200 Zeilen) |

### View-Modi (Header-Toggle in +layout.svelte)
- `list` — Einzelne Liste mit Tab-Navigation (Default)
- `kanban` — Kanban-Board (Offen/In Arbeit/Erledigt)
- `scroll` — Alle Listen nebeneinander, horizontal scrollbar

## Komponenten-Uebersicht

### Seiten / Routes

| Datei | Beschreibung |
|-------|-------------|
| `routes/+page.svelte` | Landing: Redirect zu /app (eingeloggt) oder /auth/login |
| `routes/app/+page.svelte` | **Hauptseite** (~955 Zeilen): Listen-Tabs (Mobile) / Side-by-Side (Desktop), Suche (Ctrl+K), Bulk-Aktionen, Sort, Kontextmenue, Keyboard Shortcuts, Realtime Subscriptions |
| `routes/app/+layout.svelte` | App Shell: Header mit Theme-Picker, Dark/Light Toggle, Sidebar (zusammenklappbar), Logout |
| `routes/auth/login/+page.svelte` | Login-Formular: Email/Passwort + Google OAuth Button |
| `routes/auth/register/+page.svelte` | Registrierung: Email/Passwort + Google OAuth, Passwort min. 8 Zeichen |
| `routes/auth/callback/+server.ts` | OAuth Callback: Code → Session Exchange |
| `routes/api/seed/+server.ts` | POST Endpoint: Demo-Listen + Tasks fuer neue User erstellen |

### UI-Komponenten (`src/lib/components/`)

| Komponente | Zeilen | Beschreibung |
|-----------|--------|-------------|
| `ListPanel.svelte` | ~650 | Listen-Container: Header (Titel, Icon, Menu), Quick-Add Input, Task-Liste, Erledigt-Bereich (klappbar), Column Resize Handle. **22 Props** (14 Callbacks) |
| `TaskItem.svelte` | ~520 | Einzelne Aufgabe: Checkbox (animiert), Priority-Bar, Text (Doppelklick-Edit), Emoji, Fortschrittsbalken, Subtask-Counter, Kontextmenu-Button, D&D Handles |
| `SubtaskItem.svelte` | ~280 | Unteraufgabe: Checkbox, Inline-Edit, D&D Handle, Priority Badge |
| `FocusOverlay.svelte` | ~300 | Modal-Overlay: Aufgabe zentriert mit Blur-Backdrop, interaktive Unteraufgaben, Emoji/Priority/Timeframe editierbar |
| `Pinboard.svelte` | ~210 | Pinnwand oben: Angepinnte Tasks als Cards, D&D zum Pinnen/Entpinnen, klappbar |
| `ContextMenu.svelte` | ~100 | Rechtsklick-Menu: Loeschen, Prioritaet, Zeitrahmen, Unteraufgabe, Trenner, Verschieben, Emoji, Fixieren |
| `ShareDialog.svelte` | ~160 | Listen teilen: Email-Lookup, Rolle (Owner/Editor/Viewer), Mitglieder verwalten |
| `EmojiPicker.svelte` | ~50 | Emoji-Grid (8 Spalten), position: fixed, animiert |
| `PriorityPicker.svelte` | ~60 | Inline-Dropdown: 4 Prioritaetsstufen (Low/Normal/High/ASAP) |
| `DatePicker.svelte` | ~70 | Datum + Uhrzeit Picker fuer Faelligkeitsdatum |
| `NotePopover.svelte` | ~50 | Notiz-Sprechblase pro Aufgabe, Popover mit Textarea |
| `ToastContainer.svelte` | ~45 | Toast-Benachrichtigungen (neu, ersetzt teilweise alert()) |

### Stores (`src/lib/stores/`)

| Store | Typ | Beschreibung |
|-------|-----|-------------|
| `tasks.svelte.ts` | **Svelte 5 Runes** (~750 Zeilen) | Haupt-Store: Listen + Tasks CRUD, Optimistic Updates, Realtime Handler, Reorder, Bulk-Ops, Duplicate, Share — erstellt via `createTaskStore()` |
| `filters.ts` | writable | Aktive Filter: Prioritaet, Zeitrahmen, Highlight, Termin |
| `lists.ts` | writable | Listen-Array (Legacy, wird durch tasks.svelte.ts ersetzt) |
| `profiles.ts` | writable | User-Profile Cache fuer Sharing-Avatare |
| `theme.ts` | writable/derived | Theme-Preset (minimal/colorful/neon/aurora), Dark Mode, localStorage Persistenz |
| `toast.ts` | Store | Toast-Notifications (success/error/info) |
| `visibility.ts` | writable | Sichtbarkeit einzelner Listen (ein-/ausblenden) |

### Services & Actions

| Datei | Beschreibung |
|-------|-------------|
| `services/supabase-crud.ts` | Alle Supabase DB-Operationen: Insert/Update/Delete fuer Lists, Tasks, Subtasks. Reorder, BulkMove, DuplicateList, Share-Lookup |
| `actions/touchDrag.ts` | Svelte Action fuer Touch Drag & Drop: Ghost-Element, Auto-Scroll, Drop-Zone Registry, Threshold (8px) |
| `types/database.ts` | Generierte TypeScript-Typen fuer Supabase DB (Database Interface) |
| `constants.ts` | Shared Constants: Priority Labels/Colors/Weights, Timeframe Labels, Progress Labels, Sort Labels |
| `seed-data.ts` | Demo-Daten: 3 Listen (Einkauf, Arbeit, Persoenlich) mit Beispiel-Tasks |

## Backend / Supabase

### Tabellen

| Tabelle | Primaer-Felder | Zweck |
|---------|---------------|-------|
| `profiles` | id (FK auth.users), username, display_name, avatar_url | User-Profile, auto-erstellt bei Signup via Trigger |
| `lists` | id, user_id, title, icon, position, visible, version | Aufgabenlisten pro User |
| `tasks` | id, list_id, user_id, parent_id, text, type, done, priority, timeframe, progress, position, emoji, note, due_date, highlighted, pinned, assigned_to, version | Unified: Tasks + Unteraufgaben + Trenner (via parent_id + type) |
| `list_shares` | id, list_id, user_id, role (owner/editor/viewer) | Multi-User Sharing |

### Design-Entscheidungen
- **Unified Tasks-Tabelle:** Tasks, Unteraufgaben und Trenner in einer Tabelle (via `parent_id` + `type`)
- **parent_id = null:** Top-Level Task oder Divider
- **parent_id = task_id:** Unteraufgabe (1 Ebene implementiert)
- **version-Feld:** Existiert fuer Optimistic Concurrency Control, wird aktuell client-seitig **nicht geprueft**
- **RLS:** Aktiv auf allen Tabellen, Owner-Isolation + Sharing via list_shares

### Migrations

| Nr | Datei | Inhalt |
|----|-------|--------|
| 001 | `initial_schema.sql` | Alle Tabellen, RLS Policies, Auto-Profile Trigger, Indizes |
| 002 | `input_length_constraints.sql` | CHECK Constraints: title ≤100, text ≤500, note ≤5000 |
| 003 | `fix_rls_recursion.sql` | SECURITY DEFINER Hilfsfunktionen gegen RLS-Rekursion |
| 004 | `due_date_to_text.sql` | due_date Spalte zu Text-Typ aendern |
| 005 | `add_assigned_to.sql` | assigned_to Spalte fuer User-Zuweisung |
| 006 | `lookup_user_by_email.sql` | RPC-Funktion: User-ID per Email nachschlagen (fuer Sharing) |

### Auth
- **Google OAuth** + **Email/Passwort** (Supabase Auth)
- Passwort-Mindestlaenge: 8 Zeichen
- Server-seitige Validierung: `hooks.server.ts` nutzt `getUser()` nach `getSession()`
- OAuth Callback: `/auth/callback` → Code-Exchange
- Supabase Anon Key ist oeffentlich (RLS schuetzt), Service Role Key **nie** im Frontend

### Realtime
- Supabase Realtime Subscriptions auf `lists` und `tasks` Tabellen
- Pattern: `postgres_changes` Channel mit INSERT/UPDATE/DELETE Events
- Duplikat-Schutz via `pendingTaskIds` Set (bekanntes Problem: `.size > 0` statt `.has()`)

## Feature-Liste (implementiert)

### Core
- [x] Listen CRUD (Erstellen, Umbenennen inline, Loeschen, Icon-Picker)
- [x] Tasks CRUD (Quick-Add, Inline-Edit per Doppelklick, Loeschen, Abhaken)
- [x] Unteraufgaben (1 Ebene, standardmaessig eingeklappt)
- [x] Checkbox-Propagation (Eltern → Kinder) + Reverse Propagation
- [x] Prioritaeten: 4 Stufen (Low/Normal/High/ASAP) mit Farbcodierung
- [x] Zeitrahmen: 4 Stufen (Akut/Zeitnah/Mittelfristig/Langfristig)
- [x] Fortschrittsbalken: 4 Stufen (0/33/66/100%)
- [x] Supabase Realtime (Live-Updates)
- [x] Optimistic UI Updates

### UI/UX
- [x] Mobile-First: Tabs (Mobile) / Side-by-Side (Desktop)
- [x] Dark/Light Mode
- [x] 4 Theme-Presets: Minimal, Colorful, Neon, Aurora
- [x] Zusammenklappbare Seitenleiste
- [x] Kontextmenue (Rechtsklick / Long-Press)
- [x] Fokus-Modus (Klick auf Task → Overlay mit Blur-Backdrop)
- [x] Pinnwand (Tasks oben anpinnen per D&D)
- [x] Drag & Drop: Tasks, Unteraufgaben, Listen, Pinnwand
- [x] Touch Drag & Drop (eigene Implementation mit Ghost-Elements)
- [x] Suche (Ctrl+K / Cmd+K)
- [x] Sortierung: 6 Modi (Standard, Prioritaet, Name, Faelligkeit, Erstelldatum, Fortschritt)
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
- [x] Demo-Seed fuer neue User

### Nicht implementiert (geplant)
- [ ] Offline-Cache (Dexie.js)
- [ ] Volltextsuche ueber alle Tasks
- [ ] Wiederkehrende Aufgaben
- [ ] Push Notifications
- [ ] Google Calendar Sync (via n8n)
- [ ] Mehrstufige Unteraufgaben (beliebig tief)
- [ ] Gamification (Streaks, Konfetti)
- [ ] Brain-Dump Import
- [ ] Filter in Seitenleiste (teilweise vorbereitet)

## Animations-System

TaskFuchs nutzt ein zweistufiges Animations-System: **CSS Keyframes** (in `app.css`) fuer komplexe, mehrstufige Animationen und **Svelte Transitions** fuer einfache Ein-/Ausblendungen.

### CSS Keyframes (25 Animationen in app.css)

| Animation | Keyframe | Beschreibung | Timing |
|-----------|----------|-------------|--------|
| **Soft Drop** | `task-slide-in` | Neue Task erscheint: translateY(-12px) → bounce → settle | 0.4s cubic-bezier(.34,1.56,.64,1) |
| **Swipe Away** | `task-slide-out` | Task loeschen: translateX(0→120px) + max-height collapse | 0.4s ease |
| **Satisfaction Shrink** | `check-pop` | Checkbox Pop-Effekt bei Abhaken | 0.35s spring |
| **Checkmark Draw** | `draw-check` | SVG Pfad-Animation (stroke-dashoffset) | 0.3s ease |
| **Card Check** | `task-check` | Task-Karte schrumpft + verblasst nach Abhaken | 0.5s ease |
| **Card Uncheck** | `task-uncheck` | Task-Karte expandiert bei Rueckgaengig | 0.35s spring |
| **Highlight Pulse** | `highlight-pulse` | Fixierte Tasks: Pulsierender Glow (orange) | 3s infinite |
| **ASAP Blink** | `asap-pulse` | ASAP-Priority: Roter Glow-Pulse | 2.5s infinite |
| **Magnet Snap** | `pin-card-in` | Pin-Card erscheint: scale(.7→1.04→1) + bounce | 0.45s spring |
| **Pin Glow** | `pin-glow` | Orangener Glow nach Pin-Aktion | 0.6s ease |
| **Pin Exit** | `pin-card-out` | Pin-Card verschwindet: scale(1→.8) + fadeOut | 0.3s ease |
| **Breathing Space** | `idle-float` | Leere Liste: Sanftes Schweben (translateY ±6px) | infinite |
| **Idle Pulse** | `idle-fade-pulse` | Leere Liste: Sanftes Pulsieren (opacity .5→.8) | infinite |
| **Progress Shimmer** | `progress-shimmer` | 100% Fortschritt: Schimmernder Gradient | infinite |
| **Priority Pulse** | `priority-pulse` | Priority-Bar Klick: scaleY + brightness Flash | einmalig |
| **Emoji Wobble** | `emoji-wobble` | Emoji-Button Hover: Wackeln (rotate ±12deg) | einmalig |
| **Quick-Add Press** | `quick-add-press` | Add-Button Drueck-Effekt: scale(.88→1) | einmalig |
| **Checkbox Invite** | `checkbox-invite` | Alle Subtasks erledigt: Gruener Pulse auf Parent-Checkbox | 2s infinite |
| **Fade In/Out** | `fade-in`, `fade-out` | Generisches Ein-/Ausblenden | 0.25-0.3s |
| **Scale In** | `scale-in` | Skaliertes Einblenden (Dialoge, Overlays) | 0.3s spring |
| **Theme Fade** | `theme-fade` | Theme-Wechsel: blur(2px→0) + opacity(.7→1) | 0.4s |
| **Context Menu In** | `context-menu-in` | Kontextmenu-Einblendung: scale(.92→1) + translateY | 0.2s spring |
| **Note Pop In** | `note-pop-in` | Notiz-Popover erscheint: translateY(4px→0) + scale | 0.25s spring |
| **Move Up** | `move-up` | Task wird verschoben: kurzer Opacity-Flash | 0.4s spring |

### Svelte Transitions (in Komponenten)
- `slide` — Subtask-Bereich ein-/ausklappen
- `fade` — Listen-Wechsel auf Mobile (via `{#key}` Block)
- `animate:flip` — Reorder-Animation bei D&D

### CSS Utility-Klassen
```css
.task-enter    /* task-slide-in Animation */
.task-exit     /* task-slide-out Animation */
.task-check    /* task-check Animation */
.task-uncheck  /* task-uncheck Animation */
.fade-in       /* fade-in Animation */
.scale-in      /* scale-in Animation */
.pin-card      /* pin-card-in + pin-glow Animation */
.asap-blink    /* asap-pulse infinite Animation */
```

## Design-System

### Theme-Architektur
- **4 Presets:** Minimal, Colorful, Neon, Aurora
- **Dark/Light Toggle:** Minimal + Colorful unterstuetzen beide Modi; Neon + Aurora erzwingen Dark
- **CSS Custom Properties:** Alle Themes nutzen `--tf-*` Variablen (bg, surface, border, text, accent)
- **Per-Liste Farben:** Colorful + Aurora haben `[data-col="0-4"]`-basierte Gradient-Backgrounds
- **Persistenz:** Theme + Dark-Mode in localStorage (`tf-preset`, `tf-dark`)
- **DaisyUI:** `data-theme="light"/"dark"` auf `<html>` fuer Basis-Utilities

### CSS Custom Properties (--tf-*)
```
--tf-bg              Seiten-Hintergrund
--tf-surface         Karten/Panel-Hintergrund
--tf-surface-hover   Hover-State
--tf-border          Standard-Rahmenfarbe
--tf-text            Primaere Textfarbe
--tf-text-secondary  Sekundaere Textfarbe
--tf-text-muted      Dezente Textfarbe
--tf-header-bg       Header-Hintergrund
--tf-header-border   Header-Rahmen
--tf-input-bg        Input-Hintergrund
--tf-input-border    Input-Rahmen
--tf-accent          Akzentfarbe
--tf-accent-gradient Akzent-Gradient
```

### Prioritaet-Farben
| Stufe | Farbe | Badge |
|-------|-------|-------|
| Low | `#22c55e` (gruen) | bg-green-50, text-green-600 |
| Normal | `#eab308` (gelb) | bg-yellow-50, text-yellow-600 |
| High | `#ef4444` (rot) | bg-red-50, text-red-600 |
| ASAP | `#dc2626` (dunkelrot) | bg-red-500, text-white |

### Fortschritt-Farben
| Stufe | Prozent | Farbe |
|-------|---------|-------|
| 0 | 0% | transparent |
| 1 | 33% | blau (#3b82f6) |
| 2 | 66% | gelb (#f59e0b) |
| 3 | 100% | gruen (#22c55e) |

## Bekannte Probleme / Bugs

### Aus Code Review (2026-03-16, Bewertung 7/10)

**Hoch:**
1. `deleteTaskDirect` — Fire-and-Forget ohne `await`, kein Rollback bei DB-Fehler
2. `pendingTaskIds.size > 0` statt `.has()` — Race Condition bei parallelen Inserts
3. `activeListIndex` — kein Bounds-Checking nach Listen-Loeschung (→ undefined)
4. `addTaskAfter` position 0.5 — wird als int abgeschnitten, identische Position
5. `alert()`/`confirm()` — blockiert Main-Thread, error.message koennte User-Daten enthalten

**Mittel:**
6. N+1-Queries bei Reorder-Operationen (sequentielle Einzelupdates)
7. `+page.svelte` ist God-Component (955 Zeilen, zu viele Verantwortlichkeiten)
8. `ListPanel` hat 22 Props (14 Callbacks) — fehlendes DI
9. `version`-Feld existiert aber wird nie client-seitig geprueft
10. Gemischtes State-Modell: tasks.svelte.ts (Runes) vs. alle anderen (writable)
11. Accessibility: Mehrere `svelte-ignore a11y_*`, fehlende ARIA-Labels

**Niedrig:**
12. Keine Tests vorhanden (Unit, Integration, E2E)
13. Code-Duplikation (addTask/addTaskAfter, toggleTask/toggleSubtask, 25x Optimistic-Pattern)
14. Unused Imports in supabase-crud.ts (Timeframe, ListShare)
15. Kein Offline-Support (Dexie.js geplant aber nicht implementiert)

### Race Conditions
- Realtime-Event zwischen Optimistic Update und Rollback kann zu inkonsistentem State fuehren
- Divider-Sortierung nicht deterministisch (`return 0` in Sortierfunktion)

## Deployment-Pipeline

### GitHub Actions (`.github/workflows/deploy.yml`)
```
Trigger: push auf main
Steps:
1. checkout
2. Node.js 20 setup
3. npm ci
4. npm run build (mit PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY als env)
5. wrangler pages deploy .svelte-kit/cloudflare --project-name=taskfuchs
```

### Secrets
- `CLOUDFLARE_API_TOKEN` — GitHub Secret
- `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY` — direkt in deploy.yml (oeffentliche Keys)
- Cloudflare Account ID: `d3cea7db1d36b66368557de3a287ac00`

### Branches
| Branch | Zweck |
|--------|-------|
| `main` | Production (Auto-Deploy via GitHub Actions) |
| `feature/animationen` | Animations-Overhaul (zuletzt merged) |
| `feature/prototype-redesign` | Grosses Redesign (merged) |
| `backup/vor-bugfix-session` | Sicherung vor Bugfix-Runde |

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

### `.env` (lokal, nicht in Git)
```
PUBLIC_SUPABASE_URL=https://kniflzaljtychimboqcp.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### Zugriff im Code
- **Client-seitig:** `$env/static/public` (PUBLIC_* Variablen)
- **Server-seitig:** `$env/static/private` (fuer Secrets, aktuell nicht genutzt)
- Service Role Key wird **nur** in n8n verwendet, **nie** im Frontend

## Mobile App (TWA)

### Konfiguration
- **Typ:** Trusted Web Activity (TWA) — Chrome Custom Tab, kein nativer Code
- **Package:** `de.molltoncreative.taskfuchs`
- **Version:** 1.1
- **Gradle-Projekt:** `android/` (Standalone, kein Capacitor)
- **Keystore:** `android/taskfuchs-keystore.jks`
- **Keystore-Backup:** `~/Opus/keystores/`
- **Digital Asset Links:** `static/.well-known/assetlinks.json`

### PWA Manifest
- `display: standalone`
- `start_url: /app`
- `theme_color: #f97316` (Orange)
- `lang: de`
- Icons: 48px bis 512px (PNG) + SVG

## Security-Zusammenfassung

Detaillierter Leitfaden: `~/ClaudeProjects/Turing/Server/projects/taskapp-security.md`

### Kernprinzipien
- **RLS ist die zentrale Sicherheitsschicht** — JEDE Tabelle hat RLS + Policies
- **Service Role Key nie im Frontend** — nur in n8n
- **Kein `{@html}` mit User-Daten** — Svelte escaped automatisch
- **CSP + Security Headers** in `static/_headers`
- **Input-Validierung:** PostgreSQL Constraints + Frontend maxlength (dreifach)
- **DSGVO:** Supabase EU Frankfurt, Daten bleiben in der EU

### Offene Security-Punkte
- `alert(error.message)` koennte User-kontrollierte Daten zeigen
- `as any` Casts bei Realtime-Subscriptions umgehen Type-Safety
- `Record<string, unknown>` in CRUD erlaubt beliebige Felder
- Kein Offline-Sync Security (noch nicht implementiert)

## Entwicklungshinweise

### Svelte 5 Runes vs. Legacy Stores
- `tasks.svelte.ts` nutzt **Svelte 5 Runes** ($state, $derived, $effect)
- Alle anderen Stores nutzen **Legacy writable/derived**
- Bei neuen Features: Runes bevorzugen

### Optimistic Update Pattern
```typescript
const old = tasks; // Snapshot
tasks = tasks.map(t => t.id === id ? {...t, ...changes} : t); // Sofort
const { error } = await crud.updateTaskField(sb, id, changes); // Server
if (error) tasks = old; // Rollback
```
Dieses Pattern wird ~25x manuell wiederholt. Bei Refactoring: Helper-Funktion erstellen.

### Namenskonventionen
- **UI-Labels:** Deutsch (Prioritaet, Erledigt, Zeitnah)
- **Code-Bezeichner:** Englisch (task, list, priority, done)
- **Commits:** Deutsch, Imperativ
- **Branches:** feature/beschreibung, fix/beschreibung

## TaskFuchs Agent Team

Du bist der Orchestrator der TaskFuchs-Entwicklung. Einfache Quick-Checks
(Dateien lesen, Status pruefen) darfst du selbst ausfuehren.
Komplexe Aufgaben delegierst du an Teammates (via TeamCreate).
Das Agent-Tool ohne team_name ist VERBOTEN.

### Team-Mitglieder

| Agent | Name | Datei | Zustaendig fuer |
|---|---|---|---|
| DEVELOPER | Dev | `agents/developer.md` | Feature-Entwicklung, SvelteKit, TypeScript |
| REVIEWER | Rev | `agents/reviewer.md` | Code Review, Bug-Suche, Qualitaet |
| DESIGNER | Muse | `agents/designer.md` | UI/UX, Animationen, Themes |
| DBADMIN | DB | `agents/dbadmin.md` | Supabase, Migrations, RLS, Queries |

### Kommunikationsregeln
- **Sprache:** Deutsch, technische Begriffe auf Englisch OK
- **Stil:** Direkt, pragmatisch, kurz
- **Commits:** Deutsch, imperativ

## Shared Agent Presets
Zentrale Agent-Definitionen: ~/ClaudeProjects/infrastruktur/shared-agents/
18 Kategorien, ~190 Presets. README.md dort enthaelt Index.
Archiviertes Wissen (HA-Entities, n8n-Incidents, Netzwerk): shared-agents/_memory/
