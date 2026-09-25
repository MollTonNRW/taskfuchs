# TaskFuchs — Projekt-Referenz

Diese Datei dokumentiert Architektur, Komponenten und Konventionen von TaskFuchs für Mitwirkende und KI-Assistenten, die mit dem Code arbeiten.

Eine User-orientierte Kurzbeschreibung steht in [README.md](README.md). Setup-Schritte ebenfalls dort.

> **Stand:** Redesign „A Klar". Die frühere v2-Ebene (`src/v2.css`, `src/lib/components/v2/`, `composables/v2/`, `stores/v2/`, die Theme-Presets und die drei Ansichts-Modi) ist gelöscht — nicht deaktiviert, sondern entfernt. Verbindliche Gestaltungsquelle ist `A-klar-spec.md` aus dem Redesign-Projekt; im Code ist `src/tf.css` die einzige Farb- und Maßquelle.

## Projekt-Überblick

TaskFuchs ist eine Multi-User Task-Management-App (Mobile-First PWA + Android APK). Listen mit Unteraufgaben (genau eine Ebene), Prioritäten, Zeitrahmen, Pinnwand und Echtzeit-Sync.

- **Zielgruppe:** Familien, WGs, kleine Teams — Einkaufslisten, Putzpläne, gemeinsame Aufgaben
- **Plattformen:** Web (PWA) + Android (TWA)
- **Keine Animationen.** Kein ASAP-Puls, kein Glow, kein `backdrop-filter`, keine gestrichelten Rahmen. Die Spezifikation verbietet sie ausdrücklich (Abschnitt 9, Punkt 3); das alte Keyframe-System ist mit der v2-Ebene entfallen. Übrig bleibt `prefers-reduced-motion` als Sicherung am Fuß von `src/tf.css`.

## Tech-Stack

| Kategorie | Technologie | Version |
|-----------|-------------|---------|
| Framework | SvelteKit 2 + Svelte 5 (Runes) | svelte ^5.51, @sveltejs/kit ^2.50 |
| Styling der App | Eigenes Token-Stylesheet `src/tf.css` | — |
| Styling der Auth-Seiten | Tailwind CSS 4 + daisyUI 5 | tailwindcss ^4.2, daisyui ^5.5 |
| Backend | Supabase (PostgreSQL, Auth, Realtime) | @supabase/supabase-js ^2.99, @supabase/ssr ^0.9 |
| Hosting | Cloudflare Pages | @sveltejs/adapter-cloudflare ^7.2 |
| Build | Vite 7 | vite ^7.3 |
| Sprache | TypeScript (strict mode) | ^5.9 |
| Linting | ESLint + Prettier + svelte-check | eslint ^10, prettier ^3.8 |
| Mobile | TWA (Trusted Web Activity) | Gradle-Projekt unter `twa/` |

Tailwind und daisyUI tragen **nur noch** `/auth/login` und `/auth/register`. Die App selbst rührt sie nicht an.

### Nicht implementiert (geplant)
- Offline-Cache: Dexie.js (IndexedDB) — in Architektur vorgesehen, noch nicht gebaut
- Service Worker Sync: Workbox — SW existiert, kein Offline-Sync

## Projektstruktur

