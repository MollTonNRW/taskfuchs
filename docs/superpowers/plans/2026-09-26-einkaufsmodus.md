# Einkaufs-Modus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Liste kann „Einkaufsliste" sein: Kategorien als Abschnitte ohne Haken, Artikel mit einem Tipp abhaken, „Einkauf fertig" legt ab, „Zuletzt gekauft"-Chips setzen Artikel mit einem Tipp wieder auf die Liste.

**Architecture:** Datenmodell ohne neue Tabelle: `lists.kind` markiert den Typ, Kategorien sind Trenner-Zeilen (`tasks.type = 'divider'`), Artikel deren Unteraufgaben, `tasks.abgelegt` unterscheidet „im Wagen" von „zuletzt gekauft". Die Logik liegt in zwei neuen, rein funktionalen bzw. store-unabhängigen Modulen (`utils/einkauf.ts`, `stores/einkauf.ts`), die gegen zwei neue generische Primitive des Task-Stores arbeiten; die Oberfläche ist eine eigene Komponente `EinkaufsListe.svelte`, auf die `AppShell` für `kind = 'einkauf'` umschaltet.

**Tech Stack:** SvelteKit 2 / Svelte 5 (Runes), TypeScript strict, Supabase (Postgres, RLS, Realtime), Vitest (neu, nur für reine Logik), Playwright (Sichtprüfung gegen `/vorschau`).

**Spec:** `docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md` — vor jedem Task lesen.

## Global Constraints

- Arbeitsverzeichnis: Git-Worktree `/Users/agentingo/ClaudeProjects/Sandbox/.worktrees/tf-a-klar`, Branch `feature/aufgabenhistorie`. Kein Push, kein Merge auf `main`, keine Änderung im Haupt-Checkout `~/ClaudeProjects/Taskfuchs`.
- Keine schreibenden Zugriffe auf die Produktivdatenbank (kein `apply_migration`, keine DML). Migrationen nur als Dateien; anwenden macht die Hauptsession.
- Stil: Code-Kommentare deutsch in ASCII-Umschreibung wie im Bestand; UI-Texte deutsch mit Umlauten; Bezeichner in `components/tf/` und neuen Modulen deutsch.
- Eine Farbquelle: nur Token aus `src/tf.css` (`--ink`, `--ink-2`, `--ink-3`, `--line`, `--surface`, `--surface-2`, `--accent`, `--accent-soft`, `--accent-ink`, …); keine Hex-Werte in neuen Regeln.
- Keine Animationen, keine gestrichelten Rahmen, kein `backdrop-filter`. Touch-Ziele 44 px am Finger.
- Nie ein ISO-Datum, nie eine UUID in der Oberfläche.
- Listenmenü höchstens 7 Einträge (Trennstrich zählt nicht), Aufgabenmenü höchstens 4.
- Gates nach jedem Task: `npm run build` grün; `npm run check` nicht mehr als 5 Fehler (Altbestand g2-koppeln); `npm run lint` nicht mehr als 1 Fehler (Altbestand service-worker.ts); ab Task 1 zusätzlich `npm test` grün.
- Commits: deutsch, Präfix `einkauf:`, jede Nachricht endet mit
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` und
  `Claude-Session: https://claude.ai/code/session_01YD2fAmmNzd3chHBcdzEGKb`. Pre-commit-Hook nicht umgehen.
- `/vorschau` (Dev-Server `npm run dev -- --port 5301 --host`, Demodaten, ohne Login) ist die Sichtprüf-Fläche. Demodaten dürfen nie im Prod-Bundle landen (`npm run build && grep -r "Kinderarzt" .svelte-kit/output/` leer).
- `assigned_to`, `calendar_event_id`, `lists.visible` nicht anfassen.

## Review Focus

1. **Mengenangaben und Schreibweisen**: „2x Milch", „Milch (1 l)", „milch" müssen denselben Artikel „Milch" treffen (reaktivieren statt duplizieren) und in „Kühlabteilung" landen; „Kindermilch" muss „Kind" treffen, nicht „Kühlabteilung" (längster Treffer gewinnt). → Tests in Task 1.
2. **Liste ohne passende Kategorie**: Eine frisch umgestellte Liste ohne Kategorien oder ein Artikel ohne Stichwort-Treffer landet in „Sonstiges", das bei Bedarf genau EINMAL angelegt wird; zweimal schnell hintereinander hinzufügen erzeugt kein zweites „Sonstiges". → Test in Task 3.
3. **Artikel von außen (n8n/Telegram, zweites Gerät)**: Eine Top-Level-Aufgabe in einer Einkaufsliste wird einsortiert, ohne dass zwei Geräte zwei „Sonstiges" anlegen — das Einsortieren von außen legt NIE Kategorien an, fehlt eine, bleibt der Artikel im Abschnitt „Ohne Kategorie". → Test in Task 3.
4. **Rückgängig „Einkauf fertig"** stellt genau die vorher im Wagen liegenden Artikel wieder in den Wagen (nicht die schon früher abgelegten). → Test in Task 3.
5. **Umstellen hin und zurück** verliert keine Zeile und keinen Erledigt-Zustand; abgelegte Artikel werden beim Zurückstellen wieder normale erledigte Unteraufgaben. → Test in Task 3.

---

### Task 1: Vitest und reine Einkaufs-Logik

**Files:**
- Modify: `package.json` (Dev-Dependency `vitest`, Script `test`)
- Modify: `vite.config.ts`
- Create: `src/lib/utils/einkauf.ts`
- Test: `src/lib/utils/einkauf.test.ts`

**Interfaces:**
- Consumes: `Database['public']['Tables']['tasks']['Row']` — Task 2 ergänzt `abgelegt: boolean`. Bis dahin arbeitet dieses Modul mit dem schmalen Typ `ArtikelFelder` unten und kompiliert unabhängig.
- Produces:
  - `type ArtikelZustand = 'offen' | 'wagen' | 'abgelegt'`
  - `artikelZustand(t: { done: boolean; abgelegt?: boolean | null }): ArtikelZustand`
  - `normalisiere(text: string): string`
  - `KATEGORIEN: KategorieRegel[]` mit `type KategorieRegel = { schluessel: string; namen: string[]; woerter: string[] }`
  - `findeKategorie<K extends { id: string; text: string }>(artikelText: string, kategorien: K[]): K | null`
  - `istSonstiges(name: string): boolean`
  - `findeArtikel<A extends { text: string }>(text: string, artikel: A[]): A | null`
  - `einkaufsAnsicht<T extends EinkaufsZeile>(zeilen: T[]): EinkaufsAnsicht<T>` mit
    `type EinkaufsZeile = { id: string; parent_id: string | null; type: string; text: string; done: boolean; abgelegt?: boolean | null; position: number; updated_at: string }`,
    `type Abschnitt<T> = { kategorie: T; offen: T[]; wagen: T[]; abgelegt: T[] }`,
    `type EinkaufsAnsicht<T> = { ohneKategorie: T[]; abschnitte: Abschnitt<T>[]; offenAnzahl: number; wagenAnzahl: number }`

- [ ] **Step 1: Vitest installieren und einrichten**

```bash
cd /Users/agentingo/ClaudeProjects/Sandbox/.worktrees/tf-a-klar
npm install -D vitest
```

In `package.json` unter `scripts` ergänzen: `"test": "vitest run"`.

`vite.config.ts` ersetzen durch:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
```

- [ ] **Step 2: Failing tests schreiben** — `src/lib/utils/einkauf.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
	artikelZustand,
	normalisiere,
	findeKategorie,
	findeArtikel,
	istSonstiges,
	einkaufsAnsicht
} from './einkauf';

const kat = (id: string, text: string) => ({ id, text });
const FRANK = [
	kat('g', 'Gemüse'), kat('k', 'Kühlabteilung'), kat('o', 'Obst'), kat('d', 'Dosen'),
	kat('gn', 'Grundnahrung'), kat('gw', 'Gewürze'), kat('t', 'Tiefkühl'), kat('s', 'Snacks'),
	kat('dr', 'Drogerie'), kat('ge', 'Getränke'), kat('ki', 'Kind'), kat('so', 'Sonstiges')
];

describe('artikelZustand', () => {
	it('offen, wagen, abgelegt', () => {
		expect(artikelZustand({ done: false, abgelegt: false })).toBe('offen');
		expect(artikelZustand({ done: true, abgelegt: false })).toBe('wagen');
		expect(artikelZustand({ done: true, abgelegt: true })).toBe('abgelegt');
		expect(artikelZustand({ done: false, abgelegt: true })).toBe('offen');
		expect(artikelZustand({ done: true })).toBe('wagen');
	});
});

describe('normalisiere', () => {
	it('entfernt Mengen, Klammern, Umlaute und Satzzeichen', () => {
		expect(normalisiere('Milch (ganzes Paket)')).toBe('milch');
		expect(normalisiere('2x Milch')).toBe('milch');
		expect(normalisiere('2 × Milch')).toBe('milch');
		expect(normalisiere('Hackfleisch halb/halb (500 g)')).toBe('hackfleisch halb halb');
		expect(normalisiere('Kartoffeln 2,5 kg')).toBe('kartoffeln');
		expect(normalisiere('Gemüse')).toBe('gemuese');
		expect(normalisiere('  Süßkartoffel!  ')).toBe('suesskartoffel');
	});
});

describe('findeKategorie', () => {
	it('ordnet typische Artikel Franks Kategorien zu', () => {
		const fall = (text: string) => findeKategorie(text, FRANK)?.id ?? null;
		expect(fall('Tomaten')).toBe('g');
		expect(fall('Milch')).toBe('k');
		expect(fall('Hafermilch')).toBe('k');
		expect(fall('Kindermilch / Milchpulver')).toBe('ki');
		expect(fall('Fischstäbchen')).toBe('t');
		expect(fall('Stückige Tomaten')).toBe('d');
		expect(fall('Nudeln (verschiedene Sorten)')).toBe('gn');
		expect(fall('Klopapier')).toBe('dr');
		expect(fall('Aperol')).toBe('ge');
		expect(fall('Bananen')).toBe('o');
		expect(fall('Eier')).toBe('k');
		expect(fall('Katzenfutter nass')).toBe(null);
		expect(fall('Blumenstrauß')).toBe(null);
	});
	it('liefert null, wenn die Liste die passende Kategorie nicht hat', () => {
		expect(findeKategorie('Tomaten', [kat('x', 'Drogerie')])).toBe(null);
	});
	it('trifft Kategorienamen tolerant (Aliasse, Groß/klein)', () => {
		expect(findeKategorie('Joghurt', [kat('m', 'Molkerei')])?.id).toBe('m');
		expect(findeKategorie('Pommes', [kat('tk', 'TK')])?.id).toBe('tk');
	});
});

describe('istSonstiges', () => {
	it('erkennt Sonstiges-Varianten', () => {
		expect(istSonstiges('Sonstiges')).toBe(true);
		expect(istSonstiges(' sonstiges ')).toBe(true);
		expect(istSonstiges('Sonstige')).toBe(true);
		expect(istSonstiges('Snacks')).toBe(false);
	});
});

describe('findeArtikel', () => {
	it('findet denselben Artikel trotz Menge und Schreibweise', () => {
		const artikel = [{ text: 'Milch (ganzes Paket)' }, { text: 'Brot' }];
		expect(findeArtikel('2x milch', artikel)?.text).toBe('Milch (ganzes Paket)');
		expect(findeArtikel('Brötchen', artikel)).toBe(null);
	});
});

