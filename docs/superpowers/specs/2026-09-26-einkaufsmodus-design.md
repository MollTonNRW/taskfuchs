# Einkaufs-Modus — Design

Stand 26.09.2026 · Entscheide von Frank (Chat 25.09., 23:21 ff.)

## Zweck

Die Liste „Einkaufen" ist heute mit Aufgaben als Kategorien gebaut (Gemüse, Kühlabteilung … mit den
Artikeln als Unteraufgaben). Folgen: Kategorien haben einen Haken, zählen als 12 offene Aufgaben und
sind standardmäßig eingeklappt. Ziel ist ein eigener Listentyp **Einkaufsliste**, der sich im Laden
bedient wie ein Einkaufszettel: Abschnitte, Artikel mit einem Tipp abhaken, Wiederkehrendes mit einem
Tipp zurück auf die Liste.

## Entscheide (fix)

| Frage | Entscheid |
|---|---|
| Umsetzung | Eigener Listentyp „Einkaufsliste" (nicht nur Trenner, nicht „so lassen") |
| Nach dem Einkauf | **Merken zum Nachkaufen**: „Einkauf fertig" räumt abgehakte Artikel ab; sie bleiben je Kategorie als „Zuletzt gekauft"-Chips erreichbar, ein Tipp setzt sie wieder auf die Liste. Nichts wird gelöscht |
| Kategorien | Überschriften ohne Haken, zählen nicht als offen |
| Neuer Artikel | Quick-Add sortiert automatisch in eine Kategorie ein (keine Rückfrage) |

## Datenmodell — Migration `026_einkaufsmodus.sql`

- `lists.kind text not null default 'aufgaben' check (kind in ('aufgaben','einkauf'))`.
- **Kategorie = Trenner-Zeile** (`tasks.type = 'divider'`, `parent_id is null`, Name in `text`;
  `divider_label` bleibt ungenutzt wie bisher). G2 und der E-Ink-Dienst blenden Trenner bereits aus
  (`type != divider`), die Datenbank-Einschränkung `tasks_type_check` bleibt unverändert.
- **Artikel = Unteraufgabe der Kategorie** (`parent_id` = Kategorie-Zeile, `type = 'task'`).
- **Abgelegt**: neue Spalte `tasks.abgelegt boolean not null default false`. Zustände eines Artikels:
  offen (`done=false`) → im Wagen (`done=true, abgelegt=false`, durchgestrichen am Abschnittsende)
  → zuletzt gekauft (`done=true, abgelegt=true`, nur noch als Chip). „Wieder draufsetzen" =
  `done=false, abgelegt=false`.
- Übernahme der Liste „Einkaufen" (eigene Migration `026b`, nach dem Deploy): `kind='einkauf'`; die 12 Top-Level-Aufgaben → `type='divider'`;
  bereits abgehakte Artikel → `abgelegt=true` (landen als Chips, die Liste startet leer bis auf offene Artikel).
- Die Trigger aus 024 (Unteraufgaben nur an bearbeitbare Aufgaben) gelten unverändert — eine Kategorie
  ist eine Aufgabe der Liste.

## Oberfläche (Richtung A „Klar")