```
.
├── .github/workflows/
│   └── deploy.yml                  # GitHub Actions → Cloudflare Pages
├── twa/                            # TWA Build (Gradle, Keystore-Referenz, APK)
├── prototype/                      # HTML-Prototyp-Snapshots (historisch)
├── supabase/migrations/            # DB Migrations (chronologisch, 001–025; 021 = G2-Kopplung)
├── static/
│   ├── fonts/                      # Instrument Sans, self-hosted woff2
│   ├── icons/                      # PWA Icons (48–512px)
│   ├── manifest.json               # PWA Manifest
│   └── .well-known/                # Digital Asset Links (TWA)
├── _headers                        # CSP + Security Headers (Cloudflare)
├── src/
│   ├── tf.css                      # ~2950 Zeilen: Token, Reset, ALLE App-Styles
│   ├── app.css                     # ~95 Zeilen: Tailwind/daisyUI (nur Auth), Body-Reset
│   ├── app.html                    # HTML Shell (viewport-fit=cover, Theme-Startskript)
│   ├── hooks.server.ts             # Supabase SSR Auth + Riegel vor /vorschau
│   ├── hooks.client.ts
│   ├── service-worker.ts           # Basic Service Worker (Cache)
│   ├── lib/
│   │   ├── components/tf/          # Die Oberfläche (28 Svelte-Dateien)
│   │   ├── composables/tf/         # Menüs, Teilen-Dialog, Sortierung
│   │   ├── stores/tf/              # Navigation, Theme, Tastatur-Attrappe
│   │   ├── stores/                 # tasks.svelte.ts, history.svelte.ts, toast.ts, filters.ts
│   │   ├── utils/                  # datum.ts, mitnutzer.ts, suche.ts, verlauf.ts
│   │   ├── services/               # supabase-crud.ts
│   │   ├── actions/                # touchDrag.ts
│   │   ├── demo/                   # Fixtures + Supabase-Attrappe + Vorschau-Inhalt
│   │   ├── types/                  # TypeScript DB-Typen
│   │   ├── constants.ts            # Der EINZIGE Labelsatz (Priorität, Zeitrahmen)
│   │   └── seed-data.ts            # Demo-Daten für neue User (nur /api/seed)
│   └── routes/
│       ├── +layout.svelte/ts       # Root Layout + Supabase Client Init
│       ├── +page.svelte            # Landing (→ /app oder /auth/login)
│       ├── app/                    # Die App (mountet AppShell)
│       ├── auth/                   # Login, Register, OAuth Callback
│       ├── vorschau/               # Abnahme-Vorschau, NUR im Dev-Modus
│       └── api/                    # seed, calendar/sync
├── .env.example
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Die tf-Ebene (aktive Oberfläche)

Es gibt genau **eine** Oberfläche. Kein Ansichts-Umschalter, kein zweiter Komponentensatz.

| Eigenschaft | Wert |
|---|---|
| Route | `/app` |
| Einstiegsseite | `src/routes/app/+page.svelte` (31 Zeilen — mountet nur die Shell) |
| Shell | `src/lib/components/tf/AppShell.svelte` (~1270 Zeilen) |
| Wurzelelement | `src/lib/components/tf/TfRoot.svelte` (Theme-Klasse, Statusleistenfarbe) |
| Komponenten | `src/lib/components/tf/` (28 Stück) |
| Composables | `src/lib/composables/tf/` (3 Stück) |
| Stores | `src/lib/stores/tf/` + `src/lib/stores/tasks.svelte.ts` |
| Styles | `src/tf.css` — ein Token-Set, hell und dunkel |
| Vorschau ohne Login | `/vorschau` (nur Dev-Modus, Demodaten im Arbeitsspeicher) |

### Layout

**Desktop (ab 900 px): drei Spalten nebeneinander**, kein globaler Header, kein Footer.

```
┌ Navigation 248 px ┬ Liste (flex:1) ┬ Detail 384 px ┐
```

1. **Navigation** — Marke, Suchzeile (⌘K), Smart-Ansichten „Angepinnt" und „Dringend", Listen mit Emoji/Avataren/Zähler, „Neue Liste", Fußzeile (Avatar, Mond, Zahnrad).
2. **Liste** — Kopf (64 px: Name, Zähler, Geteilt-Pille, Sortier-Knopf, ⋮), Quick-Add als erste Zeile, Aufgabenzeilen, Erledigt-Balken. **Alle Overlays gehören in diese Spalte:** Teilen-Popover (`top:58px; right:20px`), Aufgabenmenü (`right:24px`), Toast (mittig unten). `ContextMenu` und `ShareDialog` klemmen sich deshalb gegen `.tf-main`, nicht gegen das Fenster.
3. **Detail** — Titel, Priorität (Segment), Zeitrahmen (Chips), Fällig, Unteraufgaben mit Fortschritt, Notiz, Verlauf (Aufgabenhistorie), unten Anpinnen/Verschieben/Löschen.

**Mobil (unter 900 px): Tab-Leiste statt Spalten.** Drei Tabs — Listen · Angepinnt · Suche. „Liste geöffnet" ist ein Unterschirm des Tabs „Listen"; das Aufgabendetail ist ein Bottom-Sheet. Toast liegt oberhalb der Tab-Leiste.

### Was mit dem Redesign herausgeflogen ist

Wer alten Code oder alte Dokumentation liest, sucht sonst danach:

- `src/v2.css` und `src/lib/components/v2/`, `composables/v2/`, `stores/v2/` — komplett gelöscht, auch der Event-Bus.
- Die v1-Komponenten `ListPanel`, `TaskItem`, `SubtaskItem`, `FocusOverlay`, `Pinboard`, `PriorityPicker`, `NotePopover` — ersetzt durch `components/tf/`.
- **Vier Theme-Presets** (Minimal, Colorful, Neon, Aurora), `--tf-*`-Variablen, Per-Liste-Farben, `stores/theme.ts`. Jetzt: ein Token-Set in `src/tf.css`, hell/dunkel, Schalter in `stores/tf/theme.svelte.ts`.
- **Drei Ansichts-Modi** (`list`, `kanban`, `scroll`) samt Header-Umschalter. Jetzt: drei Spalten bzw. Tab-Leiste.
- Die App-Kopfzeile mit Theme-Picker, Sortier-, Auswahl- und Suchknopf; die Off-Canvas-Sidebar samt Burger und Scrim.
- Fokus-Modus mit Blur-Backdrop, Notiz-Sprechblase pro Aufgabe, Emoji pro Aufgabe, Fortschritts-Stufen (0/33/66/100 %), Spaltenbreite per Drag.
- Das gesamte Keyframe-System (25 Animationen in `app.css`) und die Utility-Klassen `.task-enter`, `.asap-blink` und Verwandte.
- `stores/lists.ts`, `stores/profiles.ts`, `stores/visibility.ts`; aus `filters.ts` blieb genau eine Voreinstellung übrig (Unteraufgaben ein-/ausgeklappt).
- Aus `constants.ts` die Farbtabellen (`priorityColors`, `priorityBadgeBg`, `progressColors`) — Farben stehen ausschließlich als Token in `src/tf.css`.

## Komponenten-Übersicht

### Seiten / Routes

| Datei | Beschreibung |
|-------|-------------|
| `routes/+page.svelte` | Landing: Redirect zu /app (eingeloggt) oder /auth/login |
| `routes/app/+page.svelte` | Mountet `AppShell` mit echtem Supabase-Zugang und Abmelden |
| `routes/app/+layout.svelte` | Nur noch `TfRoot` als Rahmen — kein Header, keine Sidebar |
| `routes/app/g2-koppeln/+page.svelte` | Kopplungscode für die G2-Brille |
| `routes/auth/login/+page.svelte` | Login: Email/Passwort + Google OAuth |
| `routes/auth/register/+page.svelte` | Registrierung, Passwort min. 8 Zeichen |
| `routes/auth/callback/+server.ts` | OAuth Callback: Code → Session Exchange |
| `routes/vorschau/+page.svelte` | Vorschau ohne Login — lädt den Inhalt **nur im Dev-Modus** nach |
| `routes/api/seed/+server.ts` | POST: Demo-Listen + Tasks für neue User |
| `routes/api/calendar/sync/+server.ts` | Kalender-Abgleich (n8n) |

### UI-Komponenten (`src/lib/components/tf/`)

| Komponente | Zeilen | Beschreibung |
|-----------|--------|-------------|
| `AppShell.svelte` | ~1270 | Die ganze Oberfläche: drei Spalten bzw. Tab-Leiste, Store-Anbindung, Realtime, Tastatur, Overlay-Regie, Vorschau-Regie |
| `TaskDetail.svelte` | ~605 | Detailspalte und Sheet-Inhalt: Priorität, Zeitrahmen, Fällig, Unteraufgaben, Notiz, Verlauf, Aktionsleiste |
| `TaskHistory.svelte` | ~350 | Gruppe „Verlauf": Eingabe (Stand · Wartet auf), Einträge neueste zuerst, „Ist da", Bearbeiten, Löschen mit Undo; Betrachter nur lesen |
| `TaskRow.svelte` | ~345 | Aufgabenzeile: Prioritätsbalken, 44-px-Checkbox, Titelzeile mit Chips/Pin, Metazeile, ⋮ |
| `TaskList.svelte` | ~315 | Listenkörper: Quick-Add, Zeilen, ausgeklappte Unteraufgaben, Erledigt-Bereich, Drag & Drop |
| `NavColumn.svelte` | ~210 | Navigationsspalte inkl. Smart-Ansichten, „Neue Liste", Fußzeile |
| `ContextMenu.svelte` | ~210 | Popover-Menü mit Untermenü; klemmt gegen die Listenspalte |
| `ShareDialog.svelte` | ~190 | Teilen-Popover: Mitnutzer, Rollen, Einladen. **Keine UUIDs** |
| `SearchPalette.svelte` | ~180 | ⌘K-Palette (Desktop), Liste springt live mit |
| `QuickAdd.svelte` | ~165 | Quick-Add-Zeile, mobil angedockt über der Tastatur |
| `SmartList.svelte` | ~140 | Pinnwand und „Dringend", nach Liste gruppiert |
| `DatePicker.svelte` | ~135 | Datum **und** Uhrzeit in einem Schritt |
| `Icon.svelte` | ~130 | Das einzige Icon-Set (Stroke, viewBox 24, stroke-width 1.75) |
| `ListsOverview.svelte` | ~125 | Mobiler Tab „Listen" inkl. Fußzeile |
| `BulkToolbar.svelte` | ~120 | Leiste der Mehrfachauswahl |
| `SearchMobile.svelte` | ~120 | Mobiler Tab „Suche" |
| `SubtaskRow.svelte` | ~115 | Unteraufgabe in der Liste (genau eine Ebene) |
| `NewListCard.svelte` | ~115 | Karte „Neue Liste" (Emoji-Feld + Name + Abbrechen/Anlegen) |
| `EmojiPicker.svelte` | ~100 | Symbolwähler, 6 × 44 px, kein Wachsen beim Überfahren |
| `DetailSheet.svelte` | ~90 | Bottom-Sheet-Rahmen um `TaskDetail` |
| `InputDialog.svelte` | ~75 | Texteingabe-Dialog (ersetzt `prompt()`) |
| `ConfirmDialog.svelte` | ~75 | Bestätigungsdialog — nur wo es kein Undo gibt |
| `TfRoot.svelte` | ~50 | Wurzelelement, Theme-Klasse, Statusleistenfarbe |
| `ToastContainer.svelte` | ~45 | Undo-Toast, einer pro Aktion |
| `MobileTabBar.svelte` | ~40 | Tab-Leiste, 52 px Inhalt + Safe-Area |
| `AvatarStack.svelte` | ~35 | Überlappende Mitnutzer-Avatare |
| `DoneBar.svelte` | ~35 | Erledigt-Balken mit Zähler und „Erledigte löschen" |
| `Logo.svelte` | ~30 | Fuchskopf-Siegel |

### Composables (`src/lib/composables/tf/`)

| Datei | Beschreibung |
|-------|-------------|
| `useContextMenus.svelte.ts` | Aufgabenmenü (4 Einträge), Listenmenü (7), Pinnwandmenü (2) |
| `useShareDialog.svelte.ts` | Teilen-Dialog: lädt `profiles` nach und löst Anzeigenamen auf |
| `useSortFilter.svelte.ts` | Sortierung (5 Modi — „Fortschritt" ist mit `tasks.progress` entfallen), Persistenz unter `tf-sort-mode` |

### Stores

| Store | Typ | Beschreibung |
|-------|-----|-------------|
| `stores/tasks.svelte.ts` | Runes (~905 Zeilen) | Haupt-Store: Listen + Tasks CRUD, Optimistic Updates, Realtime, Reorder, Bulk, Pins, Undo — via `createTaskStore()` |
| `stores/history.svelte.ts` | Runes | Aufgabenhistorie: offene Warte-Einträge (eine Abfrage beim Start), Verlauf lazy je Detail, optimistisch mit Rücknahme, Realtime, Löschen verzögert mit Undo — via `createHistoryStore()` |
| `stores/tf/navigation.svelte.ts` | Runes | Aktive Liste, ausgewählte Aufgabe, mobiler Tab, Unterschirm, Smart-Ansicht — durchgehend über IDs, nie über Indizes |
| `stores/tf/theme.svelte.ts` | Runes | Genau zwei Zustände: hell (Default) und dunkel, `tf-dark` |
| `stores/tf/tastatur.svelte.ts` | Runes | Höhe der Bildschirmtastatur (VisualViewport) für das angedockte Quick-Add |
| `stores/toast.ts` | Store | Toasts inkl. Undo, dazu `showInputDialog` / `showConfirmDialog` |
| `stores/filters.ts` | writable | Einzige verbliebene Voreinstellung: Unteraufgaben eingeklappt (`tf-subtasks-collapsed`) |

### Services, Utils, Actions

| Datei | Beschreibung |
|-------|-------------|
| `services/supabase-crud.ts` | Alle Supabase-DB-Operationen |
| `utils/mitnutzer.ts` | Anzeigename → Initiale → Avatarfarbe. Gibt **nie** eine UUID heraus |
| `utils/datum.ts` | Deutsche Datumsausgabe („heute 12:00", „Sa 20.09. · 09:00") — nie ISO |
| `utils/suche.ts` | Suche über Titel, Unteraufgaben und Notizen aller Listen |
| `utils/verlauf.ts` | Aufgabenhistorie: Typ `Eintrag`, Sortierung neueste zuerst, Sanduhr-Text „Wartet auf: … und N weitere" |
| `actions/touchDrag.ts` | Touch-Drag & Drop: Ghost, Auto-Scroll, Drop-Zonen, 8-px-Schwelle |
| `constants.ts` | Der einzige Labelsatz: Low · Normal · High · ASAP, Zeitrahmen |
| `seed-data.ts` | Demo-Daten für neue User (nur `/api/seed`) |
| `demo/fixtures.ts`, `demo/supabase-attrappe.ts`, `demo/VorschauInhalt.svelte` | Nur für `/vorschau`, siehe unten |

### localStorage-Schlüssel

| Schlüssel | Inhalt |
|---|---|
| `tf-dark` | Dunkelmodus (`'true'` / `'false'`) |
| `tf-active-list` | Zuletzt gewählte Liste |
| `tf-sort-mode` | Sortierung. Hieß bis zur Abnahme `v2-sort-mode`; der alte Wert wird einmalig übernommen und gelöscht |
| `tf-subtasks-collapsed` | Unteraufgaben beim Öffnen ein-/ausgeklappt |
| `tf-gesehen` | Letzter Besuch je Liste — Grundlage für den „neu"-Chip |

## Vorschau-Route `/vorschau`

Abnahme- und Vorführartefakt: dieselbe Shell, dieselben Komponenten, Demodaten im Arbeitsspeicher, kein Login, kein Zugriff auf die Produktivdatenbank. Der Zustand kommt aus Abfrageparametern (`liste`, `task`, `tab`, `offen`, `dunkel`, `teilen`, `menu`, `listenmenu`, `neueliste`, `suche`, `quickadd`, `toast`, `confirm`). `rolle=betrachter` macht Frank in der Liste „Familie" zum Betrachter (andere Demodaten, kein gestellter Zustand) — so ist der Verlauf im Nur-lesen-Zustand prüfbar. Die Attrappe spielt für `task_history` den Stempel-Trigger und die Kaskade aus Migration 022 nach.

**Sie existiert produktiv nicht:**

1. `src/hooks.server.ts` beantwortet `/vorschau` außerhalb des Dev-Modus vor dem Routing mit **HTTP 404**. (Der Riegel in `+page.ts` allein reichte nicht: die Route trägt `ssr = false` und der Riegel griff erst im Browser — der Server lieferte 200 mit leerer Hülle.)
2. `routes/vorschau/+page.svelte` lädt `$lib/demo/VorschauInhalt.svelte` **nur** hinter `import.meta.env.DEV` dynamisch nach. Vite ersetzt das beim Bauen durch `false`, der Zweig fällt weg und mit ihm der Chunk. Im Produktionsbündel steht kein Demobestand mehr.

Wer die Demodaten anfasst: `npm run build && grep -r "Kinderarzt" .svelte-kit/output/` muss leer bleiben.

## Backend / Supabase

### Tabellen

| Tabelle | Primär-Felder | Zweck |
|---------|---------------|-------|
| `profiles` | id (FK auth.users), username, display_name, avatar_url | User-Profile, auto-erstellt bei Signup via Trigger. **Keine E-Mail-Spalte** — fremde Mitnutzer haben darum nur Anzeigename und Rolle |
| `lists` | id, user_id, title, icon, position, visible, version | Aufgabenlisten pro User |
| `tasks` | id, list_id, user_id, parent_id, text, type, done, priority, timeframe, position, emoji, note, due_date, highlighted, pinned, pinned_by, assigned_to, version | Unified: Tasks + Unteraufgaben + Trenner (via parent_id + type). `progress` entfällt mit Migration 023 |
| `task_history` | id, task_id, kind (stand/wartet), body, created_by/at, edited_by/at, resolved_by/at | Aufgabenhistorie, nur an Aufgaben oberster Ebene. Autor, Zeiten und „Ist da" stempelt ein Trigger; Rechte über `can_view_task` / `can_edit_task` |
| `list_shares` | id, list_id, user_id, role (owner/editor/viewer) | Multi-User Sharing |

### Design-Entscheidungen
- **Unified Tasks-Tabelle:** Tasks, Unteraufgaben und Trenner in einer Tabelle (via `parent_id` + `type`)
- **parent_id = null:** Top-Level Task oder Divider
- **parent_id = task_id:** Unteraufgabe — **genau eine Ebene**, tiefer geht die Oberfläche nicht
- **Trenner (`type = 'divider'`):** Restbestand. Die Oberfläche legt keine neuen an, vorhandene bleiben bedienbar
- **version-Feld:** Existiert für Optimistic Concurrency Control, wird client-seitig nicht geprüft
- **RLS:** Aktiv auf allen Tabellen, Owner-Isolation + Sharing via list_shares. In `list_shares` einer FREMDEN Liste sieht man nur den Besitzer und sich selbst (Migration 003) — wer dort gepinnt hat, wird über sein Profil nachgeladen

### Migrations

`supabase/migrations/001` bis `025`, chronologisch anzuwenden (021, die G2-Kopplung, steht nicht als Datei im Repo). Die Grundlagen:

| Nr | Datei | Inhalt |
|----|-------|--------|
| 001 | `initial_schema.sql` | Alle Tabellen, RLS Policies, Auto-Profile Trigger, Indizes |
| 002 | `input_length_constraints.sql` | CHECK Constraints: title ≤100, text ≤500, note ≤5000 |
| 003 | `fix_rls_recursion.sql` | SECURITY DEFINER Hilfsfunktionen gegen RLS-Rekursion |
| 004 | `due_date_to_text.sql` | due_date Spalte zu Text-Typ |
| 005 | `add_assigned_to.sql` | assigned_to Spalte |
| 006 | `lookup_user_by_email.sql` | RPC: User-ID per E-Mail (für Sharing) |
| 007 | `batch_reorder_rpc.sql` | Reorder in einem Aufruf statt N+1 |
| 008–010 | Gamification | Tabellen, Fixes, Leaderboard-RLS |
| 011–012 | Kalender | Sync und Erinnerung |
| 013–016 | RPC-Härtung | Auth-Check, sichere Reward-RPCs, Quests server-seitig |
| 017 | `subtask_api.sql` | Unteraufgaben-RPCs |
| 018 | `realtime_publication.sql` | Realtime-Publikation |
| 019 | `task_pinned_by.sql` | `pinned_by` — trägt den Chip „gepinnt von …" |
| 020 | `reset_highlighted.sql` | `highlighted` zurücksetzen |
| 021 | — (nicht im Repo) | G2-Kopplung (`g2_pairing_codes`) |
| 022 | `task_history.sql` | Aufgabenhistorie: Tabelle, Helfer, RLS, Stempel-Trigger, Realtime |
| 022b | `task_history_trigger_rechte.sql` | Trigger-Funktionen der Historie nicht per RPC aufrufbar (Advisor) |
| 023 | `drop_task_progress.sql` | `progress`-Werte als Stand-Eintrag übernehmen, Spalte entfernen — erst nach dem Deploy des Codes ohne `progress` |
| 024 | `besitz_und_verschieben_absichern.sql` | Trigger: `tasks.user_id`/`lists.user_id` unveränderlich, Verschieben nur in beschreibbare Listen, Unteraufgaben nur an bearbeitbare Aufgaben — greift auch in den Reorder-RPCs; n8n (service_role) unberührt |
| 025 | `rpc_rechte_aufraeumen.sql` | `lookup_user_by_email` nur noch angemeldet, Gamification-RPCs gesperrt, Trigger-Funktionen nicht per RPC |

### Auth
- Google OAuth + Email/Passwort (Supabase Auth)
- Passwort-Mindestlänge: 8 Zeichen
- Server-seitige Validierung: `hooks.server.ts` nutzt `getUser()` nach `getSession()`
- OAuth Callback: `/auth/callback` → Code-Exchange
- Supabase Anon Key ist öffentlich (RLS schützt), Service Role Key **nie** im Frontend

### Realtime
- Subscriptions auf `lists`, `tasks` und `task_history` (DELETE trägt bei RLS nur die ID)
- Pattern: `postgres_changes` Channel mit INSERT/UPDATE/DELETE Events

## Feature-Liste (implementiert)

### Core
- [x] Listen CRUD (Anlegen über die Karte „Neue Liste", Umbenennen, Löschen mit Dialog, Symbolwähler)
- [x] Tasks CRUD (Quick-Add als erste Zeile, Inline-Edit, Löschen mit Undo-Toast, Abhaken)
- [x] Unteraufgaben — genau eine Ebene, standardmäßig eingeklappt
- [x] Checkbox-Propagation (Eltern → Kinder), ein Undo-Toast pro Aktion
- [x] Prioritäten: Low/Normal/High/ASAP als farbiger Balken links; nur ASAP trägt zusätzlich einen Chip
- [x] Zeitrahmen: Keiner/Akut/Zeitnah/Mittelfristig/Langfristig
- [x] Fällig: Datum **und** Uhrzeit in einem Schritt, Anzeige immer deutsch
- [x] Notiz je Aufgabe (im Detail, mit einzeiliger Vorschau in der Metazeile)
- [x] Verlauf je Aufgabe: „Stand" und „Wartet auf" mit „Ist da"; Sanduhr in der Zeile, solange etwas offen ist
- [x] Supabase Realtime + Optimistic UI

### UI/UX
- [x] Desktop: drei Spalten. Mobil: Tab-Leiste (Listen · Angepinnt · Suche) + Bottom-Sheet
- [x] Hell/Dunkel — ein Token-Set, keine Presets
- [x] Smart-Ansichten „Angepinnt" (Pinnwand) und „Dringend"
- [x] Kontextmenü: Aufgabe 4 Einträge, Liste 7, Pinnwand 2 — alles Weitere lebt im Detail
- [x] Drag & Drop inkl. Touch (300 ms halten + ziehen)
- [x] Suche: ⌘K-Palette am Zeiger, eigener Tab am Finger — über Titel, Unteraufgaben und Notizen
- [x] Sortierung: 5 Modi
- [x] Bulk-Aktionen (Mehrfachauswahl)
- [x] Undo-Toast statt Bestätigungsdialog, außer beim Löschen einer Liste
- [x] Touch-Ziele 44 px, iOS Safe Area, `viewport-fit=cover`
- [x] Tastatur-Kürzel, ⌘K/Ctrl+K

### Auth & Sharing
- [x] Google OAuth + Email/Passwort
- [x] User-Profile (automatisch bei Signup)
- [x] Teilen-Popover: Einladen per E-Mail, Rolle je Mitnutzer, Entfernen
- [x] Mitnutzer-Avatare in Navigation, mobiler Übersicht und Listen-Kopf
- [x] Demo-Seed für neue User

### Geplant
- [ ] Offline-Cache (Dexie.js)
- [ ] Wiederkehrende Aufgaben
- [ ] Push Notifications

## Design-System

### Token

`src/tf.css` ist die **einzige** Farb- und Maßquelle der App. Hex-Werte stehen ausschließlich in den beiden Token-Blöcken (`:root` hell, `.tf-dark` dunkel) und bei den bewusst konstanten Werten (Toast, Avatarfarben, Logo, Scrim). Neue Regeln greifen nur auf Token zu.

```
--bg --surface --surface-2        Flächen
--line --line-2                   Trennlinien
--ink --ink-2 --ink-3             Text primär / sekundär / tertiär
--accent --accent-ink --accent-soft   Fuchs-Orange
--low --normal --high --asap      Prioritäten
--sel --new                       Zeilenzustände
--sh-* --r-*                      Schatten und Radien
--ring-destr                      Fokusring des destruktiven Dialogknopfes
```

Der globale Fokusring ist 2 px `--accent`. Auf dem destruktiven Dialogknopf (Fläche `--asap`) wäre das die kontrastschwächste Paarung des Farbsatzes — `.tf-btn.destr:focus-visible` bekommt deshalb `--ring-destr`.

### Prioritäts-Farben

| Stufe | Light | Dark |
|-------|-------|------|
| Low | `#22c55e` | `#9ece6a` |
| Normal | `#eab308` | `#e0af68` |
| High | `#ef4444` | `#f87171` |
| ASAP | `#991b1b` | `#cc2222` |

