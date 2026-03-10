# TaskFuchs

Aufgaben-App mit Listen, Subtasks, Pinnwand und Echtzeit-Sync. Mobile-First, gebaut fuer schnelles Task-Management.

## Tech-Stack

- **Frontend:** SvelteKit 2 + Svelte 5 (Runes)
- **Styling:** Tailwind CSS 4 + daisyUI 5
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, RLS)
- **Hosting:** Cloudflare Pages
- **Linting:** ESLint + Prettier

## Voraussetzungen

- Node.js >= 20
- npm
- Supabase-Projekt (kostenloser Tier reicht)

## Setup

### 1. Repository klonen und Abhaengigkeiten installieren

```bash
git clone https://github.com/MollTonNRW/taskfuchs.git
cd taskfuchs
npm install
```

### 2. Supabase konfigurieren

Erstelle eine `.env`-Datei basierend auf `.env.example`:

```bash
cp .env.example .env
```

Trage deine Supabase-Werte ein (findest du im Supabase Dashboard unter Settings > API):

```
PUBLIC_SUPABASE_URL=https://dein-projekt.supabase.co
PUBLIC_SUPABASE_ANON_KEY=dein-anon-key
```

### 3. Datenbank-Migrationen ausfuehren

Fuehre die SQL-Dateien aus `supabase/migrations/` der Reihe nach im Supabase SQL-Editor aus:

1. `001_initial_schema.sql` — Tabellen, RLS-Policies, Realtime
2. `002_input_length_constraints.sql` — Eingabelaengen-Limits
3. `003_fix_rls_recursion.sql` — RLS-Rekursions-Fix
4. `004_due_date_to_text.sql` — Datumsfeld-Anpassung
5. `005_add_assigned_to.sql` — Task-Zuweisung
6. `006_lookup_user_by_email.sql` — Email-Lookup fuer Share-Funktion

### 4. Dev-Server starten

```bash
npm run dev
```

Die App laeuft unter `http://localhost:5173`.

## NPM Scripts

| Script | Beschreibung |
|--------|-------------|
| `npm run dev` | Dev-Server starten |
| `npm run build` | Produktions-Build |
| `npm run preview` | Build lokal testen |
| `npm run check` | Svelte/TypeScript Typ-Check |
| `npm run lint` | ESLint ausfuehren |
| `npm run lint:fix` | ESLint mit Auto-Fix |
| `npm run format` | Prettier formatieren |
| `npm run format:check` | Prettier pruefen |

## Projektstruktur

```
src/
  routes/
    app/+page.svelte     — Haupt-App (Listen, Tasks, Overlays)
    +page.svelte          — Landing/Login
  lib/
    components/           — UI-Komponenten (13 Svelte-Dateien)
    stores/               — Svelte Stores (Sichtbarkeit, Filter)
    types/database.ts     — Supabase-Typen
    seed-data.ts          — Demo-Daten fuer neue User
supabase/
  migrations/             — SQL-Migrationen (chronologisch)
```

## Features

- Listen mit Drag & Drop
- Subtasks (2 Ebenen tief)
- Pinnwand fuer wichtige Tasks
- Prioritaeten (Niedrig, Normal, Hoch, ASAP)
- Zeitrahmen (Akut, Zeitnah, Mittelfristig, Langfristig)
- Fortschrittsbalken (4 Stufen)
- Suche, Sortierung, Bulk-Aktionen
- Listen teilen (Bearbeiter/Betrachter)
- 4 Themes (Minimal, Colorful, Neon, Aurora)
- Echtzeit-Sync via Supabase Realtime
- Focus-Modus
- Kontextmenue mit allen Aktionen

## Deployment

Die App wird via Cloudflare Pages deployed. Der Adapter `@sveltejs/adapter-cloudflare` ist bereits konfiguriert.
