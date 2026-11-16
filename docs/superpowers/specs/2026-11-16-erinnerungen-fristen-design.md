# Erinnerungen an Fristen (Push)

Stand: 16.11.2026 · Auftrag Frank: „Benachrichtigungsfunktion in der App für Aufgaben mit Frist“

Baut auf der Push-Strecke aus [2026-10-06-push-benachrichtigungen-design.md](2026-10-06-push-benachrichtigungen-design.md) auf: dieselben Abos, derselbe Cron-Job, dieselbe Edge Function. Neu ist nur, *wann* eine Meldung entsteht.

## Was die Person erlebt

- **Tagesmeldung:** einmal am Tag zur eigenen Uhrzeit (Standard 08:00) eine Meldung mit allem, was heute fällig oder überfällig ist. Titel „Heute fällig“ (sonst „Überfällig“ bzw. „Morgen fällig“), im Text bis zu drei Aufgaben, der Rest als Zahl: „„Steuer“, „Kinderarzt“ (09:00) · 1 überfällig · 1 morgen“. Ein Tipp öffnet die Liste, wenn alles in einer liegt, sonst die Ansicht „Dringend“ (`/app?ansicht=dringend`).
- **Termin:** Aufgaben mit Uhrzeit (`due_date` „2026-11-19T09:00“) melden sich zusätzlich einzeln, Standard 30 Minuten vorher: Titel = Aufgabe, Text „In 30 Minuten, um 09:00 · Familie“. Ein Tipp öffnet die Liste.
- **Einstellungen** auf `/app/benachrichtigungen`, Abschnitt „Fristen“, gelten für alle Geräte der Person:
  - an/aus,
  - Uhrzeit der Tagesmeldung (05:00–22:00, halbstündlich),
  - „Auch nennen, was morgen fällig ist“,
  - Vorlauf für Aufgaben mit Uhrzeit: zur Uhrzeit, 15, 30, 60 oder 120 Minuten.

  Ohne gespeicherte Zeile gilt: an, 08:00, ohne Vortag, 30 Minuten.

## Welche Aufgaben, wer wird erinnert

- **Welche:** offen, mit Frist, keine Trenner, keine Unteraufgaben (wie die Ansicht „Dringend“), nicht abgelegt, nicht in Einkaufslisten.
- **Wer:** die Person, der die Aufgabe zugewiesen ist, solange sie die Liste noch sieht (Besitzer oder Freigabe). Sonst der Besitzer der Liste, auch wenn eine Freigabe entzogen wurde, die Zuweisung aber stehen blieb. So erfährt niemand nach dem Entzug weiter Aufgabentexte.
- Die Regel steht an einer Stelle: View `push_fristen_aufgaben` (security_invoker, für Clients gesperrt).
- Jede Person bekommt nur ihre eigenen Erinnerungen (auch Anna) und kann sie abschalten. Meldungen kommen nur auf Geräten an, auf denen Benachrichtigungen eingeschaltet sind.

## Zeitregeln

- Fristen sind Ortszeit, Kalendertage und Uhrzeiten gelten in `Europe/Berlin`.
- **Tagesmeldung:** höchstens eine je Person und Kalendertag. Sie wird nur in den drei Stunden ab der eigenen Uhrzeit verschickt. Fällt der Lauf länger aus oder meldet sich jemand abends erst an, kommt die nächste Meldung am folgenden Tag statt mitten in der Nacht. Überfällig zählt bis 60 Tage zurück; die Meldung trägt höchstens 20 Aufgaben (früheste Frist zuerst) plus die Gesamtzahl.
- **Termin:** fällig ab Frist minus Vorlauf, höchstens bis zwei Stunden nach der Frist (Ausfall). Kommt die Meldung später als zwei Minuten nach dem Erinnerungszeitpunkt, nennt der Text keinen Vorlauf mehr, sondern „Um 09:00 fällig“, „Jetzt, 09:00“ oder „Seit 09:00 fällig“ (`minuten_bis` aus der Datenbank). Je Aufgabe und Fristwert genau eine Meldung; wird die Frist verschoben, kommt sie erneut.
- **Kaputte Fristwerte** („morgen“, „2026-02-30“, „…T25:99“) ergeben in `tf_frist_tag`/`tf_frist_zeit` NULL statt eines Fehlers. Sie brechen den Lauf nie ab. Ein gültiges Datum mit kaputter Uhrzeit zählt in der Tagesmeldung, aber nicht als Termin.

## Ablauf

1. Der Cron-Job `push-versand` (jede Minute) ruft die Function auf, wenn Bündel warten **oder** `push_fristen_faellig()` meldet, dass eine Erinnerung dran ist (028b). Sonst kein Aufruf.
2. Die Function holt erst die Bündel (`push_buendel_abholen`), dann die Erinnerungen (`push_fristen_abholen`). Das Abholen vermerkt sofort (`push_fristen_versand`, `push_termin_versand`). Scheitert der Versand, fällt die Erinnerung aus, sie kommt nie doppelt (wie bei den Bündeln). Eine Tagesmeldung ohne fällige Aufgaben wird ohne Meldung vermerkt.
3. Scheitert das Abholen der Erinnerungen (etwa alte Datenbank ohne 028), gehen die Bündel trotzdem raus; der Bericht zählt einen Fehler `fristen`. Logs enthalten nur Zahlen, nie Aufgabentexte.
4. Abo-Ergebnisse (abgelaufene Abos) laufen über das bestehende `push_abo_ergebnis`.

## Datenbank (Migration 028, rein additiv)

| Objekt | Zweck | Rechte |
|---|---|---|
| `tf_frist_tag(text)`, `tf_frist_zeit(text)` | Fristen sicher lesen | nur Besitzer/service_role |
| View `push_fristen_aufgaben` | welche Aufgaben, wer wird erinnert | für Clients gesperrt |
| `push_fristen_einstellungen` | Einstellungen je Person (Check: Raster 05:00–22:00, Vorlauf 0/15/30/60/120) | lesen: eigene Zeile; schreiben nur über RPC |
| `push_fristen_versand`, `push_termin_versand` | Versandprotokolle, 14 Tage | RLS ohne Policies |
| RPC `push_fristen_einstellen(aktiv, uhrzeit, vortag, vorlauf)` | Einstellungen speichern | authenticated |
| `push_fristen_faellig(jetzt)`, `push_fristen_abholen(jetzt)` | Cron-Bedingung, Abholen | service_role |

028b ändert nur die Bedingung des Jobs `push-versand`. Reihenfolge beim Ausrollen: 028 → Function deployen → 028b von Hand (die CLI überspringt Dateien mit Buchstabensuffix).

## Tests

- pgTAP `supabase/tests/push_fristen.test.sql`: Rechte, Einstellungen, Uhrzeit/Zeitzone, Zeitfenster, Auswahl der Aufgaben, Zuständigkeit inklusive entzogener Freigabe, Obergrenze, Termine, kaputte Werte. `push_cron.test.sql` prüft die neue Bedingung.
- Deno (`supabase/functions/push-versand`): Texte, Lauf mit und ohne Bündel, Fehlerpfade, RPC-Aufruf.
- Vitest: Hilfen der Einstellungsseite, Deep Link `?ansicht=`, SSR der Seite (zeigt vor der Hydrierung keine Einstellungen).

## Bewusst nicht

- Keine eigene Abschaltung nur der Termin-Meldungen. Wer keine Erinnerung zur Uhrzeit will, trägt keine Uhrzeit ein.
- Keine Zeitzone je Person: Haushalt in Deutschland.
- Keine Wiederholung bei verpasstem Versand.