ASAP ist bewusst dunkler als High (in beiden Themes Dunkelrot, Frank 24.09.) — die im alten Brief genannte `#dc2626` war von High nicht zu unterscheiden.

### Schrift und Ikonografie

- **Instrument Sans**, self-hosted als woff2 unter `static/fonts/` (variabel, 400–600). Kein Google-Fonts-Link, kein externer `font-src`.
- **Ein** Icon-Set in `components/tf/Icon.svelte`: `viewBox 0 0 24 24`, Stroke, `stroke-width 1.75`, Größen 24/20/16/14. Funktionen tragen nur diese Icons; Emoji bleiben den Listen-Symbolen vorbehalten.

## Bewusste Abweichungen vom Mockup

Die folgenden Stellen weichen **absichtlich** von `A-klar-spec.md` ab. Sie sind geprüft und sollen so bleiben — kein Versehen, bitte nicht „zurückbauen".

1. **Drei Bedienelemente, die das Mockup nicht kennt.** Das Mockup zeigt keinen Weg, etwas wieder loszuwerden; die Funktion braucht ihn:
   - Lösch-Kreuz im Feld „Fällig" (`TaskDetail`) — sonst ließe sich ein gesetztes Datum nie wieder entfernen.
   - Mülleimer je Unteraufgabe (`TaskDetail`) — das Aufgabenmenü einer Unteraufgabe erreicht man am Finger nicht zuverlässig.
   - Entfernen-Kreuz je fremdem Mitnutzer im Teilen-Popover — Teilen ohne Beenden wäre eine Einbahnstraße.
