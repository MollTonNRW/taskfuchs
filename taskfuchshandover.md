# TaskFuchs — Komplettes Handover (2026-03-30)

Dieses Dokument ist das vollstaendige Handover fuer den TaskFuchs Claude Code Agent auf AgentIngo (Mac mini M4). Es enthaelt ALLES was du wissen musst um sofort weiterarbeiten zu koennen.

---

## Inhaltsverzeichnis

1. [Projekt-Ueberblick](#1-projekt-ueberblick)
2. [User-Profil: Frank](#2-user-profil-frank)
3. [Feedback-Regeln (WICHTIG)](#3-feedback-regeln-wichtig)
4. [v1 — Produktionsstatus](#4-v1--produktionsstatus)
5. [v2 — Redesign-Status](#5-v2--redesign-status)
6. [v2 Architektur](#6-v2-architektur)
7. [Gamification Design](#7-gamification-design)
8. [Supabase / Datenbank](#8-supabase--datenbank)
9. [Deployment & Infrastruktur](#9-deployment--infrastruktur)
10. [Wichtige Dateipfade](#10-wichtige-dateipfade)
11. [Bekannte Bugs & Offene Punkte](#11-bekannte-bugs--offene-punkte)
12. [Planungsdokumente (lokal)](#12-planungsdokumente-lokal)

---

## 1. Projekt-Ueberblick

TaskFuchs ist eine Multi-User Task-Management-App (Mobile-First PWA + Android APK), die Google Tasks abloesen soll. Interaktive Checklisten mit Unteraufgaben, Prioritaeten, Zeitrahmen, Fortschrittsbalken und Animationen. Steuerbar per App, WhatsApp (via OpenClaw) und Discord.

- **Zielgruppe:** Familien, WGs, kleine Teams
- **Domain:** taskfuchs.molltoncreative.de (Cloudflare Pages)
- **APK:** de.molltoncreative.taskfuchs v1.1 (TWA, Play Store)
- **Repo:** MollTonNRW/taskfuchs (GitHub, privat)
- **Supabase:** Projekt-Ref `kniflzaljtychimboqcp` (EU Frankfurt)

### Tech-Stack

| Kategorie | Technologie |
|-----------|-------------|
| Framework | SvelteKit 2 + Svelte 5 (Runes) |
| Styling | Tailwind CSS 4 + daisyUI 5 |
| Backend | Supabase (PostgreSQL, Auth, Realtime) |
| Hosting | Cloudflare Pages |
| Build | Vite 7 |
| Sprache | TypeScript (strict mode) |
| Tests | Playwright (nur v2) |
| Mobile | TWA (Trusted Web Activity) |

---

## 2. User-Profil: Frank

- Testet primaer auf Android-Handy (TWA App) und Desktop-Browser
- Bevorzugt Dark Mode
- Will Terminal/Hacker-Aesthetik mit Gamification
- Erwartet dass Agents sofort parallel gespawnt werden — KRITISCH
- Gibt direktes, ungeduldiges Feedback — iteriert schnell
- Mac mini M4 heisst "agentingo" (seit 2026-03-29)
- Entwickelt TaskFuchs als Familien-/WG-Taskmanagement-App
- Deutsche Commit-Messages im Imperativ
- Legt grossen Wert auf Animationen und UX-Details
- Hat Synology NAS (192.168.178.54), Homelab mit HA, n8n, Pi-hole, OpenClaw
- Keystores unter ~/Opus/keystores/

---

## 3. Feedback-Regeln (WICHTIG)

### Agents IMMER parallel spawnen
Agents sofort parallel spawnen fuer ALLE Programmierarbeiten. Niemals manuell Zeile fuer Zeile editieren. Frank hat das mehrfach kritisiert — manuelle Einzeledits sind ein kritischer Workflow-Fehler.
- Bei JEDER Programmieraufgabe sofort Agents spawnen
- Arbeit in parallele, nicht-ueberlappende Dateibereiche aufteilen
- Nur Build-Check und finale Verifikation selbst machen
- KEINE Read-Edit-Read-Edit Zyklen selbst durchfuehren
- Ausnahme: Echte Einzeiler wo Agent-Overhead absurd waere

### Commit/Push nur auf Nachfrage
Commits und Pushes nur auf explizite Nachfrage. User will Kontrolle ueber Git-Operationen. Deployment passiert automatisch via GitHub Actions nach Push auf main.

### Deploy vor Test
Aenderungen muessen deployed sein bevor der User testen kann. HMR auf localhost reicht nicht wenn Frank auf dem Handy testet. Nach jedem Fix: committen + pushen + Deploy-Status mit `gh run list` pruefen. Bei DB-Aenderungen: Migration VOR Frontend-Deploy auf Supabase anwenden.

### Touch D&D Pattern
Touch Drag & Drop darf NIEMALS normales Scrollen blockieren. Hold-Delay Pattern: touchstart startet Timer (300ms), erst nach Ablauf OHNE Fingerbewegung wird non-passive touchmove Listener dynamisch hinzugefuegt. Bei touchend/touchcancel: Listener immer entfernen. 4 Iterationen gebraucht um das richtig zu machen.

---

## 4. v1 — Produktionsstatus

v1 ist die aktuell live laufende App auf `main` Branch.

### Code Review Score: 7/10 (AUDIT.md: 7.5/10)

### Dateistruktur (src/, ~8.250 Zeilen)

```
src/
  app.css                        1259Z   Animationen (33 Keyframes), 4 Themes, Micro-Interactions
  app.html                         20Z   HTML Shell
  hooks.server.ts                  44Z   Supabase SSR Auth Middleware
  service-worker.ts                68Z   Basic Cache SW
  lib/
    constants.ts                   48Z   Priority/Timeframe Labels + Colors
    seed-data.ts                  340Z   Demo-Daten
    actions/touchDrag.ts          322Z   Touch D&D (Hold-Delay, Ghost, Auto-Scroll)
    components/                         15 Komponenten
      ListPanel.svelte            619Z   Listen-Container (22 Props)
      TaskItem.svelte             564Z   Task-Darstellung
      FocusOverlay.svelte         316Z   Fokus-Modus
      SubtaskItem.svelte          292Z   Unteraufgabe
      Pinboard.svelte             211Z   Pinnwand
      ShareDialog.svelte          178Z   Listen teilen
      ContextMenu.svelte          139Z   Kontextmenu
      + 8 kleinere Komponenten
    composables/                        4 Composables
      useContextMenus.svelte.ts   224Z   Menu-Logik
      useSortFilter.svelte.ts      87Z   Sort/Filter
      usePopovers.svelte.ts        73Z   Popover-Management
      useShareDialog.svelte.ts     59Z   Share-Dialog
    services/
      supabase-crud.ts            189Z   Alle DB-Operationen
    stores/
      tasks.svelte.ts             844Z   Haupt-Store (Svelte 5 Runes)
      theme.ts                     74Z   4 Theme-Presets + Dark Mode
      toast.ts                     73Z   Toast + ConfirmDialog
      filters.ts                   72Z   Priority/View Filter
      profiles.ts                  24Z   User-Profile
      visibility.ts                16Z   Listen-Sichtbarkeit
      lists.ts                      6Z   Legacy writable
    types/database.ts             219Z   Supabase-Typen
  routes/
    +page.svelte                    4Z   Root Redirect
    app/+layout.svelte            277Z   App Shell
    app/+page.svelte              659Z   Hauptseite
    auth/login/+page.svelte       121Z   Login
    auth/register/+page.svelte    148Z   Registrierung
    auth/callback/+server.ts       17Z   OAuth Callback
    api/seed/+server.ts            16Z   Demo-Seed
```

### v1 Features (implementiert)
- Listen CRUD, Tasks CRUD, Unteraufgaben (1 Ebene)
- Checkbox-Propagation, Prioritaeten (4), Zeitrahmen (4), Fortschrittsbalken (4)
- Supabase Realtime, Optimistic Updates
- Mobile-First: Tabs (Mobile) / Side-by-Side (Desktop)
- Dark/Light Mode, 4 Theme-Presets (Minimal, Colorful, Neon, Aurora)
- Kontextmenu, Fokus-Modus, Pinnwand, D&D (Desktop + Touch)
- Suche (Ctrl+K), Sortierung (6 Modi), Bulk-Aktionen
- Emoji/Notizen pro Task, Spaltenbreite anpassbar
- Google OAuth + Email/Passwort, Share-Dialog
- Undo-Toast bei Loeschen/Abhaken
- Swipe Listen-Wechsel (Mobile)
- Task zu Liste konvertieren

---

## 5. v2 — Redesign-Status

v2 ist eine fast fertige SvelteKit-App auf Branch `feature/v2`. Terminal-Aesthetik + Gamification.

- **Branch:** `feature/v2` (22 v2-spezifische Commits)
- **Route:** `/v2` (Login redirectet dorthin, /app bleibt als v1)
- **Dev-Server:** `npm run dev -- --port 5174`
- **Localhost Login:** Nur Email/Passwort (kein Google OAuth lokal)
- **Letzter Commit:** `1c1f0ea` — Fix: Sidebar Toggle funktioniert auf Desktop
- **NICHT deployed** auf Cloudflare (nur lokal)

### v2 Commit-History (chronologisch)

1. `8569fa4` v2 Foundation: Routes, Layout Shell, Theme Store, CSS System
2. `f4ab27a` v2 Core Components: 14 Svelte-Komponenten mit Terminal-Aesthetic
3. `1da5ba3` v2 Interactions: 4 Composables, ShareDialog, Shortcuts, Bulk-Ops
4. `1198701` v2 Gamification: Backend + UI (Migration 008, Stores, 12 Komponenten)
5. `63ea39b` v2 Polish: Gamification verdrahtet, Mobile, Performance, A11y
6. `d5f108b` Fix: localStorage SSR-Crash in useSortFilter durch browser-Guard
7. `82e4912` v2 Redesign: Visueller Angleich an PoC v6
8. `de9f37f` Fix: Checkboxen visuell 18x18 + Pinnwand D&D Drop-Zone
9. `0afe7e1` Fix: Tabs klickbar + Kontextmenu Icons und Farben
10. `b96e772` Fix: Header-Buttons klickbar + Pinboard D&D Drop funktioniert
11. `c19b92e` Fix: Header-Buttons Overflow — Buttons waren off-screen
12. `bc10e64` Fix: NaN keyframe Warnings blockierten Hydration/Event-Handler
13. `b9b2a2c` Login-Redirect auf /v2 statt /app
14. `66ee83f` Alle Header-Buttons funktional + Service Worker Fix
15. `01031f5` Fix: Kanban-Logik + Sort-Position + Sort-Reaktivitaet
16. `94e0acf` Fix: Kontextmenu Submenues neben statt innerhalb des Menus
17. `dfce240` Feature: Tab-Kontextmenu + Subtask-Default Option
18. `8530392` Fix: Unteraufgaben aus-/einklappen via Listen-Kontextmenu
19. `9316eea` Features: Zeitrahmen, Touch D&D, Swipe, Subtask/Tab D&D, Icon-Picker
20. `81031cd` Fix: Subtask-Default wird beim Seitenstart beachtet
21. `1c1f0ea` Fix: Sidebar Toggle funktioniert auf Desktop

### Was in v2 nachgebaut ist
Alle v1-Features BIS AUF:
- Demo Seed
- Fortschritt klickbar (Cycling)

### Bekannte geloeste v2-Bugs
- effect_orphan, NaN keyframe (v1 slide|global), Header-Overflow, Sidebar-Toggle
- Pinboard-D&D dropEffect, content-visibility brach sticky tabs
- Service Worker cached Page-Navigations nicht mehr

---

## 6. v2 Architektur

### v2 Komponenten (28 unter src/lib/components/v2/)

**Gamification:**
| Komponente | Zeilen | Zweck |
|---|---|---|
| FoxMascot.svelte | 302 | ASCII Fuchs (9 Zustaende, Sprechblasen, Wachstum) |
| AchievementsPanel.svelte | 167 | Achievement-Uebersicht |
| ShopPanel.svelte | 235 | Kosmetik-Shop (Coins) |
| StatsBar.svelte | 241 | XP/Coins/Streak/Level |
| QuestCard.svelte | 172 | Tages-Quests |
| LevelBar.svelte | 63 | XP-Fortschrittsbalken |
| LevelUpOverlay.svelte | 169 | Level-Up Feier-Animation |
| CoinFloat.svelte | 44 | Coin-Float-Animation |
| WeeklyTracker.svelte | 179 | Woechentlicher Tracker |
| TeamStats.svelte | 153 | Team-Statistiken |
| Statusbar.svelte | 149 | Terminal-Statusleiste |

**Core UI:**
| Komponente | Zeilen | Zweck |
|---|---|---|
| TaskCard.svelte | 332 | Task mit Terminal-Look |
| ListPanel.svelte | 346 | Listen-Container |
| Pinboard.svelte | 296 | Pinnwand |
| FocusOverlay.svelte | 235 | Task-Detail |
| BootSequence.svelte | 131 | Boot-Animation |
| ContextMenu.svelte | 122 | Terminal-Kontextmenu |
| SearchOverlay.svelte | 99 | Suche |
| SubtaskCard.svelte | 75 | Subtask |
| AsciiParticles.svelte | 48 | Dekorative Partikel |
| + Picker, Dialoge, Toast | ~350 | Diverse UI-Elemente |

### v2 Stores (4 unter src/lib/stores/v2/)

| Store | Zeilen | Zweck |
|---|---|---|
| gamification.svelte.ts | 306 | Level/XP/Coins/Streak/Rang (15 Level, 7 Raenge) |
| achievements.svelte.ts | 301 | 21 Achievements + Unlock-Logik |
| events.svelte.ts | 54 | Event-Bus (task_done, subtask_done, viewMode) |
| theme.svelte.ts | 55 | Terminal-Theme + Display-Mode (full/minimal/off) |

### v2 Composables (4 unter src/lib/composables/v2/)
- useContextMenus (310Z), usePopovers (99Z), useShareDialog (64Z), useSortFilter (84Z)

### v2 Services
- gamification-crud.ts (149Z) — Supabase CRUD fuer Gamification

### v2 CSS
- src/v2.css (2256Z) — Komplettes Terminal-Design-System

### v2 Routes
- src/routes/v2/+layout.svelte (672Z) — App Shell
- src/routes/v2/+page.svelte (958Z) — Hauptseite

### Geteilte Dateien (v1 + v2)
- tasks.svelte.ts, supabase-crud.ts, touchDrag.ts, constants.ts, database.ts

### Playwright Tests (9 Dateien, 1221 Zeilen)
bugfix-kanban-sort, header-and-pinboard, list-icon-picker, list-tab-reorder-dnd, pinboard-dnd, sidebar-toggle, subtask-reorder-dnd, subtasks-collapse-expand, touch-swipe-dnd
Config: Chromium only, Port 4173 (preview build)

---

## 7. Gamification Design

Vollstaendiges Design-Dokument: `poc/GAMIFICATION.md` (lokal, nicht in Git)

### Design Pillars
1. Produktivitaet foerdern, nicht ersetzen
2. Belohnung durch Fortschritt, nicht durch Zwang
3. Terminal-Aesthetik als Identitaet
4. Sozial ermutigend, nie beschaemend

### Dual-Currency
- **XP** (nie ausgebbar): Task Low=5, Normal=10, High=15, ASAP=20, Subtask=3
  - Bonus: Alle Subtasks=10, Liste geleert=25, Quest=30, Wochen-Challenge=100
- **Coins** (Shop-Waehrung): Task=10, Quest=50, Challenge=200, Achievement=25-500, Level-Up=100
  - Casual 150-250/Tag, Power 400-600/Tag

### 20 Level (Terminal-Raenge)
Formel: `100 + (Level * Level * 15)`

| Lv | Rang | XP | Geschaetzte Zeit |
|---|---|---|---|
| 1 | guest@taskfuchs | 115 | Tag 1 |
| 5 | bug_hunter | 475 | Woche 2 |
| 10 | daemon_lord | 1600 | Monat 2-3 |
| 15 | neural_architect | 3475 | Monat 6-7 |
| 20 | root@taskfuchs | Max | Jahr 1-1.5 |

Freischaltungen: Lv3 Shop, Lv4 Quests, Lv5 Achievements, Lv7 Wochen-Challenges, Lv9 Leaderboard

### 21 Achievements (4 Seltenheiten)
- **Common** (gruen, 25C): hello_world, mkdir_life, rm_-rf_done, man_pages, first_commit
- **Uncommon** (blau, 75C): cron_job, multithreaded, sudo_apt_clean, fork_bomb, pair_programming, night_owl, early_bird
- **Rare** (lila, 200C): uptime_30d, 100_commits, full_stack, changelog, open_source
- **Legendary** (gold, 500C): 99.999_uptime, thousand_commits, root_access, BOFH

### Streak-Mechanik
- 1 Tag = min. 1 Task erledigt (Subtasks zaehlen nicht einzeln)
- Freeze-Tokens: max 3, 200C, auto-Verbrauch
- Multiplikator: 3d=x1.1, 7d=x1.2, 14d=x1.3, 30d=x1.5, 100d+=x2.0
- Meilensteine: 7d Achievement+Freeze, 30d Outfit, 100d Gold, 365d Feuer-Partikel

### Tages-Quests (10 im Pool, 1/Tag zufaellig)
rm_-rf_done (5 Tasks, 50C), batch_process (3 in 1h, 40C), sprint_finish (1 ASAP, 30C), clean_sweep (Liste leer, 75C), subtask_master (8 Subtasks, 45C), early_deploy (vor 9:00, 35C), priority_queue (alle 4 Prios, 60C), documentation (3 Notizen, 30C), emoji_commit (5 Emojis, 25C), list_creator (neue Liste+3, 40C)

### Wochen-Challenges (6 im Pool, 1/Woche)
weekly_release (25 Tasks, 200C), full_coverage (5 Listen, 175C), test_suite (7 Quests, 250C), code_review (10 Tasks mit Subtasks, 200C), pair_week (15 shared, 225C), zero_bugs (7d Streak, 200C)

### Fuchs-Maskottchen
- 9 Zustaende: Idle, Aufmerksam, Gluecklich, Begeistert, Stolz, Schlaefrig, Traurig, Feiernd, Ueberrascht
- Wachstum: Lv1-3 Welpe, Lv4-7 Jungtier, Lv8-12 Erwachsen, Lv13-17 Veteran, Lv18-20 Alpha
- Outfits: Hacker-Hoodie (500C), Piratenhut (750C), Goldene Brille (1500C), Streak Flame (30d), Phoenix (200d), Cyber Fox (Lv20)

### Shop (Coin-Senken)
Terminal-Themes (300-500C), App-Effekte (400-800C), Streak-Freeze (200C), Emoji-Pack (350C), Fuchs-Outfits (500-1500C)

### Anti-Patterns (STRENG)
1. Kein Bestrafungs-Design — nie beschaemen
2. Kein Pay-to-Win / Echtgeld
3. Keine kuenstliche Verknappung / FOMO
4. Keine Sucht-Mechaniken
5. Keine Produktivitaets-Illusion (5s Anti-Exploit)
6. Kein Sozial-Druck (kein Ranking als Default)
- **Kernregel:** ALLES muss DEAKTIVIERBAR sein

### ALLE Werte sind PLACEHOLDER — Evaluation nach 2 Wochen Echtdaten

---

## 8. Supabase / Datenbank

### Tabellen (v1)

| Tabelle | Zweck |
|---------|-------|
| profiles | User-Profile (auto bei Signup) |
| lists | Aufgabenlisten pro User |
| tasks | Unified: Tasks + Unteraufgaben + Trenner (via parent_id + type) |
| list_shares | Multi-User Sharing (owner/editor/viewer) |

### Tabellen (v2, Migration 008)

| Tabelle | Zweck |
|---------|-------|
| gamification_profiles | XP, Level, Coins, Streak, Freezes, Einstellungen |
| user_achievements | Freigeschaltete Achievements |
| daily_quests | Tages-Quests + Fortschritt |
| user_cosmetics | Gekaufte Items |
| active_cosmetics | Aktive Slots (fox_outfit, terminal_theme, etc.) |

### Migrations

| # | Datei | Status |
|---|-------|--------|
| 001 | initial_schema.sql | DEPLOYED |
| 002 | input_length_constraints.sql | DEPLOYED |
| 003 | fix_rls_recursion.sql | DEPLOYED |
| 004 | due_date_to_text.sql | DEPLOYED |
| 005 | add_assigned_to.sql | DEPLOYED |
| 006 | lookup_user_by_email.sql | DEPLOYED |
| 007 | batch_reorder_rpc.sql | **NICHT DEPLOYED** |
| 008 | gamification_tables.sql | **NICHT DEPLOYED** |

**WICHTIG:** Migration 007 und 008 muessen auf Supabase angewendet werden bevor v2 live gehen kann. Der Code hat Fallback (Promise.all statt RPC) fuer 007.

### Auth
- Google OAuth + Email/Passwort (Supabase Auth)
- Localhost: Nur Email/Passwort (OAuth Redirect geht auf Production-URL)
- RLS aktiv auf ALLEN Tabellen
- Service Role Key NIEMALS im Frontend (nur in n8n)

---

## 9. Deployment & Infrastruktur

### CI/CD
```
Push auf main → GitHub Actions → Cloudflare Pages (auto)
```
- Cloudflare Account: d3cea7db1d36b66368557de3a287ac00
- Secrets: CLOUDFLARE_API_TOKEN (GitHub Secret)
- PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY direkt in deploy.yml

### Build-Befehle
```bash
npm run dev              # Dev-Server (Port 5173)
npm run dev -- --port 5174  # v2 Dev-Server
npm run build            # Production Build
npm run preview          # Production Preview (Port 4173)
npm run check            # svelte-check + TypeScript
npm run lint             # ESLint
npm run format           # Prettier
```

### Mobile
- TWA (Trusted Web Activity), Package: de.molltoncreative.taskfuchs
- Keystore: ~/Opus/keystores/
- TWA-Config: twa/ (v1.2 vorbereitet, APK noch nicht gebaut)
- Digital Asset Links: static/.well-known/assetlinks.json

---

## 10. Wichtige Dateipfade

### Repositories
- **Haupt-Repo (v1+v2):** /Users/molltonbros/ClaudeProjects/Taskfuchs/repo/
- **v1 Klon:** /Users/molltonbros/ClaudeProjects/Turing/TaskFuchs/

### Planungsdokumente (lokal, NICHT in Git)
- **POC-Prototypen:** /Users/molltonbros/ClaudeProjects/Taskfuchs/poc/
  - v1 (ASCII/Terminal), v2 (Playful), v3 (Zen), v4 (Terminal+Playful), v5 (Gamification, AKTUELL), v6/v6.1/v7 (Weiterentwicklungen)
- **Gamification-Design:** /Users/molltonbros/ClaudeProjects/Taskfuchs/poc/GAMIFICATION.md
- **Migrationsplan:** /Users/molltonbros/ClaudeProjects/Taskfuchs/poc/MIGRATION.md
- **Handoff (alt):** /Users/molltonbros/ClaudeProjects/Taskfuchs/HANDOFF.md
- **Agent-Team:** /Users/molltonbros/ClaudeProjects/Taskfuchs/AGENTS.md
- **Security-Leitfaden:** ~/ClaudeProjects/Turing/Server/projects/taskapp-security.md

---

## 11. Bekannte Bugs & Offene Punkte

### Audit-Blocker (von v1 geerbt, in v2 noch offen)
1. **B1:** `prompt()` bei Listen-/Trenner-Umbenennung → ConfirmDialog ersetzen
2. **B2:** `changeTaskProgress` autoDone — Subtask-Rollback fehlt (direkte Supabase-Mutation umgeht CRUD-Layer)
3. **B3:** Undo-Toast nach Abhaken — Race Condition mit Realtime

### Nicht deployed
- Migration 007 (batch_reorder RPCs) → auf Supabase anwenden
- Migration 008 (Gamification-Tabellen) → auf Supabase anwenden
- v2 Branch noch nicht auf Cloudflare Pages

### Architektur-Probleme
- v2/+page.svelte ist 958 Zeilen (gross)
- gamification-crud.ts: addXP/addCoins ist Read-then-Write ohne atomare Operation (Race Condition moeglich)
- Batch-Reorder RPCs existieren in DB (Migration 007), werden im Code nicht genutzt (Promise.all statt RPC)
- v1 und v2 koexistieren, teilen tasks.svelte.ts + supabase-crud.ts

### Touch D&D Fragilitaet
- 6 separate Fix-Commits waren noetig
- Hold-Delay Pattern (300ms) ist KRITISCH — siehe Feedback-Regeln

### Fehlende Features
- Offline-Cache (Dexie.js geplant)
- Push Notifications
- Wiederkehrende Aufgaben
- Google Calendar Sync (via n8n)

---

## 12. Planungsdokumente (lokal)

### Migrationsplan-Zusammenfassung (aus poc/MIGRATION.md)

**Geschaetzter Gesamtaufwand:** 8-12 Arbeitstage
**3 Dimensionen:** Design-System + Gamification + UI-Patterns (NICHT gleichzeitig)

**5 Phasen:**
1. **Phase 0 — Vorarbeit (1-2d):** prompt() fixen, Font self-hosten, Migrations erstellen
2. **Phase 1 — Design-System (2-3d):** Custom Properties, Theme-Store, Tailwind-Farben ersetzen
3. **Phase 2 — Gamification Backend (1-2d):** Migrations deployen, CRUD, Stores, Event-System
4. **Phase 3 — UI-Komponenten (2-3d):** FoxMascot, Widgets, Sidebar, Animations
5. **Phase 4 — Kanban (1-2d):** KanbanBoard, View-Toggle
6. **Phase 5 — Polish (1d):** TWA, Performance, Backfill

**Design-Kritik fuer v2 (vor Merge beachten):**
1. Onboarding fehlt — neue User ueberfordert
2. Mobile zu voll — radikal priorisieren
3. Gamification MUSS abschaltbar sein (--minimal Mode)
4. Streak-Angst vermeiden ("Beste Woche" statt "Ununterbrochene Tage")
5. Performance: Animationen auf Mobile drosseln
6. Shop braucht Content-Strategie

---

*Generiert am 2026-03-30 als Handover fuer AgentIngo (Mac mini M4)*