describe('einkaufsAnsicht', () => {
	const z = (o: Partial<{ id: string; parent_id: string | null; type: string; text: string; done: boolean; abgelegt: boolean; position: number; updated_at: string }>) => ({
		id: 'x', parent_id: null, type: 'task', text: '', done: false, abgelegt: false, position: 0,
		updated_at: '2026-09-01T10:00:00Z', ...o
	});
	it('baut Abschnitte je Kategorie mit offen, wagen, abgelegt', () => {
		const zeilen = [
			z({ id: 'k2', type: 'divider', text: 'Kühl', position: 1 }),
			z({ id: 'k1', type: 'divider', text: 'Gemüse', position: 0 }),
			z({ id: 'a1', parent_id: 'k1', text: 'Tomaten', position: 1 }),
			z({ id: 'a2', parent_id: 'k1', text: 'Gurke', position: 0 }),
			z({ id: 'a3', parent_id: 'k1', text: 'Salat', done: true }),
			z({ id: 'a4', parent_id: 'k2', text: 'Milch', done: true, abgelegt: true, updated_at: '2026-09-01T10:00:00Z' }),
			z({ id: 'a5', parent_id: 'k2', text: 'Butter', done: true, abgelegt: true, updated_at: '2026-09-02T10:00:00Z' }),
			z({ id: 'o1', text: 'Katzenfutter' })
		];
		const a = einkaufsAnsicht(zeilen);
		expect(a.abschnitte.map((s) => s.kategorie.id)).toEqual(['k1', 'k2']);
		expect(a.abschnitte[0].offen.map((t) => t.id)).toEqual(['a2', 'a1']);
		expect(a.abschnitte[0].wagen.map((t) => t.id)).toEqual(['a3']);
		expect(a.abschnitte[1].abgelegt.map((t) => t.id)).toEqual(['a5', 'a4']);
		expect(a.ohneKategorie.map((t) => t.id)).toEqual(['o1']);
		expect(a.offenAnzahl).toBe(3);
		expect(a.wagenAnzahl).toBe(1);
	});
});
```

- [ ] **Step 3: Test laufen lassen, er muss scheitern**

Run: `npm test`
Expected: FAIL — `Cannot find module './einkauf'` bzw. Import-Fehler.

- [ ] **Step 4: Implementierung** — `src/lib/utils/einkauf.ts`

```ts
/**
 * Einkaufs-Modus — reine Logik ohne Store und ohne Datenbank.
 *
 * Spezifikation: docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md
 * Kategorie = Trenner-Zeile (type 'divider', oberste Ebene), Artikel = ihre
 * Unteraufgabe. Zustand eines Artikels aus `done` und `abgelegt`:
 * offen -> im Wagen (abgehakt) -> zuletzt gekauft (abgelegt, nur als Chip).
 */

export type ArtikelZustand = 'offen' | 'wagen' | 'abgelegt';

export function artikelZustand(t: { done: boolean; abgelegt?: boolean | null }): ArtikelZustand {
	if (!t.done) return 'offen';
	return t.abgelegt ? 'abgelegt' : 'wagen';
}

const EINHEIT =
	'(?:x|stk|stueck|g|gr|kg|l|ltr|ml|pck|pack|packung(?:en)?|dosen?|flaschen?|netz|becher|glas|glaeser|bund|beutel|tuete)';
const MENGE = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*${EINHEIT}?(?=\\s|$)`, 'g');

/** Vergleichsform eines Artikel- oder Kategorienamens. */
export function normalisiere(text: string): string {
	return text
		.toLowerCase()
		.replace(/×/g, 'x')
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/\(.*?\)/g, ' ')
		.replace(/[^a-z0-9 ]+/g, ' ')
		.replace(MENGE, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export type KategorieRegel = { schluessel: string; namen: string[]; woerter: string[] };

/**
 * Stichwort-Tabelle. `namen`: so darf die Kategorie in einer Liste heissen
 * (normalisiert). `woerter`: normalisierte Artikel-Stichwoerter. Deutsche
 * Komposita tragen das Grundwort hinten („Hafermilch") — ein Wort trifft,
 * wenn es gleich ist, damit beginnt (Plural) oder damit endet (ab 4 Zeichen).
 * Der LAENGSTE Treffer gewinnt („Kindermilch" -> Kind, nicht Kuehl).
 */
export const KATEGORIEN: KategorieRegel[] = [
	{
		schluessel: 'gemuese',
		namen: ['gemuese', 'gemuese obst', 'obst gemuese', 'obst und gemuese', 'frische'],
		woerter: ['tomate', 'gurke', 'salat', 'moehre', 'karotte', 'paprika', 'zwiebel', 'knoblauch', 'kartoffel', 'suesskartoffel', 'zucchini', 'aubergine', 'brokkoli', 'blumenkohl', 'kohl', 'rotkohl', 'rosenkohl', 'krautsalat', 'fenchel', 'lauch', 'porree', 'spinat', 'pilz', 'champignon', 'suppengruen', 'sellerie', 'radieschen', 'kuerbis', 'avocado', 'ingwer', 'petersilie', 'schnittlauch', 'basilikum', 'rucola', 'spargel']
	},
	{
		schluessel: 'obst',
		namen: ['obst'],
		woerter: ['apfel', 'aepfel', 'banane', 'birne', 'orange', 'mandarine', 'clementine', 'zitrone', 'limette', 'traube', 'erdbeere', 'himbeere', 'blaubeere', 'heidelbeere', 'kiwi', 'ananas', 'mango', 'melone', 'pfirsich', 'nektarine', 'pflaume', 'kirsche']
	},
	{
		schluessel: 'kuehl',
		namen: ['kuehlabteilung', 'kuehlregal', 'kuehl', 'kuehlung', 'molkerei', 'milchprodukte', 'frischetheke', 'wurst und kaese', 'fleisch'],
		woerter: ['milch', 'joghurt', 'jogurt', 'quark', 'sahne', 'schmand', 'creme fraiche', 'butter', 'margarine', 'kaese', 'babybel', 'mozzarella', 'feta', 'frischkaese', 'ei', 'eier', 'wurst', 'aufschnitt', 'fleischwurst', 'salami', 'schinken', 'speck', 'hackfleisch', 'hack', 'haehnchen', 'huehnchen', 'fleisch', 'gyros', 'gyrosfleisch', 'tzatziki', 'schupfnudeln', 'gnocchi', 'teig', 'pudding', 'hefe']
	},
	{
		schluessel: 'tiefkuehl',
		namen: ['tiefkuehl', 'tiefkuehlung', 'tiefkuehlkost', 'tk', 'gefroren', 'tiefgekuehlt'],
		woerter: ['pommes', 'fischstaebchen', 'pizza', 'eis', 'rahmspinat', 'tk']
	},
	{
		schluessel: 'grundnahrung',
		namen: ['grundnahrung', 'grundnahrungsmittel', 'trockenware', 'backwaren', 'brot', 'vorrat', 'vorraete'],
		woerter: ['brot', 'broetchen', 'toast', 'nudel', 'nudeln', 'spaghetti', 'reis', 'mehl', 'zucker', 'muesli', 'haferflocken', 'cornflakes', 'bruehe', 'oel', 'essig', 'honig', 'marmelade', 'nutella', 'kaffee', 'tee', 'kakao', 'doenertasche', 'fladenbrot', 'wraps', 'tortilla', 'zwieback', 'knaeckebrot', 'pizzabroetchen']
	},
	{
		schluessel: 'dosen',
		namen: ['dosen', 'konserven', 'glaeser', 'dosen und glaeser'],
		woerter: ['dose', 'stueckige tomaten', 'passierte tomaten', 'tomatenmark', 'mais', 'kidneybohnen', 'bohnen', 'kichererbsen', 'linsen', 'kokosmilch', 'thunfisch', 'ravioli', 'oliven', 'sauerkraut', 'apfelmus']
	},
	{
		schluessel: 'gewuerze',
		namen: ['gewuerze', 'gewuerz', 'gewuerze und sossen'],
		woerter: ['salz', 'pfeffer', 'paprikapulver', 'curry', 'zimt', 'oregano', 'gewuerz', 'muskat', 'chili', 'kraeuter', 'ketchup', 'senf', 'mayonnaise', 'mayo']
	},
	{
		schluessel: 'snacks',
		namen: ['snacks', 'suesses', 'naschen', 'suessigkeiten', 'knabberzeug'],
		woerter: ['chips', 'schokolade', 'kekse', 'keks', 'gummibaerchen', 'nuesse', 'erdnuesse', 'salzstangen', 'cracker', 'riegel', 'popcorn', 'flips']
	},
	{
		schluessel: 'drogerie',
		namen: ['drogerie', 'hygiene', 'haushalt', 'putzmittel', 'haushaltswaren'],
		woerter: ['shampoo', 'duschgel', 'seife', 'zahnpasta', 'zahnbuerste', 'deo', 'klopapier', 'toilettenpapier', 'kuechenrolle', 'taschentuecher', 'spuelmittel', 'waschmittel', 'weichspueler', 'muellbeutel', 'schwamm', 'spuelmaschinentabs', 'creme', 'rasierer', 'watte', 'pflaster']
	},
	{
		schluessel: 'getraenke',
		namen: ['getraenke', 'trinken', 'getraenkemarkt'],
		woerter: ['wasser', 'sprudel', 'saft', 'cola', 'limo', 'limonade', 'fanta', 'sprite', 'softdrinks', 'softdrink', 'bier', 'wein', 'sekt', 'aperol', 'prosecco', 'schorle', 'eistee', 'energy']
	},
	{
		schluessel: 'kind',
		namen: ['kind', 'baby', 'kinder', 'babybedarf'],
		woerter: ['windel', 'windeln', 'babyfeuchttuecher', 'feuchttuecher', 'kindermilch', 'milchpulver', 'brei', 'quetschie', 'babynahrung', 'schnuller']
	},
	{
		schluessel: 'tier',
		namen: ['tier', 'tiere', 'haustier', 'katze', 'hund', 'tierbedarf'],
		woerter: ['katzenfutter', 'hundefutter', 'katzenstreu', 'streu', 'leckerli']
	}
];

/** Wie gut trifft ein Stichwort den normalisierten Artikeltext? 0 = gar nicht, sonst Laenge. */
function trefferLaenge(artikel: string, wort: string): number {
	if (wort.includes(' ')) return artikel.includes(wort) ? wort.length : 0;
	for (const teil of artikel.split(' ')) {
		if (teil === wort) return wort.length;
		if (wort.length >= 4 && (teil.startsWith(wort) || teil.endsWith(wort))) return wort.length;
	}
	return 0;
}

function regelFuer(artikelText: string): KategorieRegel | null {
	const artikel = normalisiere(artikelText);
	if (!artikel) return null;
	let beste: KategorieRegel | null = null;
	let besteLaenge = 0;
	for (const regel of KATEGORIEN) {
		for (const wort of regel.woerter) {
			const l = trefferLaenge(artikel, wort);
			if (l > besteLaenge) {
				beste = regel;
				besteLaenge = l;
			}
		}
	}
	return beste;
}

/** Passt der Kategoriename einer Liste zu einer Regel? */
function nameTrifft(kategorieName: string, regel: KategorieRegel): boolean {
	const name = normalisiere(kategorieName);
	return regel.namen.some((n) => name === n || name.split(' ').includes(n));
}

/** Kategorie der Liste fuer einen Artikel — oder null (dann „Sonstiges"). */
export function findeKategorie<K extends { id: string; text: string }>(
	artikelText: string,
	kategorien: K[]
): K | null {
	const regel = regelFuer(artikelText);
	if (!regel) return null;
	return kategorien.find((k) => nameTrifft(k.text, regel)) ?? null;
}

export function istSonstiges(name: string): boolean {
	const n = normalisiere(name);
	return n === 'sonstiges' || n === 'sonstige' || n === 'sonstiges und neues' || n === 'diverses';
}

/** Denselben Artikel in der Liste finden (Menge und Schreibweise egal). */
export function findeArtikel<A extends { text: string }>(text: string, artikel: A[]): A | null {
	const gesucht = normalisiere(text);
	if (!gesucht) return null;
	return artikel.find((a) => normalisiere(a.text) === gesucht) ?? null;
}

export type EinkaufsZeile = {
	id: string;
	parent_id: string | null;
	type: string;
	text: string;
	done: boolean;
	abgelegt?: boolean | null;
	position: number;
	updated_at: string;
};
export type Abschnitt<T> = { kategorie: T; offen: T[]; wagen: T[]; abgelegt: T[] };
export type EinkaufsAnsicht<T> = {
	ohneKategorie: T[];
	abschnitte: Abschnitt<T>[];
	offenAnzahl: number;
	wagenAnzahl: number;
};

const nachPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
const neuesteZuerst = (a: { updated_at: string }, b: { updated_at: string }) =>
	Date.parse(b.updated_at) - Date.parse(a.updated_at);

/** Die Zeilen EINER Einkaufsliste als Abschnitte. */
export function einkaufsAnsicht<T extends EinkaufsZeile>(zeilen: T[]): EinkaufsAnsicht<T> {
	const kategorien = zeilen.filter((t) => !t.parent_id && t.type === 'divider').sort(nachPosition);
	const abschnitte: Abschnitt<T>[] = kategorien.map((kategorie) => {
		const kinder = zeilen.filter((t) => t.parent_id === kategorie.id && t.type !== 'divider');
		return {
			kategorie,
			offen: kinder.filter((t) => artikelZustand(t) === 'offen').sort(nachPosition),
			wagen: kinder.filter((t) => artikelZustand(t) === 'wagen').sort(nachPosition),
			abgelegt: kinder.filter((t) => artikelZustand(t) === 'abgelegt').sort(neuesteZuerst)
		};
	});
	// Artikel ohne Kategorie: Zeilen der obersten Ebene (von n8n, G2, einem
	// zweiten Geraet) und Kinder, deren Kategorie es nicht mehr gibt.
	const alleIds = new Set(zeilen.map((t) => t.id));
	const ohneKategorie = zeilen
		.filter((t) => t.type !== 'divider' && (!t.parent_id || !alleIds.has(t.parent_id)))
		.filter((t) => artikelZustand(t) !== 'abgelegt')
		.sort(nachPosition);
	const alle = [...abschnitte.flatMap((a) => [...a.offen, ...a.wagen]), ...ohneKategorie];
	return {
		ohneKategorie,
		abschnitte,
		offenAnzahl: alle.filter((t) => artikelZustand(t) === 'offen').length,
		wagenAnzahl: alle.filter((t) => artikelZustand(t) === 'wagen').length
	};
}
```