2. **Fußzeile im mobilen Tab „Listen"** (Avatar, Mond, Zahnrad, Abmelden). Das Mockup hat sie nicht, weil es keine Einstellungen und kein Abmelden kennt. Ohne sie wären beide am Handy unerreichbar. Das Abmelden-Symbol ist ein eigenes Icon (`abmelden`, Tür mit Pfeil) und **nicht** das `verschieben`-Icon aus Abschnitt 8 — dasselbe Icon darf nicht zwei Dinge bedeuten.
3. **Die Pinnwand gruppiert nach der Reihenfolge der Seitenleiste**, nicht nach der des Mockups (`SmartList.svelte` geht `lists` durch). Eine zweite, eigene Sortierung für die Pinnwand wäre eine zweite Wahrheit über „Reihenfolge der Listen".
4. **Der Erledigt-Balken bleibt bei Zähler 0 stehen** (Spezifikation Abschnitt 5: nur die Löschen-Aktion entfällt). Das Mockup ist hier uneins mit sich — Frame 2 zeigt den Balken mit Zähler 0, andere Frames zeigen ihn gar nicht. Die Spezifikation entscheidet.

## Bekannte Probleme / offene Punkte

**Mittel:**
1. `AppShell.svelte` ist mit ~1270 Zeilen die größte Datei des Projekts. Menüs, Teilen und Sortierung sind bereits in Composables ausgelagert; Realtime und Vorschau-Regie wären die nächsten Kandidaten.
2. `version`-Feld existiert, wird client-seitig nicht geprüft
3. N+1-Queries bei einzelnen Reorder-Pfaden (die RPC aus Migration 007 deckt nicht alle ab)
4. Code-Duplikation: das Optimistic-Pattern wiederholt sich in `tasks.svelte.ts` vielfach

