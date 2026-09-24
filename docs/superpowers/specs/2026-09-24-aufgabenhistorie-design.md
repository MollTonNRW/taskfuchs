# Aufgabenhistorie — Design

Stand 24.09.2026 · Entscheide von Frank (Chat 10:29–13:15) · Ansatz A (eigene Tabelle)

## Zweck

Mitglieder einer Liste hinterlassen an einer Aufgabe kurze Eintraege, damit die anderen wissen,
**was schon passiert ist** oder **worauf gerade gewartet wird**. Die Historie ist **optional**:
eine Aufgabe ohne Eintraege ist der Normalfall — kein Pflichtfeld, kein Hinweis, keine Leere-Mahnung.
Die Historie ersetzt die Spalte `tasks.progress` (Angefangen/Fast fertig), die ersatzlos entfaellt.

## Entscheide (fix)

| Frage | Entscheid |
|---|---|
| Eintragsarten | Zwei: `stand` („Stand") und `wartet` („Wartet auf") |
| Ende des Wartens | Knopf **„Ist da"** am Warte-Eintrag (setzt `resolved_at/by`); mehrere offene Wartepunkte parallel moeglich; zuruecknehmbar |
| Warte-Symbol | Aufgabenzeile zeigt ein Sanduhr-Symbol, solange ≥1 offener Warte-Eintrag existiert UND die Aufgabe nicht erledigt ist |
| Rechte | **„Alle alles"**: wer die Aufgabe bearbeiten darf (Aufgaben-Ersteller, Listenbesitzer, Share-Rolle owner/editor), darf JEDEN Eintrag schreiben, bearbeiten, loeschen, „Ist da" setzen/zuruecknehmen. Share-Rolle `viewer` nur lesen |
| Sichtbarkeit | Wer die Aufgabe sehen darf, sieht ihre Historie |
| `progress` | Entfaellt. Vorhandene Werte (11 Aufgaben, alle Top-Level) werden vorher als `stand`-Eintrag uebernommen |
| `assigned_to`, `calendar_event_id`, `lists.visible` | Bleiben unveraendert (nicht anfassen) |
| Geltungsbereich | Nur Top-Level-Aufgaben (`parent_id is null`, `type = 'task'`). Keine Historie an Unteraufgaben/Trennern |
| Nicht im Umfang (YAGNI) | Benachrichtigungen, Suche in Historie, Historie in Teilen-Text, Kopieren beim Duplizieren, Aendern der Eintragsart |

## Datenmodell — Migration `022_task_history.sql`

```
public.task_history
  id           uuid pk default gen_random_uuid()
  task_id      uuid not null references public.tasks(id) on delete cascade
  kind         text not null check (kind in ('stand','wartet'))
  body         text not null check (char_length(btrim(body)) between 1 and 1000)
  created_by   uuid references auth.users(id) on delete set null   -- Autor
  created_at   timestamptz not null default now()
  edited_at    timestamptz            -- zuletzt bearbeitet (Text)
  edited_by    uuid references auth.users(id) on delete set null
  resolved_at  timestamptz            -- nur kind='wartet': „Ist da"
  resolved_by  uuid references auth.users(id) on delete set null
  check (kind = 'wartet' or (resolved_at is null and resolved_by is null))
Indizes: (task_id, created_at desc); partiell (task_id) where kind='wartet' and resolved_at is null
```

- **Helfer** (security definer, `set search_path = public`, stable):
  `can_view_task(uuid)` = Aufgabe existiert und (`user_id = auth.uid()` or `is_list_owner(list_id)` or `has_list_share(list_id)`),
  `can_edit_task(uuid)` = dasselbe mit `has_list_share(list_id, array['owner','editor'])` — spiegelt exakt die bestehenden `tasks`-Policies.
