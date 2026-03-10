# TaskFuchs — Architektur

## Tech-Stack
- **Frontend:** SvelteKit 2 + Svelte 5, Tailwind CSS 4 + daisyUI 5
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, RLS) — EU Frankfurt
- **Offline:** Dexie.js (IndexedDB) + Workbox Service Worker
- **Hosting:** Cloudflare Pages
- **Integrationen:** n8n Webhooks (Calendar, WhatsApp, Discord)

## Ordnerstruktur

```
TaskFuchs/
├── src/
│   ├── app.html                    # HTML-Template
│   ├── app.css                     # Globale Styles (Tailwind)
│   ├── hooks.server.ts             # Supabase Session-Handling (Server)
│   ├── lib/
│   │   ├── supabase.ts             # Supabase Client (Browser + Server)
│   │   ├── components/
│   │   │   ├── TaskItem.svelte     # Einzelne Aufgabe
│   │   │   ├── TaskList.svelte     # Liste mit Tasks
│   │   │   ├── Sidebar.svelte      # Seitenleiste (Filter, Listen)
│   │   │   ├── Pinboard.svelte     # Pinnwand oben
│   │   │   ├── FocusMode.svelte    # Fokus-Overlay
│   │   │   ├── EmojiPicker.svelte  # Emoji-Auswahl
│   │   │   └── ui/                 # Generische UI-Bausteine
│   │   │       ├── Button.svelte
│   │   │       ├── Modal.svelte
│   │   │       └── ContextMenu.svelte
│   │   ├── stores/
│   │   │   ├── theme.ts            # Dark/Light Mode
│   │   │   ├── tasks.svelte.ts     # Task-State (Svelte 5 Runes)
│   │   │   └── lists.svelte.ts     # Listen-State
│   │   ├── types/
│   │   │   └── database.ts         # Supabase DB-Typen
│   │   ├── server/                 # Server-only Code
│   │   └── assets/
│   │       └── favicon.svg
│   └── routes/
│       ├── +layout.svelte          # Root-Layout (Theme, Nav)
│       ├── +layout.server.ts       # Supabase Session laden
│       ├── +layout.ts              # Client-side Supabase init
│       ├── +page.svelte            # Landing Page (nicht eingeloggt)
│       ├── app/
│       │   ├── +layout.server.ts   # Auth-Guard (redirect wenn nicht eingeloggt)
│       │   ├── +layout.svelte      # App-Layout (Sidebar + Content)
│       │   └── +page.svelte        # Haupt-App-Seite (Listen + Tasks)
│       └── auth/
│           ├── login/+page.svelte
│           ├── register/+page.svelte
│           └── callback/+server.ts # OAuth Callback
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # Tabellen, RLS, Trigger
├── static/                         # Statische Assets, PWA Manifest
├── .env.example                    # Supabase Credentials Template
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Datenbank-Schema

### Tabellen
- **profiles** — User-Profile (extends auth.users via Trigger)
- **lists** — Aufgabenlisten (pro User, mit Position + Icon)
- **tasks** — Unified: Tasks, Unteraufgaben und Trenner in einer Tabelle
  - `parent_id = null` → Top-Level Task oder Trenner
  - `parent_id = task_id` → Unteraufgabe (2 Ebenen fuer v1)
  - `type = 'divider'` → Visueller Trenner
- **list_shares** — Sharing (Phase 2, Schema vorbereitet)

### Optimistic Concurrency
Jede Tabelle mit `version`-Spalte (lists, tasks). Bei Updates:
1. Client sendet aktuelle `version` mit
2. Server prueft: stimmt version? → Update + version++
3. Version veraltet? → Conflict → Client holt neueste Daten

### RLS (Row Level Security)
- Users sehen/bearbeiten nur eigene Daten
- Sharing via `list_shares` erlaubt Lese-/Schreibzugriff auf geteilte Listen
- Profiles sind fuer alle lesbar (fuer Avatare in geteilten Listen)

## Konventionen

### Svelte 5
- Runes (`$state`, `$derived`, `$effect`) statt alter Stores wo moeglich
- `.svelte.ts` fuer reaktive Module

### Supabase
- Alle DB-Zugriffe ueber typisierte Supabase Client SDK
- Kein direkter SQL — immer ueber die API
- RLS als primaerer Sicherheitsmechanismus

### Styling
- Tailwind Utility Classes, keine custom CSS ausser noetig
- daisyUI Komponenten fuer konsistentes Design
- Mobile-First: immer zuerst Mobile-Breakpoint, dann `md:` / `lg:`