**Niedrig:**
5. Keine Tests (Unit, Integration, E2E). Die Abnahme läuft über Screenshots gegen die Mockup-Frames (`abnahme/shot.mjs` im Redesign-Projekt)
6. `svelte-check` meldet 5 Fehler in `routes/app/g2-koppeln/+page.svelte`: die Tabelle `g2_pairing_codes` fehlt in den generierten DB-Typen
7. `eslint` meldet 1 Fehler in `service-worker.ts` (`ServiceWorkerGlobalScope` ist der ESLint-Umgebung unbekannt)
8. Kein Offline-Support

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
| `redesign/a-klar` | Redesign „A Klar" |

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
- **Gradle-Projekt:** `twa/` (Standalone)
- **Keystore:** Referenz unter `twa/`, Keystore-Datei wird nicht eingecheckt (gitignored)
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
- **CSP + Security Headers** in `_headers`
- **Input-Validierung:** PostgreSQL Constraints + Frontend `maxlength`
- **Keine UUIDs in der Oberfläche** — `utils/mitnutzer.ts` löst jede ID zu einem Namen auf
- **`/vorschau` ist produktiv 404** und trägt keine Demodaten im Bündel
- **DSGVO:** Supabase EU Frankfurt, Daten bleiben in der EU

### Offene Security-Punkte
- `as any` Casts bei Realtime-Subscriptions umgehen Type-Safety
- `Record<string, unknown>` in CRUD erlaubt beliebige Felder
- Kein Offline-Sync Security (noch nicht implementiert)