- [ ] **Step 5: Test laufen lassen, er muss bestehen**

Run: `npm test`
Expected: PASS (alle Tests in `einkauf.test.ts`). Scheitert ein Zuordnungs-Fall, die Tabelle `KATEGORIEN` ergänzen — nie den Test aufweichen.

- [ ] **Step 6: Gates + Commit**

```bash
npm run build && npm run check | tail -1 && npm run lint | tail -1
git add package.json package-lock.json vite.config.ts src/lib/utils/einkauf.ts src/lib/utils/einkauf.test.ts
git commit -m "einkauf: Vitest und reine Einkaufs-Logik (Einsortieren, Zustaende, Ansicht)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YD2fAmmNzd3chHBcdzEGKb"
```

---

### Task 2: Migrationen, Typen, CRUD

**Files:**
- Create: `supabase/migrations/026_einkaufsmodus.sql`
- Create: `supabase/migrations/026b_einkaufen_umstellen.sql`
- Modify: `src/lib/types/database.ts` (lists: `kind`; tasks: `abgelegt`)
- Modify: `src/lib/services/supabase-crud.ts` (`insertTask` mit `type`, neu `setListKind`, `zeileZumWiedereinfuegen` mit `abgelegt`)
- Modify: alle Stellen, die ein vollständiges `Task`-Objekt bauen (`tasks.svelte.ts` optimistische Zeilen in `addTask`/`addSubtask`, `demo/fixtures.ts` Fabrik `aufgabe()`, `demo/supabase-attrappe.ts` Insert-Default, ggf. `seed-data.ts`) — `abgelegt: false`; alle `List`-Objekte — `kind: 'aufgaben'`.

**Interfaces:**
- Produces:
  - `type ListKind = 'aufgaben' | 'einkauf'` (exportiert aus `src/lib/types/database.ts`)
  - `lists.Row.kind: ListKind`, `tasks.Row.abgelegt: boolean` (Insert/Update optional)
  - `crud.insertTask(sb, data: { id?: string; list_id: string; user_id: string; text: string; position: number; parent_id?: string | null; type?: 'task' | 'divider' })` — `id` vom Client (UUID), damit eine gleich danach angelegte Unteraufgabe auf die richtige Zeile zeigt
  - `crud.setListKind(sb: Sb, id: string, kind: ListKind)`

- [ ] **Step 1: Migration 026 (rein additiv)** — `supabase/migrations/026_einkaufsmodus.sql`

```sql
-- ==========================================
-- 026: Einkaufs-Modus — Datenmodell (rein additiv)
--
-- lists.kind: 'aufgaben' (bisher alle) oder 'einkauf'.
-- tasks.abgelegt: Artikel nach „Einkauf fertig" — erledigt UND abgelegt =
-- „zuletzt gekauft" (nur noch als Chip). Fuer Aufgabenlisten immer false.
-- Beide Spalten mit Default: die bisherige App-Fassung merkt nichts davon.
-- Kategorien sind Trenner-Zeilen (type 'divider'), Artikel ihre
-- Unteraufgaben — dafuer braucht es keine Schemaaenderung.
-- Spezifikation: docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md
-- Wiederholbar.
-- ==========================================
alter table public.lists add column if not exists kind text not null default 'aufgaben';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lists_kind_check') then
    alter table public.lists add constraint lists_kind_check check (kind in ('aufgaben', 'einkauf'));
  end if;
end $$;

alter table public.tasks add column if not exists abgelegt boolean not null default false;
```

- [ ] **Step 2: Migration 026b (Datenumstellung „Einkaufen", erst NACH dem Code-Deploy)** — `supabase/migrations/026b_einkaufen_umstellen.sql`

```sql
-- ==========================================
-- 026b: Liste „Einkaufen" auf den Einkaufs-Modus umstellen
--
-- ERST NACH DEM DEPLOY des Codes anwenden, der Einkaufslisten darstellen
-- kann — die alte Fassung zeigt Trenner mit Unteraufgaben nicht an.
-- „Einkaufen" ist heute mit Aufgaben als Kategorien gebaut (Gemuese,
-- Kuehlabteilung … mit den Artikeln als Unteraufgaben). ALLE Eintraege der
-- obersten Ebene werden Kategorien (auch die derzeit leeren: Obst, Gewuerze,
-- Snacks), bereits abgehakte Artikel gelten als „zuletzt gekauft".
-- Laeuft ohne auth.uid() — die Trigger aus 024 greifen nicht.
-- Wiederholbar: bereits umgestellte Listen (kind = 'einkauf') bleiben unberuehrt.
-- ==========================================
do $$
declare
  l record;
begin
  for l in select id from public.lists where title = 'Einkaufen' and kind = 'aufgaben' loop
    update public.tasks
       set type = 'divider', done = false
     where list_id = l.id and parent_id is null and type = 'task';

    update public.tasks
       set abgelegt = true
     where list_id = l.id and parent_id is not null and done;

    update public.lists set kind = 'einkauf' where id = l.id;
  end loop;
end $$;
```

- [ ] **Step 3: Typen** — in `src/lib/types/database.ts` oben nach den Imports bzw. vor `export type Database` einfügen:

```ts
/** Listentyp — 'einkauf' schaltet den Einkaufs-Modus ein (Migration 026). */
export type ListKind = 'aufgaben' | 'einkauf';
```

`lists.Row` um `kind: ListKind;`, `lists.Insert`/`Update` um `kind?: ListKind;` ergänzen; `tasks.Row` um `abgelegt: boolean;`, `tasks.Insert`/`Update` um `abgelegt?: boolean;`.

- [ ] **Step 4: CRUD** — in `src/lib/services/supabase-crud.ts`:

```ts
export async function insertTask(
	sb: Sb,
	data: {
		id?: string;
		list_id: string;
		user_id: string;
		text: string;
		position: number;
		parent_id?: string | null;
		type?: 'task' | 'divider';
	}
) {
	return sb.from('tasks').insert(data).select().single();
}

export async function setListKind(sb: Sb, id: string, kind: ListKind) {
	return sb.from('lists').update({ kind }).eq('id', id);
}
```

`ListKind` aus `$lib/types/database` importieren. In `zeileZumWiedereinfuegen` das Feld `abgelegt: t.abgelegt` ergänzen (Rückgängig nach Löschen muss den Zustand behalten).

- [ ] **Step 5: Alle Objekt-Bauer nachziehen** — `npm run check` zeigt jede Stelle, an der ein `Task` ohne `abgelegt` oder eine `List` ohne `kind` gebaut wird. Dort `abgelegt: false` bzw. `kind: 'aufgaben'` setzen (Demo-Liste `l-einkaufen` bleibt in DIESEM Task noch `'aufgaben'`; Task 6 stellt sie um). In `demo/supabase-attrappe.ts` beim Insert in `tasks` fehlende Felder mit `abgelegt: false`, `type: 'task'` vorbelegen und `kind: 'aufgaben'` bei `lists`.

- [ ] **Step 6: Gates + Commit**

Run: `npm run build && npm run check | tail -1 && npm run lint | tail -1 && npm test`
Expected: build grün, check 5 Fehler, lint 1 Fehler, Tests grün.

```bash
git add supabase/migrations/026_einkaufsmodus.sql supabase/migrations/026b_einkaufen_umstellen.sql src
git commit -m "einkauf: Migrationen 026/026b, Typen kind/abgelegt, CRUD" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YD2fAmmNzd3chHBcdzEGKb"
```

---

### Task 3: Store-Primitive und Einkaufs-Orchestrierung

**Files:**
- Modify: `src/lib/stores/tasks.svelte.ts` (drei neue Primitive + `loescheMitUndo` exportieren)
- Modify: `src/lib/stores/toast.ts` (`toasts.aktion`) und `src/lib/components/tf/ToastContainer.svelte` (Aktionsknopf mit eigenem Label)
- Create: `src/lib/stores/einkauf.ts`
- Test: `src/lib/stores/einkauf.test.ts`

**Interfaces:**
- Consumes: Task 1 (`findeKategorie`, `findeArtikel`, `istSonstiges`, `artikelZustand`, `einkaufsAnsicht`), Task 2 (`ListKind`, `abgelegt`, `crud.insertTask` mit `type`, `crud.setListKind`).
- Produces (Task-Store, zusätzlich im Rückgabeobjekt):
  - `aendereAufgaben(patches: { id: string; felder: Partial<Task> }[], opt?: { leise?: boolean }): Promise<boolean>`
  - `fuegeEin(zeile: { list_id: string; text: string; parent_id?: string | null; type?: 'task' | 'divider'; position?: number }): Promise<Task | null>`
  - `setzeListenart(listId: string, kind: ListKind): Promise<boolean>`
  - `loescheMitUndo(geloescht: Task[], meldung: string): Promise<void>` (bestehend, jetzt exportiert)
- Produces (Toast): `toasts.aktion(message: string, label: string, onAktion: () => void, duration?: number): { id: string; cancel: () => void }`
- Produces (`stores/einkauf.ts`):
  - `type EinkaufDeps = { readonly tasks: Task[]; readonly lists: List[]; aendereAufgaben; fuegeEin; setzeListenart; loescheMitUndo; toast: { undo(m: string, f: () => void): unknown; aktion(m: string, label: string, f: () => void): unknown; show(m: string): void } }` (Funktionssignaturen wie oben)
  - `type HinzufuegenErgebnis = { art: 'neu' | 'reaktiviert' | 'schon-da'; artikelId: string | null; kategorieName: string | null }`
  - `createEinkauf(deps: EinkaufDeps)` → `{ artikelHinzufuegen(listId, text): Promise<HinzufuegenErgebnis>; artikelUmschalten(id): Promise<void>; wiederDrauf(id): Promise<void>; einkaufFertig(listId): Promise<number>; kategorieWechseln(artikelId, kategorieId): Promise<void>; kategorieAnlegen(listId, name): Promise<Task | null>; kategorieLoeschen(kategorieId): Promise<boolean>; ohneKategorieEinsortieren(listId): Promise<void>; listeUmstellen(listId, kind: ListKind): Promise<boolean>; kategorienVon(listId): Task[] }`

- [ ] **Step 1: Failing tests** — `src/lib/stores/einkauf.test.ts` mit einem In-Memory-Fake der Deps:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createEinkauf, type EinkaufDeps } from './einkauf';