**Liste im Einkaufs-Modus** (`TaskList.svelte` verzweigt auf `list.kind === 'einkauf'`, eigene Komponente
`EinkaufsListe.svelte`):
- Oben Quick-Add „Artikel hinzufügen …". Einsortieren: (1) gleichnamiger Artikel existiert in der Liste
  (auch abgelegt) → dieser wird reaktiviert statt dupliziert; (2) Stichwort-Tabelle
  (`utils/einkauf-kategorien.ts`, deutsch, z. B. Tomate→Gemüse, Joghurt→Kühlabteilung, Pizza→Tiefkühl,
  Wasser→Getränke, Shampoo→Drogerie), zugeordnet über den Kategorienamen der Liste;
  (3) sonst Kategorie „Sonstiges" (wird bei Bedarf angelegt). Ein kurzer Toast nennt das Ziel
  („Milch → Kühlabteilung · Ändern").
- Je Kategorie ein Abschnitt: Überschrift (Name, Anzahl offener Artikel), offene Artikel, darunter
  die im Wagen (durchgestrichen), darunter eine Chip-Zeile „Zuletzt gekauft" (neueste zuerst, max. 8,
  „+ N weitere" klappt auf). Leere Kategorien ohne Chips sind eingeklappt.
- Artikel: großer Haken (44 px), Tippen auf die Zeile = abhaken. Langes Tippen / ⋮ → Umbenennen,
  Kategorie ändern, Löschen. Keine Priorität, kein Fällig, kein Verlauf, kein Detail-Sheet.
- Statt „Erledigte löschen" **„Einkauf fertig"** (nur wenn etwas im Wagen ist) →
  alle Artikel im Wagen `abgelegt=true`, Undo-Toast. Als Leiste unten in der Liste plus Eintrag im
  Listenmenü (Ruling R2, nicht im Kopf).
- Kategorien verwalten: ⋮ an der Überschrift (Umbenennen, Löschen — Artikel wandern nach „Sonstiges")
  und „+ Kategorie" am Ende. Reihenfolge per Ziehen wie bisher bei Top-Level-Zeilen.
- Artikel ohne Kategorie (z. B. von n8n/Telegram als Top-Level-Aufgabe angelegt) sortiert der Client
  beim Laden bzw. beim Realtime-Insert per Stichwort-Tabelle ein (deterministisch, daher auch bei zwei
  Geräten gleichzeitig unkritisch). Nachtrag 26.09. (Gesamt-Review): Anders als das Quick-Add legt das
  Einsortieren von außen **nie** eine Kategorie an (Ruling R4) und fällt **nicht** auf „Sonstiges"
  zurück — ohne Stichwort-Treffer bleibt der Artikel unter „Ohne Kategorie". Grund: Löscht ein zweites
  Gerät gerade „Sonstiges", würden dessen kurz losen Artikel sonst zurückgehängt und von der
  Lösch-Kaskade mitgenommen. Zeilen mit Unteraufgaben sind nie ein Artikel und werden nie einsortiert;
  ihre Kinder zeigt „Ohne Kategorie" mit an.
- Zähler in Navigation/Übersicht: offene Artikel (nicht Kategorien, nicht Chips).

**Listentyp umschalten**: Listenmenü „Als Einkaufsliste" / „Als Aufgabenliste".
- Aufgaben → Einkauf: Top-Level-Aufgaben MIT Unteraufgaben werden Kategorien, Top-Level-Aufgaben ohne
  Unteraufgaben werden Artikel und einsortiert. Vorhandene Trenner sind Kategorien.
- Einkauf → Aufgaben: Kategorien MIT Artikeln werden wieder Aufgaben (`type='task'`), leere bleiben
  Trenner (Zwischenüberschrift). Abgelegte Artikel und Artikel im Wagen sind erledigte Unteraufgaben.
  Beide Richtungen verlustfrei, auch im Rundlauf: Der Wechsel ändert nie `done` oder `abgelegt` eines
  Artikels (Nachtrag 26.09.). Eine erstmals umgestellte Aufgabenliste hat ihre erledigten Unteraufgaben
  darum im Wagen, „Einkauf fertig" legt sie ab. Die Erstübernahme von „Einkaufen" (026b) legt sie direkt ab.

**Überall sonst**: Suche findet Artikel (nicht Kategorien); Smart-Ansichten „Angepinnt"/„Dringend"
ignorieren Einkaufslisten-Artikel; abgelegte Artikel zählen nirgends.

## Nicht im Umfang (YAGNI)

Mengen/Einheiten als eigenes Feld (steht wie heute im Text), Preise, Läden, Rezepte, KI-Einsortierung,
Teilen einzelner Artikel, Offline-Modus.

## Risiken

- n8n `homelab-taskfuchs-read` baut Unteraufgaben über `parent_id` und kennt Top-Level nur ohne Trenner —
  Artikel unter Kategorien könnten dort als verwaiste Unteraufgaben erscheinen. Wird im Plan geprüft und
  ggf. im Workflow angepasst (Homelab-Absprache).
- G2 zeigt Unteraufgaben ohne Trenner-Filter — Artikel erscheinen dort wie heute als Unteraufgaben.

## Prüfung

Build/Check/Lint wie bisher; `/vorschau` bekommt eine Demo-Einkaufsliste; Sichtprüfung hell/dunkel,
Desktop/Mobil; Rollback-Test der Migration 026 gegen Prod (Übernahme „Einkaufen", Zähler, Trigger 024);
Deploy-Reihenfolge: `026` nur additiv (zwei Spalten mit Default — alte App merkt nichts) → Code → `026b` stellt
„Einkaufen" um (Kategorien → Trenner, Abgehakte → abgelegt). Erst nach dem Code, weil die alte Fassung
Trenner mit Unteraufgaben nicht darstellen kann.