## Entwicklungshinweise

### Svelte 5 Runes vs. Legacy Stores
- `tasks.svelte.ts` und alles unter `stores/tf/` nutzen **Svelte 5 Runes**
- `toast.ts` und `filters.ts` nutzen noch **writable**
- Bei neuen Features: Runes

### Optimistic Update Pattern
```typescript
const old = tasks; // Snapshot
tasks = tasks.map(t => t.id === id ? {...t, ...changes} : t); // Sofort
const { error } = await crud.updateTaskField(sb, id, changes); // Server
if (error) tasks = old; // Rollback
```

### Regeln aus der Spezifikation, die im Code gelten
- Ein Labelsatz (`constants.ts`), eine Farbquelle (`src/tf.css`), ein Icon-Set (`Icon.svelte`)
- Keine Animationen, keine gestrichelten Rahmen, kein `backdrop-filter`
- Nie ein ISO-Datum und nie eine UUID in der Oberfläche
- Aufgabenmenü höchstens 4 Einträge, Listenmenü höchstens 7 — alle Felder leben im Detail
- Overlays der Listenspalte klemmen gegen `.tf-main`, nicht gegen das Fenster
- Touch-Ziele 44 px; kleinere Maße (32/36/38) nur für Zeigergeräte

### Namenskonventionen
- **UI-Labels:** Deutsch (Priorität, Erledigt, Zeitnah)
- **Code-Bezeichner:** in `components/tf/` deutsch (`aufgabe`, `liste`, `beteiligte`), im älteren Bestand englisch
- **Commits:** Deutsch, Imperativ
- **Branches:** `feature/beschreibung`, `fix/beschreibung`, `redesign/beschreibung`

## Konventionen für Mitwirkende

- Keine hardcoded Secrets, IPs oder Hostnamen — alle Credentials kommen aus `.env` (lokal) oder GitHub Secrets (Deploy)
- Keine Wiki-Links in `.md`-Dateien (nur Standard-Markdown-Links)
- Service Role Key nie ins Repo, nie in Logs, nie in Issues
- Bei Änderungen an Auth/RLS: alle Migrations testen, nicht nur die neue