type T = EinkaufDeps['tasks'][number];
type L = EinkaufDeps['lists'][number];

let nr = 0;
function zeile(o: Partial<T>): T {
	return {
		id: `t${++nr}`, list_id: 'L', user_id: 'u', parent_id: null, text: '', type: 'task',
		divider_label: null, done: false, abgelegt: false, priority: 'normal', timeframe: null,
		highlighted: false, pinned: false, pinned_by: null, emoji: null, note: null, due_date: null,
		assigned_to: null, calendar_event_id: null, position: 0,
		created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', version: 1, ...o
	} as T;
}

function fake(start: T[], kind: 'aufgaben' | 'einkauf' = 'einkauf') {
	let tasks = [...start];
	let lists: L[] = [{ id: 'L', user_id: 'u', title: 'Einkaufen', icon: '🛒', position: 0, visible: true, kind, created_at: '', updated_at: '', version: 1 } as L];
	const toasts: string[] = [];
	let letztesUndo: (() => void) | null = null;
	const deps: EinkaufDeps = {
		get tasks() { return tasks; },
		get lists() { return lists; },
		async aendereAufgaben(patches) {
			tasks = tasks.map((t) => {
				const p = patches.find((x) => x.id === t.id);
				return p ? { ...t, ...p.felder } : t;
			});
			return true;
		},
		async fuegeEin(z) {
			const neu = zeile({ ...z, parent_id: z.parent_id ?? null, type: z.type ?? 'task', position: z.position ?? 0 });
			tasks = [...tasks, neu];
			return neu;
		},
		async setzeListenart(id, k) { lists = lists.map((l) => (l.id === id ? { ...l, kind: k } : l)); return true; },
		async loescheMitUndo(g) { const ids = new Set(g.map((t) => t.id)); tasks = tasks.filter((t) => !ids.has(t.id)); },
		toast: {
			undo(m, f) { toasts.push(m); letztesUndo = f; },
			aktion(m) { toasts.push(m); },
			show(m) { toasts.push(m); }
		}
	};
	return { deps, get tasks() { return tasks; }, get lists() { return lists; }, toasts, undo: () => letztesUndo?.() };
}

describe('artikelHinzufuegen', () => {
	it('sortiert per Stichwort in die passende Kategorie', async () => {
		const k = zeile({ id: 'kuehl', type: 'divider', text: 'Kühlabteilung' });
		const f = fake([k]);
		const e = createEinkauf(f.deps);
		const r = await e.artikelHinzufuegen('L', 'Milch');
		expect(r).toMatchObject({ art: 'neu', kategorieName: 'Kühlabteilung' });
		expect(f.tasks.find((t) => t.text === 'Milch')?.parent_id).toBe('kuehl');
	});
	it('reaktiviert einen abgelegten Artikel statt zu duplizieren', async () => {
		const k = zeile({ id: 'kuehl', type: 'divider', text: 'Kühlabteilung' });
		const m = zeile({ id: 'milch', parent_id: 'kuehl', text: 'Milch (ganzes Paket)', done: true, abgelegt: true });
		const f = fake([k, m]);
		const r = await createEinkauf(f.deps).artikelHinzufuegen('L', '2x milch');
		expect(r.art).toBe('reaktiviert');
		expect(f.tasks.filter((t) => t.parent_id === 'kuehl')).toHaveLength(1);
		expect(f.tasks.find((t) => t.id === 'milch')).toMatchObject({ done: false, abgelegt: false });
	});
	it('meldet schon-da, wenn der Artikel offen auf der Liste steht', async () => {
		const k = zeile({ id: 'kuehl', type: 'divider', text: 'Kühlabteilung' });
		const m = zeile({ id: 'milch', parent_id: 'kuehl', text: 'Milch' });
		const f = fake([k, m]);
		const r = await createEinkauf(f.deps).artikelHinzufuegen('L', 'milch');
		expect(r.art).toBe('schon-da');
		expect(f.tasks).toHaveLength(2);
	});
	it('legt Sonstiges genau einmal an, auch bei zwei schnellen Aufrufen', async () => {
		const f = fake([]);
		const e = createEinkauf(f.deps);
		await Promise.all([e.artikelHinzufuegen('L', 'Blumenstrauß'), e.artikelHinzufuegen('L', 'Grillkohle')]);
		expect(f.tasks.filter((t) => t.type === 'divider')).toHaveLength(1);
		expect(f.tasks.filter((t) => t.type === 'task').every((t) => t.parent_id === f.tasks.find((d) => d.type === 'divider')!.id)).toBe(true);
	});
});

describe('Einkauf fertig', () => {
	it('legt nur Artikel im Wagen ab, Rueckgaengig stellt genau die zurueck', async () => {
		const k = zeile({ id: 'k', type: 'divider', text: 'Gemüse' });
		const a = zeile({ id: 'a', parent_id: 'k', text: 'Tomaten', done: true });
		const b = zeile({ id: 'b', parent_id: 'k', text: 'Gurke', done: true, abgelegt: true });
		const c = zeile({ id: 'c', parent_id: 'k', text: 'Salat' });
		const f = fake([k, a, b, c]);
		const n = await createEinkauf(f.deps).einkaufFertig('L');
		expect(n).toBe(1);
		expect(f.tasks.find((t) => t.id === 'a')?.abgelegt).toBe(true);
		f.undo();
		await Promise.resolve();
		expect(f.tasks.find((t) => t.id === 'a')?.abgelegt).toBe(false);
		expect(f.tasks.find((t) => t.id === 'b')?.abgelegt).toBe(true);
	});
});

describe('ohneKategorieEinsortieren', () => {
	it('sortiert Artikel von aussen ein, legt aber nie Kategorien an', async () => {
		const k = zeile({ id: 'g', type: 'divider', text: 'Gemüse' });
		const x = zeile({ id: 'x', text: 'Tomaten' });
		const y = zeile({ id: 'y', text: 'Grillkohle' });
		const f = fake([k, x, y]);
		await createEinkauf(f.deps).ohneKategorieEinsortieren('L');
		expect(f.tasks.find((t) => t.id === 'x')?.parent_id).toBe('g');
		expect(f.tasks.find((t) => t.id === 'y')?.parent_id).toBe(null);
		expect(f.tasks.filter((t) => t.type === 'divider')).toHaveLength(1);
	});
});

describe('listeUmstellen', () => {
	it('hin und zurueck ohne Verlust', async () => {
		const p = zeile({ id: 'p', text: 'Gemüse' });
		const s1 = zeile({ id: 's1', parent_id: 'p', text: 'Tomaten', done: true });
		const s2 = zeile({ id: 's2', parent_id: 'p', text: 'Gurke' });
		const lose = zeile({ id: 'lose', text: 'Milch' });
		const f = fake([p, s1, s2, lose], 'aufgaben');
		const e = createEinkauf(f.deps);
		expect(await e.listeUmstellen('L', 'einkauf')).toBe(true);
		expect(f.lists[0].kind).toBe('einkauf');
		expect(f.tasks.find((t) => t.id === 'p')?.type).toBe('divider');
		expect(f.tasks.find((t) => t.id === 's1')).toMatchObject({ done: true, abgelegt: true });
		expect(await e.listeUmstellen('L', 'aufgaben')).toBe(true);
		expect(f.lists[0].kind).toBe('aufgaben');
		expect(f.tasks).toHaveLength(4);
		expect(f.tasks.find((t) => t.id === 'p')?.type).toBe('task');
		expect(f.tasks.find((t) => t.id === 's1')).toMatchObject({ done: true, abgelegt: false });
		expect(f.tasks.find((t) => t.id === 's2')?.done).toBe(false);
	});
});