- **RLS**: select `can_view_task(task_id)`; insert/update/delete `can_edit_task(task_id)` (update: using + with check).
- **Trigger** (before insert/update, security invoker): wenn `auth.uid()` gesetzt ist, erzwingt er auf INSERT `created_by = auth.uid()`, `created_at = now()`, `edited_* = null`, `resolved_* = null`; auf UPDATE bleiben `task_id`, `kind`, `created_by`, `created_at` unveraenderlich (auf OLD zurueckgesetzt), bei geaendertem `body` setzt er `edited_at = now()`, `edited_by = auth.uid()`; wechselt `resolved_at` von null auf gesetzt → `resolved_at = now()`, `resolved_by = auth.uid()`; zurueck auf null → beide null. Ohne `auth.uid()` (Migration/Service) laesst er die Werte unangetastet.
- `anon` bekommt keine Rechte (`revoke all ... from anon`).
- Realtime: `alter publication supabase_realtime add table public.task_history`.
- **Papierkorb fuers Rueckgaengig** (nachgetragen nach dem Review 24.09.): Aufgaben loescht der Client sofort und fuegt
  sie beim Rueckgaengig neu ein; die Kaskade naehme den Verlauf endgueltig mit. Darum legt ein AFTER-DELETE-Trigger
  (security definer) Eintraege, deren Aufgabe weg ist, samt Originalstempeln in `public.task_history_papierkorb`
  (RLS an, keine Policies, keine Rechte fuer anon/authenticated; `geloescht_von = auth.uid()`). Die RPC
  `restore_task_history(p_task_ids uuid[])` (security definer) holt nach dem Wiedereinfuegen nur, was der Aufrufer
  selbst geloescht hat und nur an Aufgaben mit `can_edit_task`, und liefert die Zeilen. Der Stempel-Trigger stempelt
  nur Schreibvorgaenge der Rolle `authenticated` — in der RPC bleiben Autor, Zeiten und „Ist da" erhalten.
  Aelter als eine Stunde wird weggeraeumt. Ohne `auth.uid()` (Dienst, n8n) kein Papierkorb.

## `progress` entfernen — Migration `023_drop_task_progress.sql`

Erst NACH dem Deploy des Codes, der `progress` nicht mehr schreibt (sonst schlaegt Aufgabe-Anlegen fehl).
1. Uebernahme: fuer jede Top-Level-Aufgabe mit `progress in (1,2,3)` ein `stand`-Eintrag
   „Fortschritt vor der Umstellung: Angefangen (33 %)" / „Fast fertig (66 %)" / „Fertig (100 %)",
   `created_by = tasks.user_id`, `created_at = tasks.updated_at`.
2. `alter table public.tasks drop column progress`.
Geprueft 24.09.: keine View, keine Funktion, kein n8n-Workflow (homelab-taskfuchs-mutations/-read), keine API-Route
und das G2-Projekt nutzen `tasks.progress` (die Treffer in Gamification-Funktionen betreffen `daily_quests.progress`).
Offene Browser-Tabs mit der alten Version muessen einmal neu laden (Service-Worker ist network-first, Navigationen ungecacht).

## Oberflaeche (Richtung A „Klar", Tokens aus `tf.css`)

**Aufgabendetail** (Spalte Desktop / Sheet Mobile, `TaskDetail.svelte`): neue Gruppe **„Verlauf"** direkt unter der Notiz.
- **Eingabe oben**: kleines Segment `Stand | Wartet auf` (Default Stand) + mitwachsendes Textfeld
  (Platzhalter „Was ist passiert?" bzw. „Worauf wartet ihr?") + Knopf „Eintragen" (erst aktiv mit Text).
  Enter sendet, Shift+Enter = Zeilenumbruch. Nach dem Senden leer, Fokus bleibt. Max. 1000 Zeichen.
