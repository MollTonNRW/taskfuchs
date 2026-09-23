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

Fuehre die SQL-Dateien aus `supabase/migrations/` der Reihe nach im Supabase
SQL-Editor aus — alle, von `001_initial_schema.sql` bis `020_reset_highlighted.sql`.
Die Nummerierung ist die Reihenfolge; eine Uebersicht, was die einzelnen
Migrationen tun, steht in [CLAUDE.md](CLAUDE.md).

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
  tf.css                  — Token und saemtliche Styles der App
  routes/
    app/+page.svelte      — mountet die App-Shell
    vorschau/             — Vorschau ohne Login, NUR im Dev-Modus
    +page.svelte          — Landing/Login
  lib/
    components/tf/        — die Oberflaeche (27 Svelte-Dateien)
    composables/tf/       — Menues, Teilen, Sortierung
    stores/               — Aufgaben-Store, Navigation, Theme, Toasts
    utils/                — Datum, Mitnutzer, Suche
    demo/                 — Fixtures fuer die Vorschau (nur Dev-Modus)
    types/database.ts     — Supabase-Typen
    seed-data.ts          — Demo-Daten fuer neue User
supabase/
  migrations/             — SQL-Migrationen (chronologisch, 001-020)
```

Architektur, Komponentenliste und die bewussten Abweichungen vom Mockup stehen
ausfuehrlich in [CLAUDE.md](CLAUDE.md).

## Features

- Desktop drei Spalten (Navigation, Liste, Detail), mobil Tab-Leiste mit
  Bottom-Sheet
- Listen mit Drag & Drop, auch am Finger
- Unteraufgaben — genau eine Ebene
- Pinnwand und Smart-Ansicht „Dringend"
- Prioritaeten (Low, Normal, High, ASAP)
- Zeitrahmen (Akut, Zeitnah, Mittelfristig, Langfristig)
- Faelligkeit mit Datum und Uhrzeit, Notiz je Aufgabe
- Suche ueber Titel, Unteraufgaben und Notizen (Cmd/Ctrl+K bzw. eigener Tab)
- Sortierung, Bulk-Aktionen, Rueckgaengig per Toast
- Listen teilen (Bearbeiter/Betrachter)
- Hell und Dunkel — ein Token-Set, keine Theme-Presets
- Echtzeit-Sync via Supabase Realtime

## Deployment

Die App wird via Cloudflare Pages deployed. Der Adapter `@sveltejs/adapter-cloudflare` ist bereits konfiguriert.