describe('kategorieLoeschen', () => {
	it('verschiebt Artikel nach Sonstiges und loescht dann die Kategorie', async () => {
		const k = zeile({ id: 'k', type: 'divider', text: 'Snacks' });
		const a = zeile({ id: 'a', parent_id: 'k', text: 'Chips' });
		const f = fake([k, a]);
		expect(await createEinkauf(f.deps).kategorieLoeschen('k')).toBe(true);
		const sonst = f.tasks.find((t) => t.type === 'divider');
		expect(sonst?.text).toBe('Sonstiges');
		expect(f.tasks.find((t) => t.id === 'a')?.parent_id).toBe(sonst?.id);
		expect(f.tasks.some((t) => t.id === 'k')).toBe(false);
	});
});
```

- [ ] **Step 2: Test laufen lassen — FAIL** (`Cannot find module './einkauf'`).

Run: `npm test`

- [ ] **Step 3: Store-Primitive** — in `src/lib/stores/tasks.svelte.ts` vor `return {` einfügen und im Rückgabeobjekt ergänzen (`aendereAufgaben, fuegeEin, setzeListenart, loescheMitUndo`):

```ts
	// ==========================================
	// GENERISCHE PRIMITIVE (Einkaufs-Modus)
	// ==========================================
	/**
	 * Mehrere Aufgaben feldgenau aendern — optimistisch, bei einem Fehler
	 * nimmt die Ruecknahme ALLE Patches zurueck. `leise`: ohne Fehler-Toast
	 * (Hintergrund-Einsortieren; ein Betrachter darf nicht schreiben, das ist
	 * kein Fehler, den er sehen muss).
	 */
	async function aendereAufgaben(
		patches: { id: string; felder: Partial<Task> }[],
		opt: { leise?: boolean } = {}
	): Promise<boolean> {
		if (patches.length === 0) return true;
		const zurueck = setzeFelderJeAufgabe(patches);
		const ergebnisse = await Promise.all(
			patches.map((p) => crud.updateTaskField(sb, p.id, p.felder))
		);
		if (ergebnisse.some((r) => r.error)) {
			zurueck();
			if (!opt.leise) toasts.error('Speichern fehlgeschlagen');
			return false;
		}
		return true;
	}

	/** Eine Zeile einfuegen (Aufgabe, Unteraufgabe oder Trenner) — optimistisch. */
	async function fuegeEin(zeile: {
		list_id: string;
		text: string;
		parent_id?: string | null;
		type?: 'task' | 'divider';
		position?: number;
	}): Promise<Task | null> {
		const parent_id = zeile.parent_id ?? null;
		const type = zeile.type ?? 'task';
		const position =
			zeile.position ??
			tasks.filter((t) => t.list_id === zeile.list_id && (t.parent_id ?? null) === parent_id).length;
		const jetzt = new Date().toISOString();
		const optimistisch: Task = {
			id: crypto.randomUUID(), list_id: zeile.list_id, user_id: userId, parent_id,
			text: zeile.text, type, divider_label: null, done: false, abgelegt: false, priority: 'normal',
			timeframe: null, highlighted: false, pinned: false, pinned_by: null, emoji: null, note: null,
			due_date: null, assigned_to: null, calendar_event_id: null, position,
			created_at: jetzt, updated_at: jetzt, version: 1
		};
		tasks = [...tasks, optimistisch];
		pendingTaskIds.add(optimistisch.id);
		const fp = taskFingerprint(optimistisch);
		pendingFingerprints.add(fp);
		// Die ID vergibt der Client: eine Kategorie und der erste Artikel darin
		// werden oft direkt nacheinander angelegt — der Artikel muss auf die
		// ID zeigen, die auch auf dem Server steht.
		const { data, error } = await crud.insertTask(sb, {
			id: optimistisch.id, list_id: zeile.list_id, user_id: userId, parent_id, text: zeile.text, position, type
		});
		pendingTaskIds.delete(optimistisch.id);
		pendingFingerprints.delete(fp);
		if (error || !data) {
			tasks = tasks.filter((t) => t.id !== optimistisch.id);
			toasts.error('Speichern fehlgeschlagen');
			return null;
		}
		const server = data as Task;
		tasks = tasks.filter((t) => t.id === optimistisch.id || t.id !== server.id);
		tasks = tasks.map((t) => (t.id === optimistisch.id ? server : t));
		return server;
	}

	/** Listentyp setzen — optimistisch, mit Ruecknahme. */
	async function setzeListenart(listId: string, kind: ListKind): Promise<boolean> {
		const zurueck = setzeListenfelder(listId, { kind });
		const { error } = await crud.setListKind(sb, listId, kind);
		if (error) {
			zurueck();
			toasts.error('Speichern fehlgeschlagen');
			return false;
		}
		return true;
	}
```

(`ListKind` aus `$lib/types/database` importieren.)

- [ ] **Step 4: Toast mit eigenem Aktionslabel** — `src/lib/stores/toast.ts`: `Toast` um `aktionLabel?: string` ergänzen und in `toasts`:

```ts
	/** Hinweis mit EINER Aktion unter eigenem Label (z. B. „Ändern"). */
	aktion(message: string, label: string, onAktion: () => void, duration = 6000) {
		const id = `toast-${++counter}`;
		anzeigen({ id, message, type: 'info', onUndo: onAktion, aktionLabel: label }, duration);
		return { id, cancel: () => entfernen(id) };
	},
```

`ToastContainer.svelte`: den Knopf nicht nur für `type === 'undo'`, sondern immer rendern, wenn `toast.onUndo` gesetzt ist; Beschriftung `{toast.aktionLabel ?? 'Rückgängig'}` (im Markup mit `&uuml;`-Entities wie im Bestand oder direkt als Text).

- [ ] **Step 5: Orchestrierung** — `src/lib/stores/einkauf.ts`

```ts
/**
 * Einkaufs-Modus — Aktionen auf einer Einkaufsliste.
 *
 * Bewusst ohne Runes und ohne Datenbank: alles laeuft ueber die Primitive
 * des Task-Stores (`aendereAufgaben`, `fuegeEin`, …), die hier als `deps`
 * hereinkommen. Dadurch ist das Modul mit einem In-Memory-Fake testbar.
 */
import type { Database, ListKind } from '$lib/types/database';
import { artikelZustand, findeArtikel, findeKategorie, istSonstiges } from '$lib/utils/einkauf';

type Task = Database['public']['Tables']['tasks']['Row'];
type List = Database['public']['Tables']['lists']['Row'];

export type EinkaufDeps = {
	readonly tasks: Task[];
	readonly lists: List[];
	aendereAufgaben(patches: { id: string; felder: Partial<Task> }[], opt?: { leise?: boolean }): Promise<boolean>;
	fuegeEin(zeile: { list_id: string; text: string; parent_id?: string | null; type?: 'task' | 'divider'; position?: number }): Promise<Task | null>;
	setzeListenart(listId: string, kind: ListKind): Promise<boolean>;
	loescheMitUndo(geloescht: Task[], meldung: string): Promise<void>;
	toast: {
		undo(message: string, onUndo: () => void): unknown;
		aktion(message: string, label: string, onAktion: () => void): unknown;
		show(message: string): void;
	};
};

export type HinzufuegenErgebnis = {
	art: 'neu' | 'reaktiviert' | 'schon-da';
	artikelId: string | null;
	kategorieName: string | null;
};

export function createEinkauf(deps: EinkaufDeps) {
	/** Laufende Anlage von „Sonstiges" je Liste — verhindert Doppelte bei schnellen Aufrufen. */
	const sonstigesUnterwegs = new Map<string, Promise<Task | null>>();

	function zeilenVon(listId: string): Task[] {
		return deps.tasks.filter((t) => t.list_id === listId);
	}

	function kategorienVon(listId: string): Task[] {
		return zeilenVon(listId)
			.filter((t) => !t.parent_id && t.type === 'divider')
			.sort((a, b) => a.position - b.position);
	}

	function artikelVon(listId: string): Task[] {
		const kat = new Set(kategorienVon(listId).map((k) => k.id));
		return zeilenVon(listId).filter(
			(t) => t.type !== 'divider' && (!t.parent_id || kat.has(t.parent_id))
		);
	}

	function naechstePosition(listId: string, parentId: string | null): number {
		const geschwister = zeilenVon(listId).filter((t) => (t.parent_id ?? null) === parentId);
		return geschwister.reduce((m, t) => Math.max(m, t.position + 1), 0);
	}

	async function sonstigesSicherstellen(listId: string): Promise<Task | null> {
		const da = kategorienVon(listId).find((k) => istSonstiges(k.text));
		if (da) return da;
		const laeuft = sonstigesUnterwegs.get(listId);
		if (laeuft) return laeuft;
		const neu = deps.fuegeEin({
			list_id: listId,
			text: 'Sonstiges',
			type: 'divider',
			position: naechstePosition(listId, null)
		});
		sonstigesUnterwegs.set(listId, neu);
		try {
			return await neu;
		} finally {
			sonstigesUnterwegs.delete(listId);
		}
	}

	async function artikelHinzufuegen(listId: string, text: string): Promise<HinzufuegenErgebnis> {
		const name = text.trim();
		if (!name) return { art: 'schon-da', artikelId: null, kategorieName: null };
		const vorhanden = findeArtikel(name, artikelVon(listId));
		if (vorhanden) {
			const kategorie = deps.tasks.find((t) => t.id === vorhanden.parent_id)?.text ?? null;
			if (artikelZustand(vorhanden) === 'offen') {
				return { art: 'schon-da', artikelId: vorhanden.id, kategorieName: kategorie };
			}
			await deps.aendereAufgaben([{ id: vorhanden.id, felder: { done: false, abgelegt: false } }]);
			return { art: 'reaktiviert', artikelId: vorhanden.id, kategorieName: kategorie };
		}
		const ziel = findeKategorie(name, kategorienVon(listId)) ?? (await sonstigesSicherstellen(listId));
		if (!ziel) return { art: 'schon-da', artikelId: null, kategorieName: null };
		const neu = await deps.fuegeEin({
			list_id: listId,
			text: name,
			parent_id: ziel.id,
			position: naechstePosition(listId, ziel.id)
		});
		return { art: 'neu', artikelId: neu?.id ?? null, kategorieName: ziel.text };
	}

	/** Tippen auf einen Artikel: offen <-> Wagen; ein abgelegter kommt wieder auf die Liste. */
	async function artikelUmschalten(id: string) {
		const t = deps.tasks.find((x) => x.id === id);
		if (!t) return;
		const z = artikelZustand(t);
		const felder: Partial<Task> =
			z === 'offen' ? { done: true, abgelegt: false } : { done: false, abgelegt: false };
		await deps.aendereAufgaben([{ id, felder }]);
	}

	async function wiederDrauf(id: string) {
		await deps.aendereAufgaben([{ id, felder: { done: false, abgelegt: false } }]);
	}

	async function einkaufFertig(listId: string): Promise<number> {
		const imWagen = artikelVon(listId).filter((t) => artikelZustand(t) === 'wagen');
		if (imWagen.length === 0) return 0;
		const ok = await deps.aendereAufgaben(imWagen.map((t) => ({ id: t.id, felder: { abgelegt: true } })));
		if (!ok) return 0;
		const ids = imWagen.map((t) => t.id);
		deps.toast.undo(
			imWagen.length === 1 ? 'Ein Artikel abgelegt' : `${imWagen.length} Artikel abgelegt`,
			() => {
				void deps.aendereAufgaben(ids.map((id) => ({ id, felder: { abgelegt: false } })));
			}
		);
		return imWagen.length;
	}

	async function kategorieWechseln(artikelId: string, kategorieId: string) {
		const a = deps.tasks.find((t) => t.id === artikelId);
		if (!a || a.parent_id === kategorieId) return;
		await deps.aendereAufgaben([
			{ id: artikelId, felder: { parent_id: kategorieId, position: naechstePosition(a.list_id, kategorieId) } }
		]);
	}

	async function kategorieAnlegen(listId: string, name: string): Promise<Task | null> {
		const text = name.trim();
		if (!text) return null;
		return deps.fuegeEin({ list_id: listId, text, type: 'divider', position: naechstePosition(listId, null) });
	}

	/** Artikel wandern nach „Sonstiges", dann faellt die Kategorie (Aufrufer fragt vorher nach). */
	async function kategorieLoeschen(kategorieId: string): Promise<boolean> {
		const k = deps.tasks.find((t) => t.id === kategorieId);
		if (!k) return false;
		const kinder = deps.tasks.filter((t) => t.parent_id === kategorieId);
		if (kinder.length > 0) {
			let ziel: Task | null = null;
			if (!istSonstiges(k.text)) ziel = await sonstigesSicherstellen(k.list_id);
			if (!ziel) {
				// „Sonstiges" selbst loeschen: Artikel auf die oberste Ebene (Ohne Kategorie).
				const ok = await deps.aendereAufgaben(kinder.map((t) => ({ id: t.id, felder: { parent_id: null } })));
				if (!ok) return false;
			} else {
				let pos = naechstePosition(k.list_id, ziel.id);
				const ok = await deps.aendereAufgaben(
					kinder.map((t) => ({ id: t.id, felder: { parent_id: ziel!.id, position: pos++ } }))
				);
				if (!ok) return false;
			}
		}
		await deps.loescheMitUndo([deps.tasks.find((t) => t.id === kategorieId) ?? k], 'Kategorie gelöscht');
		return true;
	}

	/** Zeilen ohne Kategorie (von n8n, G2, anderem Geraet) einsortieren — legt NIE Kategorien an. */
	async function ohneKategorieEinsortieren(listId: string) {
		const kategorien = kategorienVon(listId);
		if (kategorien.length === 0) return;
		const sonst = kategorien.find((k) => istSonstiges(k.text)) ?? null;
		const lose = zeilenVon(listId).filter((t) => !t.parent_id && t.type === 'task');
		const patches: { id: string; felder: Partial<Task> }[] = [];
		const naechste = new Map<string, number>();
		for (const t of lose) {
			const ziel = findeKategorie(t.text, kategorien) ?? sonst;
			if (!ziel) continue;
			const pos = naechste.get(ziel.id) ?? naechstePosition(listId, ziel.id);
			naechste.set(ziel.id, pos + 1);
			patches.push({ id: t.id, felder: { parent_id: ziel.id, position: pos } });
		}
		if (patches.length > 0) await deps.aendereAufgaben(patches, { leise: true });
	}

	async function listeUmstellen(listId: string, kind: ListKind): Promise<boolean> {
		const zeilen = zeilenVon(listId);
		if (kind === 'einkauf') {
			const elternIds = new Set(zeilen.filter((t) => t.parent_id).map((t) => t.parent_id!));
			const patches: { id: string; felder: Partial<Task> }[] = [];
			for (const t of zeilen) {
				if (!t.parent_id && t.type === 'task' && elternIds.has(t.id)) {
					patches.push({ id: t.id, felder: { type: 'divider', done: false } });
				} else if (t.parent_id && t.done && !t.abgelegt) {
					patches.push({ id: t.id, felder: { abgelegt: true } });
				}
			}
			if (!(await deps.aendereAufgaben(patches))) return false;
			if (!(await deps.setzeListenart(listId, 'einkauf'))) return false;
			await ohneKategorieEinsortieren(listId);
			return true;
		}
		const patches: { id: string; felder: Partial<Task> }[] = [];
		for (const t of zeilen) {
			if (!t.parent_id && t.type === 'divider') patches.push({ id: t.id, felder: { type: 'task' } });
			else if (t.abgelegt) patches.push({ id: t.id, felder: { abgelegt: false } });
		}
		if (!(await deps.aendereAufgaben(patches))) return false;
		return deps.setzeListenart(listId, 'aufgaben');
	}

	return {
		kategorienVon,
		artikelHinzufuegen,
		artikelUmschalten,
		wiederDrauf,
		einkaufFertig,
		kategorieWechseln,
		kategorieAnlegen,
		kategorieLoeschen,
		ohneKategorieEinsortieren,
		listeUmstellen
	};
}
export type Einkauf = ReturnType<typeof createEinkauf>;
```

Hinweis zum Umstellen „aufgaben → einkauf": Top-Level-Aufgaben OHNE Unteraufgaben bleiben zunächst Top-Level und werden durch `ohneKategorieEinsortieren` in eine passende Kategorie gezogen, sonst bleiben sie „Ohne Kategorie" (Spec: Artikel). Der Test in Step 1 erwartet für „Milch" ohne Kühl-Kategorie genau das (bleibt `parent_id: null`, zählt als Zeile).

- [ ] **Step 6: Tests — PASS**

Run: `npm test`
Expected: alle Tests grün (Task 1 + Task 3).

- [ ] **Step 7: Gates + Commit**

```bash
npm run build && npm run check | tail -1 && npm run lint | tail -1
git add src/lib/stores src/lib/components/tf/ToastContainer.svelte
git commit -m "einkauf: Store-Primitive, Aktions-Toast und Einkaufs-Orchestrierung" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YD2fAmmNzd3chHBcdzEGKb"
```

---

### Task 4: Oberfläche `EinkaufsListe`

**Files:**
- Create: `src/lib/components/tf/EinkaufsListe.svelte`
- Modify: `src/lib/components/tf/QuickAdd.svelte` (Prop `platzhalter`, Default „Aufgabe hinzufügen …")
- Modify: `src/lib/components/tf/AppShell.svelte` (Einkauf-Instanz, Umschalten im Snippet `listenInhalt`, Einsortier-Effekt, Kopf ohne Sortierknopf)
- Modify: `src/tf.css` (Regeln `.tf-ek-*`)
- Modify: `src/lib/composables/tf/useContextMenus.svelte.ts` (Kategorie- und Artikelmenü)

**Interfaces:**
- Consumes: `createEinkauf`/`Einkauf` (Task 3), `einkaufsAnsicht`/`artikelZustand` (Task 1), `toasts.aktion` (Task 3), `store.aendereAufgaben` & Co. (Task 3).
- Produces: `EinkaufsListe` Props: `{ list: List; tasks: Task[]; mobil: boolean; einkauf: Einkauf; onKategorieMenue: (e: Zeigerpunkt, kategorie: Task) => void; onArtikelMenue: (e: Zeigerpunkt, artikel: Task) => void; onKategorieNeu: () => void; quickAddVorgabe?: string }`; im Kontextmenü-Composable `handleKategorieContext(e, kategorie)` und `handleArtikelContext(e, artikel)`.

- [ ] **Step 1: AppShell verdrahten** — nach der Anlage von `store` und `historie`:

```ts
	import { createEinkauf } from '$lib/stores/einkauf';
	import EinkaufsListe from '$lib/components/tf/EinkaufsListe.svelte';
	// …
	const einkauf = createEinkauf({
		get tasks() { return store.tasks; },
		get lists() { return store.lists; },
		aendereAufgaben: store.aendereAufgaben,
		fuegeEin: store.fuegeEin,
		setzeListenart: store.setzeListenart,
		loescheMitUndo: store.loescheMitUndo,
		toast: {
			undo: (m, f) => toasts.undo(m, f),
			aktion: (m, l, f) => toasts.aktion(m, l, f),
			show: (m) => toasts.show(m)
		}
	});
	let istEinkauf = $derived(activeList?.kind === 'einkauf');
```

Im Snippet `listenInhalt`: `{#if activeList && istEinkauf}` → `<EinkaufsListe list={activeList} tasks={tasks.filter((t) => t.list_id === activeList.id)} mobil={isMobile} {einkauf} onKategorieMenue={ctx.handleKategorieContext} onArtikelMenue={ctx.handleArtikelContext} onKategorieNeu={kategorieNeu} quickAddVorgabe={vorschauQuickAdd} />`, sonst die bestehende `TaskList`.

```ts
	async function kategorieNeu() {
		if (!activeList) return;
		const name = await showInputDialog('Neue Kategorie', '', '', 'z. B. Backwaren');
		if (name?.trim()) await einkauf.kategorieAnlegen(activeList.id, name.trim());
	}
```

Einsortier-Effekt (Artikel von außen) — eine Menge bereits versuchter IDs verhindert Schleifen:

```ts
	const einsortiertVersucht = new Set<string>();
	$effect(() => {
		if (!activeList || activeList.kind !== 'einkauf') return;
		const listId = activeList.id;
		const lose = tasks.filter(
			(t) => t.list_id === listId && !t.parent_id && t.type === 'task' && !einsortiertVersucht.has(t.id)
		);
		if (lose.length === 0) return;
		for (const t of lose) einsortiertVersucht.add(t.id);
		untrack(() => void einkauf.ohneKategorieEinsortieren(listId));
	});
```

Im Listenkopf den Sortierknopf `tf-sortbtn` nur zeigen, wenn `!istEinkauf`; die Mehrfachauswahl (`bulkMode`) für Einkaufslisten nicht anbieten (Einstieg „Auswählen" fällt in Task 5 aus dem Menü).

- [ ] **Step 2: QuickAdd** — Prop `platzhalter = 'Aufgabe hinzufügen …'` ergänzen und an beiden `placeholder`-Stellen verwenden.

- [ ] **Step 3: `EinkaufsListe.svelte`** — vollständige Komponente:

```svelte
<script lang="ts">
	import type { Database } from '$lib/types/database';
	import type { Zeigerpunkt } from '$lib/composables/tf/useContextMenus.svelte';
	import type { Einkauf } from '$lib/stores/einkauf';
	import { SvelteMap } from 'svelte/reactivity';
	import { einkaufsAnsicht } from '$lib/utils/einkauf';
	import { toasts } from '$lib/stores/toast';
	import QuickAdd from './QuickAdd.svelte';
	import Icon from './Icon.svelte';

	type List = Database['public']['Tables']['lists']['Row'];
	type Task = Database['public']['Tables']['tasks']['Row'];

	/**
	 * Einkaufs-Modus — Spezifikation docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md.
	 * Kategorien sind Abschnitte ohne Haken; Artikel: offen, im Wagen
	 * (durchgestrichen am Abschnittsende), zuletzt gekauft (Chips).
	 */
	let {
		list,
		tasks,
		mobil = false,
		einkauf,
		onKategorieMenue,
		onArtikelMenue,
		onKategorieNeu,
		quickAddVorgabe = ''
	}: {
		list: List;
		tasks: Task[];
		mobil?: boolean;
		einkauf: Einkauf;
		onKategorieMenue: (e: Zeigerpunkt, kategorie: Task) => void;
		onArtikelMenue: (e: Zeigerpunkt, artikel: Task) => void;
		onKategorieNeu: () => void;
		quickAddVorgabe?: string;
	} = $props();

	const CHIPS_MAX = 8;
	let ansicht = $derived(einkaufsAnsicht(tasks));
	const zu = new SvelteMap<string, boolean>();
	const alleChips = new SvelteMap<string, boolean>();

	function istZu(id: string, leer: boolean): boolean {
		return zu.get(id) ?? leer;
	}

	async function hinzufuegen(listId: string, text: string) {
		const r = await einkauf.artikelHinzufuegen(listId, text);
		if (r.art === 'schon-da' && r.artikelId) {
			toasts.show(`„${text.trim()}“ steht schon auf der Liste`);
		} else if (r.artikelId && r.kategorieName) {
			const id = r.artikelId;
			toasts.aktion(`${text.trim()} → ${r.kategorieName}`, 'Ändern', () => {
				const el = document.querySelector(`[data-tf-artikel="${id}"]`);
				const rect = el?.getBoundingClientRect();
				const artikel = tasks.find((t) => t.id === id);
				if (artikel && rect) {
					onArtikelMenue({ clientX: rect.right, clientY: rect.bottom, preventDefault() {} }, artikel);
				}
			});
		}
	}

	function menue(e: MouseEvent, t: Task, art: 'kategorie' | 'artikel') {
		e.preventDefault();
		e.stopPropagation();
		(art === 'kategorie' ? onKategorieMenue : onArtikelMenue)(e, t);
	}
</script>

<QuickAdd listId={list.id} {mobil} vorgabe={quickAddVorgabe} platzhalter="Artikel hinzufügen …" onAdd={hinzufuegen} />

<div class="tf-ek">
	{#if ansicht.ohneKategorie.length > 0}
		<section class="tf-ek-abschnitt" aria-label="Ohne Kategorie">
			<div class="tf-ek-kopf"><span class="tf-ek-titel">Ohne Kategorie</span></div>
			{#each ansicht.ohneKategorie as a (a.id)}
				{@render artikelZeile(a)}
			{/each}
		</section>
	{/if}

	{#each ansicht.abschnitte as s (s.kategorie.id)}
		{@const leer = s.offen.length === 0 && s.wagen.length === 0}
		{@const geschlossen = istZu(s.kategorie.id, leer && s.abgelegt.length === 0)}
		<section class="tf-ek-abschnitt" aria-label={s.kategorie.text}>
			<div class="tf-ek-kopf">
				<button
					class="tf-ek-titel"
					aria-expanded={!geschlossen}
					onclick={() => zu.set(s.kategorie.id, !geschlossen)}
				>
					<Icon name={geschlossen ? 'chevron-rechts' : 'chevron-ab'} size={16} />
					<span class="name">{s.kategorie.text}</span>
					{#if s.offen.length > 0}<span class="cnt">{s.offen.length}</span>{/if}
				</button>
				<button
					class="tf-more"
					aria-label="Kategoriemenü öffnen"
					onclick={(e) => menue(e, s.kategorie, 'kategorie')}
				>
					<Icon name="mehr" size={16} />
				</button>
			</div>
			{#if !geschlossen}
				{#each s.offen as a (a.id)}{@render artikelZeile(a)}{/each}
				{#each s.wagen as a (a.id)}{@render artikelZeile(a)}{/each}
				{#if s.abgelegt.length > 0}
					{@const alle = alleChips.get(s.kategorie.id) ?? false}
					<div class="tf-ek-chips" aria-label="Zuletzt gekauft">
						<span class="lbl">Zuletzt gekauft</span>
						{#each alle ? s.abgelegt : s.abgelegt.slice(0, CHIPS_MAX) as a (a.id)}
							<button class="tf-ek-chip" onclick={() => einkauf.wiederDrauf(a.id)} aria-label={`${a.text} wieder auf die Liste`}>
								<Icon name="plus" size={14} />{a.text}
							</button>
						{/each}
						{#if !alle && s.abgelegt.length > CHIPS_MAX}
							<button class="tf-ek-chip mehr" onclick={() => alleChips.set(s.kategorie.id, true)}>
								+ {s.abgelegt.length - CHIPS_MAX} weitere
							</button>
						{/if}
					</div>
				{/if}
			{/if}
		</section>
	{/each}

	<button class="tf-ek-neu" onclick={onKategorieNeu}>
		<Icon name="plus" size={16} /> Kategorie
	</button>
</div>

{#if ansicht.wagenAnzahl > 0}
	<div class="tf-ek-fertig">
		<button class="tf-btn primaer" onclick={() => einkauf.einkaufFertig(list.id)}>
			Einkauf fertig · {ansicht.wagenAnzahl}
		</button>
	</div>
{/if}

{#snippet artikelZeile(a: Task)}
	{@const imWagen = a.done}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="tf-ek-artikel"
		class:wagen={imWagen}
		data-tf-artikel={a.id}
		oncontextmenu={(e) => menue(e, a, 'artikel')}
	>
		<button
			class="tf-ek-haken"
			role="checkbox"
			aria-checked={imWagen}
			aria-label={imWagen ? `${a.text} zurück auf die Liste` : `${a.text} in den Wagen`}
			onclick={() => einkauf.artikelUmschalten(a.id)}
		>
			<span class="kreis">{#if imWagen}<Icon name="haken" size={14} />{/if}</span>
			<span class="txt">{a.text}</span>
		</button>
		{#if !mobil}
			<button class="tf-more" aria-label="Artikelmenü öffnen" onclick={(e) => menue(e, a, 'artikel')}>
				<Icon name="mehr" size={16} />
			</button>
		{/if}
	</div>
{/snippet}
```

Icon-Namen gegen `Icon.svelte` prüfen (`chevron-ab`, `chevron-rechts`, `mehr`, `plus`, `haken` o. ä.) und fehlende im bestehenden Stil ergänzen (viewBox 24, stroke 1.75). Langes Tippen am Finger löst `contextmenu` aus (Android) — das Menü kommt so auch mobil.

- [ ] **Step 4: Kontextmenüs** — in `useContextMenus.svelte.ts` `deps` um `einkauf: Einkauf` ergänzen und zwei Handler zurückgeben:

```ts
	function handleKategorieContext(e: Zeigerpunkt, kategorie: Task) {
		e.preventDefault();
		oeffnen(e, [
			{
				label: 'Umbenennen',
				icon: 'umbenennen',
				action: async () => {
					const neu = await showInputDialog('Kategorie umbenennen', '', kategorie.text, 'Neuer Name');
					if (neu?.trim()) deps.store.updateTask(kategorie.id, neu.trim());
				}
			},
			{
				label: 'Löschen',
				icon: 'loeschen',
				danger: true,
				action: async () => {
					const n = deps.store.tasks.filter((t) => t.parent_id === kategorie.id).length;
					const ok = await bestaetigen({
						titel: `Kategorie „${kategorie.text}“ löschen?`,
						text: n > 0 ? `${n} Artikel wandern nach „Sonstiges“.` : 'Die Kategorie ist leer.',
						knopf: 'Löschen',
						destruktiv: true
					});
					if (ok) await deps.einkauf.kategorieLoeschen(kategorie.id);
				}
			}
		]);
	}

	function handleArtikelContext(e: Zeigerpunkt, artikel: Task) {
		e.preventDefault();
		const kategorien = deps.einkauf.kategorienVon(artikel.list_id);
		oeffnen(e, [
			{
				label: 'Umbenennen',
				icon: 'umbenennen',
				action: async () => {
					const neu = await showInputDialog('Artikel umbenennen', '', artikel.text, 'Neuer Name');
					if (neu?.trim()) deps.store.updateTask(artikel.id, neu.trim());
				}
			},
			{
				label: 'Kategorie ändern',
				icon: 'verschieben',
				submenu: kategorien.map((k) => ({
					label: k.text,
					active: k.id === artikel.parent_id,
					action: () => void deps.einkauf.kategorieWechseln(artikel.id, k.id)
				}))
			},
			{ divider: true, label: '' },
			{
				label: 'Löschen',
				icon: 'loeschen',
				danger: true,
				action: () => deps.store.deleteTaskDirect(artikel.id)
			}
		], deps.mobil ? 232 : 220, artikel.id);
	}
```

(`bestaetigen` aus `$lib/stores/toast` importieren, Signatur dort prüfen und angleichen; `ContextMenuDeps.store` muss `tasks` und `updateTask` kennen — ggf. Typ erweitern.) In `AppShell` beim Anlegen von `ctx` `einkauf` mitgeben.

- [ ] **Step 5: Styles** — in `src/tf.css` einen Block `/* Einkaufs-Modus */` anlegen, nur mit Token:

```css
/* ---------------------------------------------------------------------
   Einkaufs-Modus (docs/superpowers/specs/2026-09-26-einkaufsmodus-design.md)
   --------------------------------------------------------------------- */
.tf-ek { padding: 4px 0 96px; }
.tf-ek-abschnitt { border-bottom: 1px solid var(--line-2); padding: 6px 0 10px; }
.tf-ek-kopf { display: flex; align-items: center; gap: 4px; padding: 0 12px 0 16px; }
.tf-ek-titel {
	display: flex; align-items: center; gap: 6px; flex: 1; min-height: 40px;
	background: none; border: 0; padding: 0; color: var(--ink-2);
	font: 600 12px/1 var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; text-align: left;
}
.tf-ek-titel .cnt { color: var(--ink-3); font-weight: 500; letter-spacing: 0; }
.tf-ek-artikel { display: flex; align-items: center; padding: 0 12px 0 8px; }
.tf-ek-haken {
	flex: 1; display: flex; align-items: center; gap: 12px; min-height: 44px;
	background: none; border: 0; padding: 0 8px; color: var(--ink); font: 400 15px/1.3 var(--font-ui); text-align: left;
}
.tf-ek-haken .kreis {
	width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--ink-3);
	display: grid; place-items: center; flex: none; color: var(--surface);
}
.tf-ek-artikel.wagen .kreis { background: var(--ink-3); border-color: var(--ink-3); }
.tf-ek-artikel.wagen .txt { color: var(--ink-3); text-decoration: line-through; }
.tf-ek-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 16px 0 16px; align-items: center; }
.tf-ek-chips .lbl { font-size: 12px; color: var(--ink-3); margin-right: 4px; }
.tf-ek-chip {
	display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0 10px;
	border-radius: var(--r-chip); border: 1px solid var(--line); background: var(--surface);
	color: var(--ink-2); font: 500 13px/1 var(--font-ui);
}
.tf-ek-chip.mehr { color: var(--accent-ink); }
.tf-ek-neu {
	display: flex; align-items: center; gap: 6px; min-height: 44px; margin: 8px 16px;
	background: none; border: 0; color: var(--accent-ink); font: 500 14px/1 var(--font-ui);
}
.tf-ek-fertig {
	position: sticky; bottom: 0; padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
	background: var(--bg); border-top: 1px solid var(--line);
}
.tf-ek-fertig .tf-btn { width: 100%; height: 44px; }
@media (pointer: coarse) { .tf-ek-chip { min-height: 44px; } }
```

Existiert `.tf-btn.primaer` nicht, das Muster des Bestands verwenden (z. B. den Primärknopf aus `NewListCard`/`ConfirmDialog`) statt eine neue Farbe zu erfinden. Mobil über der Tab-Leiste: `bottom` an `--tf-tabbar` ausrichten, falls die Liste in einem Scroller über der Leiste steht (in `/vorschau` bei 390×844 prüfen).

- [ ] **Step 6: Sichtprüfung** — nach Task 6 existieren Demodaten; bis dahin mit einer per Menü umgestellten Demo-Liste prüfen (Task 5 liefert den Menüeintrag) oder die Prüfung in Task 6 nachholen. Mindestens: build/check/lint/test grün.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "einkauf: Oberflaeche EinkaufsListe, Kategorie- und Artikelmenue" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YD2fAmmNzd3chHBcdzEGKb"
```

---

### Task 5: Listenmenü, Zähler, Suche, Smart-Ansichten

**Files:**
- Modify: `src/lib/composables/tf/useContextMenus.svelte.ts` (`handleListContext`)
- Modify: `src/lib/components/tf/AppShell.svelte` (`offeneJeListe`, `pinnedTasks`, `dringendTasks`, Suchtreffer öffnen)
- Modify: `src/lib/utils/suche.ts` (Artikel als Treffer)
- Test: `src/lib/utils/suche.test.ts`

**Interfaces:**
- Consumes: `einkaufsAnsicht` (Task 1), `Einkauf.listeUmstellen`, `Einkauf.einkaufFertig` (Task 3).
- Produces: `suchen(tasks, lists, q)` liefert für Einkaufslisten Artikel als Treffer mit `istArtikel: true` (neues optionales Feld am `Treffer`-Typ); `offeneJeListe` zählt in Einkaufslisten offene Artikel.

- [ ] **Step 1: Failing test** — `src/lib/utils/suche.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { suchen } from './suche';

const liste = (id: string, kind: 'aufgaben' | 'einkauf') =>
	({ id, user_id: 'u', title: id, icon: '🛒', position: 0, visible: true, kind, created_at: '', updated_at: '', version: 1 }) as never;
const t = (o: Record<string, unknown>) =>
	({ id: 'x', list_id: 'E', user_id: 'u', parent_id: null, text: '', type: 'task', divider_label: null, done: false, abgelegt: false,
		priority: 'normal', timeframe: null, highlighted: false, pinned: false, pinned_by: null, emoji: null, note: null, due_date: null,
		assigned_to: null, calendar_event_id: null, position: 0, created_at: '', updated_at: '', version: 1, ...o }) as never;

describe('suchen in Einkaufslisten', () => {
	it('findet Artikel unter Kategorien, nicht die Kategorie selbst', () => {
		const r = suchen(
			[t({ id: 'k', type: 'divider', text: 'Kühlabteilung' }), t({ id: 'm', parent_id: 'k', text: 'Milch' })],
			[liste('E', 'einkauf')],
			'milch'
		);
		const alle = [...r.offen, ...r.erledigt];
		expect(alle.map((x) => x.task.id)).toEqual(['m']);
		expect(alle[0].istArtikel).toBe(true);
		expect(suchen([t({ id: 'k', type: 'divider', text: 'Kühlabteilung' })], [liste('E', 'einkauf')], 'kühl').offen).toHaveLength(0);
	});
});
```

(Die tatsächlichen Namen der Ergebnisfelder — `offen`/`erledigt` — gegen `Suchergebnis` in `suche.ts` prüfen und den Test daran angleichen, nicht umgekehrt.)

- [ ] **Step 2: FAIL prüfen** — `npm test`.

- [ ] **Step 3: Suche erweitern** — in `suchen()` vor der bestehenden Schleife eine Menge `einkaufsListen = new Set(lists.filter((l) => l.kind === 'einkauf').map((l) => l.id))` bilden. In der Schleife: Zeilen einer Einkaufsliste gesondert behandeln — Artikel (`type === 'task'`, Top-Level ODER Kind eines Trenners) sind Treffer über `markiere(task.text, begriff)`; `abgelegt` oder `done` → Gruppe `erledigt`; `pfad` = `Kategoriename · Listenname` (ohne Kategorie nur Listenname); Feld `istArtikel: true`. Trenner bleiben ausgeschlossen. Für Aufgabenlisten bleibt alles wie bisher.

- [ ] **Step 4: Suchtreffer öffnen** — in `AppShell` dort, wo ein Treffer die Aufgabe auswählt (`sucheVorschau`/`sucheOeffnenMobil` und die Palette): ist die Ziel-Liste `kind === 'einkauf'`, nur `nav.selectList(listId)` — kein `selectTask` (Artikel haben kein Detail).

- [ ] **Step 5: Zähler und Smart-Ansichten** — `offeneJeListe`:

```ts
	let offeneJeListe = $derived.by(() => {
		const m = new Map<string, number>();
		const einkauf = new Set(lists.filter((l: List) => l.kind === 'einkauf').map((l: List) => l.id));
		for (const t of tasks) {
			if (t.done || t.type === 'divider') continue;
			if (einkauf.has(t.list_id)) {
				m.set(t.list_id, (m.get(t.list_id) ?? 0) + 1); // offene Artikel, jede Ebene
				continue;
			}
			if (t.parent_id) continue;
			m.set(t.list_id, (m.get(t.list_id) ?? 0) + 1);
		}
		return m;
	});
```

`pinnedTasks` und `dringendTasks`: Zeilen aus Einkaufslisten ausschließen (Filter `!einkaufsListen.has(t.list_id)`). Das „N offen" im Listenkopf liest bereits `offeneJeListe`.

- [ ] **Step 6: Listenmenü (≤ 7 Einträge)** — `handleListContext` verzweigt nach `list.kind`:

Aufgabenliste (7): Umbenennen · Icon ändern · Teilen · Auswählen · **Ansicht** (Untermenü: die 5 Sortierungen, Trennstrich, „Als Einkaufsliste") · — · Erledigte löschen · Liste löschen. Der bisherige Eintrag „Sortierung" heißt jetzt „Ansicht", `extra` bleibt das Label der aktuellen Sortierung.

„Als Einkaufsliste" fragt vorher:

```ts
	action: async () => {
		const ok = await bestaetigen({
			titel: `„${list.title}“ als Einkaufsliste nutzen?`,
			text: 'Aufgaben mit Unteraufgaben werden Kategorien, alle anderen Artikel. Zurückstellen geht jederzeit über „Ansicht“.',
			knopf: 'Umstellen',
			destruktiv: false
		});
		if (ok) await deps.einkauf.listeUmstellen(list.id, 'einkauf');
	}
```

Einkaufsliste (7): Umbenennen · Icon ändern · Teilen · Kategorie hinzufügen · **Ansicht** (Untermenü: „Als Aufgabenliste") · — · Einkauf fertig (`extra` = Anzahl im Wagen, `inaktiv` bei 0, ruft `deps.einkauf.einkaufFertig(list.id)`) · Liste löschen. „Kategorie hinzufügen" ruft einen neuen Dep `kategorieNeu(listId)` (AppShell: `showInputDialog` + `einkauf.kategorieAnlegen`). „Als Aufgabenliste" stellt ohne Rückfrage um (verlustfrei) und zeigt `toasts.show('Wieder eine Aufgabenliste')`.

Anzahl im Wagen: `einkaufsAnsicht(deps.store.tasks.filter((t) => t.list_id === list.id)).wagenAnzahl`.

- [ ] **Step 7: Tests PASS + Gates + Commit**

```bash
npm test && npm run build && npm run check | tail -1 && npm run lint | tail -1
git add src
git commit -m "einkauf: Listenmenue mit Ansicht/Listentyp, Zaehler, Suche, Smart-Ansichten" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YD2fAmmNzd3chHBcdzEGKb"
```

---

### Task 6: Vorschau-Demodaten und Sichtprüfung

**Files:**
- Modify: `src/lib/demo/fixtures.ts` (Liste `l-einkaufen` als Einkaufsliste)
- Modify: `src/lib/demo/supabase-attrappe.ts` (Updates auf `lists.kind`, `tasks.abgelegt`/`type`/`parent_id` — generisch, falls schon generisch: nur prüfen)
- Modify: `CLAUDE.md` (Projekt-Referenz: Einkaufs-Modus, neue Dateien, Migrationen 026/026b, `npm test`)
- Screenshots: `/Users/agentingo/ClaudeProjects/Sandbox/projects/taskfuchs-redesign/einkauf-shots/`

**Interfaces:**
- Consumes: alles aus Task 1–5.

- [ ] **Step 1: Demodaten** — `l-einkaufen` bekommt `kind: 'einkauf'`. Die bisherige Kategorie-Aufgabe `t-grundnahrung` wird Trenner (`type: 'divider'`); dazu Trenner „Gemüse", „Kühlabteilung", „Getränke", „Sonstiges" mit Artikeln in allen drei Zuständen: offen (Tomaten, Gurke, Milch, Joghurt), im Wagen (Brot, Eier — `done: true`), zuletzt gekauft (Butter, Käse, Sprudel, Apfelsaft, Hafermilch, Bananen … — `done: true, abgelegt: true`, verschiedene `updated_at`), mindestens eine Kategorie mit > 8 Chips (für „+ N weitere"), eine leere Kategorie („Snacks"), und ein Top-Level-Artikel ohne Kategorie („Grillkohle") für den Abschnitt „Ohne Kategorie". Die Vorschau-Zustände (`?liste=l-einkaufen`) müssen damit funktionieren.

- [ ] **Step 2: Sichtprüfung mit Playwright** gegen `http://localhost:5301/vorschau?liste=l-einkaufen` (Dev-Server bei Bedarf starten: `nohup npm run dev -- --port 5301 --host >/tmp/tf-vorschau.log 2>&1 &`; Browser: `executablePath` auf `~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`, Playwright-Modul aus `/Users/agentingo/ClaudeProjects/agentingo-site/node_modules/playwright/index.mjs`). Desktop 1440×900 hell + dunkel (`&dunkel=1`), Mobil 390×844 (`&tab=listen&offen=1`, isMobile, hasTouch) hell + dunkel. Durchspielen und prüfen:
  1. „Tomaten" antippen → im Wagen (durchgestrichen am Abschnittsende), „Einkauf fertig · N" erscheint.
  2. „Einkauf fertig" → Artikel werden Chips, Undo-Toast; „Rückgängig" stellt sie zurück.
  3. Chip antippen → Artikel wieder offen.
  4. Quick-Add „2x Milch" → „steht schon auf der Liste"; „Pizza" → neuer Artikel, Toast „Pizza → …"/„Sonstiges" mit „Ändern"; „Ändern" öffnet das Artikelmenü mit Untermenü „Kategorie ändern".
  5. Kategorie ⋮ → Umbenennen/Löschen (Dialog nennt die Anzahl), „+ Kategorie".
  6. Listenmenü: genau 7 Einträge, „Ansicht" → „Als Aufgabenliste" stellt um, und zurück über „Als Einkaufsliste" (mit Dialog).
  7. Zähler in Navigation und Kopf = offene Artikel; Suche „milch" findet den Artikel und öffnet nur die Liste.
  8. Keine Konsolenfehler, kein horizontales Scrollen, keine UUID/ISO-Datum im Text, Touch-Ziele ≥ 44 px mobil.
  Screenshots nach `einkauf-shots/` (nummeriert, sprechende Namen).

- [ ] **Step 3: CLAUDE.md** — Abschnitte ergänzen: Tabelle `lists` (`kind`), `tasks` (`abgelegt`), Migrationen 026/026b (026b erst nach Deploy), Komponenten `EinkaufsListe.svelte`, Module `utils/einkauf.ts`, `stores/einkauf.ts`, Build-Befehl `npm test`, Feature-Liste „Einkaufs-Modus", Listenmenü-Beschreibung („Ansicht" statt „Sortierung").

- [ ] **Step 4: Gates + Demo-Leak-Check + Commit**

```bash
npm test && npm run build && npm run check | tail -1 && npm run lint | tail -1
grep -r "Kinderarzt\|Grillkohle" .svelte-kit/output/ | head -1   # muss leer sein
git add src CLAUDE.md
git commit -m "einkauf: Vorschau-Demodaten, Doku, Sichtpruefung" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YD2fAmmNzd3chHBcdzEGKb"
```

---

### Task 7 (Hauptsession, nicht delegieren): Deploy und Nachbarn

- [ ] 026 per Rollback-Test (Management-API, `begin` … `raise exception`) gegen Prod prüfen, dann anwenden (`/database/migrations`).
- [ ] Code: Fast-Forward `main` → Push → GitHub-Action grün → Live-Chunk enthält `einkaufFertig`, keine Demodaten, `/vorschau` 404.
- [ ] 026b per Rollback-Test prüfen (12 Kategorien in „Einkaufen", `abgelegt` = Anzahl zuvor abgehakter Artikel, `kind = 'einkauf'`), dann anwenden.
- [ ] n8n `homelab-taskfuchs-read` („Format Tasks"): Trenner als Kategorie-Überschrift ausgeben, darunter nur offene Artikel (abgelegte nie, erledigte nur bei `showCompleted`); vorher Workflow-JSON sichern.
- [ ] G2 (`taskfuchs-g2`) zeigt Einkaufslisten leer (blendet Trenner und deren Kinder aus) — als bekannte Grenze dokumentieren.