- **Eintraege darunter, neueste zuerst**: Avatar (bestehende Avatar-Logik) · Name · relative Zeit
  („gerade eben", „vor 5 Min.", „gestern 14:10", sonst Datum) · „(bearbeitet)" falls `edited_at`.
  Warte-Eintraege tragen Sanduhr + Praefix „Wartet auf", offen mit Knopf **„Ist da"**; eingeloest
  gedaempft mit „Ist da · Name · Zeit" und der Moeglichkeit, das zurueckzunehmen.
- **Bearbeiten/Loeschen**: pro Eintrag dezente Aktionen (Bearbeiten inline, Loeschen mit Undo-Toast
  im bestehenden Toast-Muster). Fuer alle mit Schreibrecht an JEDEM Eintrag.
- **Leer**: nur die Eingabe, kein Leer-Text der zum Fuehren draengt.
- **Nur lesen** (viewer): keine Eingabe, keine Aktionen.
- Tastatur/Screenreader: alle Knoepfe fokussierbar mit sichtbarem Ring, `aria-label`s, Segment als Radiogruppe.

**Aufgabenzeile** (`TaskRow.svelte`): offene Warte-Eintraege + Aufgabe offen → Sanduhr-Symbol in der Metazeile
(Farbe `--ink-2`), `title`/`aria-label` „Wartet auf: <Text des neuesten offenen>" (+ „und N weitere").
Gilt ueberall, wo Zeilen erscheinen (Listen, Smart-Ansichten, Suche soweit Zeilen).

## Daten im Client

- Neuer Store `src/lib/stores/history.svelte.ts` (Muster wie `tasks.svelte.ts`): 
  `offeneWarte` (Map taskId → offene Warte-Eintraege, beim App-Start EINE Abfrage `kind='wartet' and resolved_at is null`),
  Verlauf pro Aufgabe lazy beim Oeffnen des Details (Cache), `add`, `edit`, `resolve`, `unresolve`, `remove` optimistisch mit Rollback + Fehler-Toast.
- Realtime-Kanal auf `task_history` (INSERT/UPDATE/DELETE; DELETE liefert nur `id` → per id entfernen), Muster wie `tf-tasks-realtime` in `AppShell.svelte`.
- Aufgabe geloescht (auch „Erledigte loeschen") → Cache-Eintraege der Aufgabe verwerfen.
  Rueckgaengig → nach dem Wiedereinfuegen `restore_task_history` und die gelieferten Zeilen einsetzen;
  Loeschen fehlgeschlagen → offene Warte-Eintraege der Aufgaben neu laden (Sanduhr).
- Angefangene Eingaben je Aufgabe liegen im Store und ueberdauern das Schliessen von Detail/Sheet.
- Namen/Avatare aus der bestehenden Profilquelle.
- `progress` verschwindet aus Typen (`database.ts`), Insert-Payloads (`tasks.svelte.ts`), Sortierung/Filter, Seed-/Demo-Daten.
- `/vorschau` (Demodaten, `supabase-attrappe.ts`, `demo/fixtures.ts`) unterstuetzt die Historie mit ein paar Beispiel-Eintraegen
  (mind. eine Aufgabe mit offenem Warte-Eintrag, eine mit eingeloestem, eine mit Stand-Eintraegen von zwei Personen).

## Pruefung

`npm run build`, `npm run check` (nicht mehr als die 5 Altfehler), `npm run lint` (nicht mehr als Altbestand),
Demodaten nicht im Prod-Bundle, Sichtpruefung in `/vorschau` hell+dunkel, Desktop+Mobile.
RLS-Test gegen die echte DB in einer zurueckgerollten Transaktion (Besitzer / editor / viewer / Fremder) — macht die Hauptsession beim Deploy,
einschliesslich Aufgabe loeschen → wieder einfuegen → `restore_task_history` (Originalstempel zurueck, Papierkorb fuer
authenticated nicht lesbar, fremder Aufrufer holt nichts).

## Deploy-Reihenfolge

1. `022` anwenden (additiv) + RLS-Test + Advisors
2. Code nach `main` (Fast-Forward) → GitHub Action → Cloudflare Pages, live pruefen
3. `023` anwenden (Uebernahme + Drop), Aufgabe anlegen live pruefen
