# Push-Benachrichtigungen für geteilte Listen — Design

**Datum:** 06.10.2026 · **Status:** abgestimmt mit Frank (04.–06.10.), freigegeben zur Umsetzung bis zur ersten Testversion · **Branch:** `feature/push-benachrichtigungen`

## Ziel

Ändert jemand anderes eine geteilte Liste — legt eine Aufgabe an, ergänzt, bearbeitet, hakt ab oder löscht —, bekommen die übrigen Mitglieder eine Push-Benachrichtigung aufs Android-Handy. Eigene Änderungen lösen nichts aus.

### Entscheidungen (Frank)

| Frage | Entscheidung |
|---|---|
| Plattform | **Android**: Taskfuchs-App (TWA) und Chrome. iOS ist nicht Ziel. |
| Häufigkeit | **Gebündelt**: Änderungen einer Person an einer Liste werden gesammelt; eine Meldung, sobald die Person 2 min nichts mehr geändert hat, spätestens 10 min nach der ersten Änderung. Folgemeldungen ersetzen die vorige (gleicher Tag). |
| Agent-Ingo (n8n, `service_role`) | Zählt als **Franks** Änderung, mit Zusatz „(Agent)“. Frank selbst bekommt nichts. |
| Löschen | Wird mitgebündelt (Annahme, von Frank nicht widersprochen). |
| Architektur | **Alles in Supabase**: Trigger → Warteschlange → `pg_cron` → Edge Function → Web Push (VAPID). |

### Nicht-Ziele (erste Fassung)

iOS, E-Mail, Ruhezeiten, „Einkauf fertig“ als eigene Meldung, Benachrichtigung für private Listen, Erinnerungen an Fälligkeiten, Änderungen an Listen selbst (Umbenennen, Teilen).

## Ist-Stand (geprüft 06.10.)

- Kein Push vorhanden: Service Worker cacht nur, keine VAPID-Schlüssel, keine Edge Functions, TWA mit `enableNotifications: false`.
- `tasks` kennt keinen letzten Bearbeiter; `auth.uid()` im Trigger liefert ihn. n8n schreibt mit `service_role` → `auth.uid()` ist `NULL`.
- 6 geteilte Listen, alle `editor`, alle mit derselben zweiten Person.
- `pg_cron`/`pg_net` verfügbar, nicht installiert; `supabase_vault` installiert.
- Nebenbefund: Migration 017 (`enforce_subtask_rules`) ist in Produktion **nicht** angewendet (eigener Punkt, nicht Teil dieses Features).

## Architektur

```
App (Client, anon-Key + RLS)            Supabase                                   Push-Dienst (FCM)
──────────────────────────             ─────────────────────────────────────       ─────────────────
tasks INSERT/UPDATE/DELETE  ──────────▶ Trigger tasks_push_event
                                         └▶ notification_events (Warteschlange)
                                       pg_cron jede Minute (nur wenn Events da)
                                         └▶ pg_net POST /functions/v1/push-versand
                                              Edge Function push-versand
                                              ├ rpc push_buendel_abholen()  (holt + löscht fällige Bündel)
                                              ├ bündeln + Text bauen (rein, getestet)
                                              ├ Web Push (VAPID, aes128gcm) ─────────▶ Gerät
                                              └ rpc push_abo_ergebnis()   (ok / tote Abos löschen)
Service Worker: push → showNotification, notificationclick → /app?liste=<id>
Seite /app/benachrichtigungen: einschalten/ausschalten, Listen stummschalten
```

## Schnittstellen (verbindlich für alle Teilstränge)

### Migration `supabase/migrations/027_push_benachrichtigungen.sql`

Rein additiv. Tabellen, RLS, Trigger, RPCs. Keine Extensions, kein Cron, keine Secrets, keine User-IDs.

**`public.push_subscriptions`** — ein Abo pro Gerät/Browser.

| Spalte | Typ | Regel |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid not null | FK `auth.users` on delete cascade |
| `endpoint` | text not null **unique** | nur bekannte Push-Dienste (Host `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`; nur https, Port 443 oder ohne Port; dieselbe Liste prüft die Function in `webpush.ts`, Beispielliste in beiden Testwelten), kein Userinfo, Pfad nur aus druckbaren ASCII-Zeichen ohne Leerraum, ≤ 1000 Zeichen (Allowlist statt nur `https://`: sonst könnte jedes Konto den Versandlauf auf beliebige oder hängende Ziele lenken) |
| `p256dh` | text not null | base64url ohne Padding, genau 87 Zeichen (65 Byte) |
| `auth` | text not null | base64url ohne Padding, genau 22 Zeichen (16 Byte) |
| `geraet` | text | ≤ 100, Anzeigename („Android · Taskfuchs-App“) |
| `created_at`, `last_seen_at` | timestamptz not null default now() | |
| `last_ok_at` | timestamptz | letzter erfolgreicher Versand |

RLS an. Policies: `select` und `delete` nur eigene Zeilen (`user_id = auth.uid()`). **Kein** direktes `insert`/`update` — Schreiben nur über `push_abo_speichern` (Endpoint-Übernahme bei Gerätewechsel des Kontos). Rechte: `authenticated` hat nur `select`/`delete`, `anon` nichts (auch kein `MAINTAIN`).

**`public.list_notification_mutes`** — eine Zeile = Liste für diese Person stumm. Standard ist „an“.

| Spalte | Typ |
|---|---|
| `user_id` | uuid not null, FK `auth.users` on delete cascade |
| `list_id` | uuid not null, FK `public.lists` on delete cascade |
| `created_at` | timestamptz not null default now() |
| PK | (`user_id`, `list_id`) |

RLS an. `select`/`delete`: `user_id = auth.uid()`. `insert`: `user_id = auth.uid()` **und** die Person sieht die Liste (`is_list_owner(list_id) or has_list_share(list_id)`). Rechte: `authenticated` nur `select`/`insert`/`delete`.

**`public.notification_events`** — Warteschlange, für Clients unsichtbar.

| Spalte | Typ |
|---|---|
| `id` | bigint identity PK |
| `list_id` | uuid not null, FK `public.lists` on delete cascade |
| `actor_id` | uuid not null, FK `auth.users` on delete cascade |
| `via_agent` | boolean not null default false |
| `art` | text not null, check in (`neu`,`erledigt`,`wieder_offen`,`geaendert`,`geloescht`) |
| `task_id` | uuid not null (kein FK — gelöschte Aufgaben bleiben referenzierbar) |
| `task_text` | text not null default '' (gekürzt auf 120 Zeichen) |
| `created_at` | timestamptz not null default now() |

Index `(list_id, actor_id, created_at)`. RLS an, **keine** Policies; `revoke all` von `anon`, `authenticated` (auch auf die Sequenz `notification_events_id_seq`). Nicht in der Realtime-Publikation.

**`public.push_config`** — `key text PK`, `value text not null`. RLS an, keine Policies, `revoke all` von `anon`, `authenticated`. Bekannter Schlüssel: `agent_actor` = User-ID, die für Schreibvorgänge ohne `auth.uid()` als Bearbeiter gilt. **Der Wert wird beim Deploy gesetzt, nicht in der Migration** (öffentliches Repo).

**Trigger `tasks_push_event`** — `AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW`, Funktion `public.push_event_erfassen()`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, für `anon`/`authenticated`/`public` nicht ausführbar.

Regeln, in dieser Reihenfolge:

1. **Darf nie eine Aufgaben-Schreiboperation scheitern lassen:** der ganze Rumpf in `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING … END`; Rückgabe `NULL`.
2. Zeilen mit `type = 'divider'` (Trenner/Kategorien) → nichts.
3. `UPDATE` ohne relevante Änderung → sofort zurück (vor jeder Abfrage). Relevant: `done`, `text`, `note`, `due_date`, `assigned_to`, `priority`, `timeframe`, `list_id`. **Nicht** relevant: `position`, `pinned`, `pinned_by`, `highlighted`, `version`, `updated_at`, `abgelegt`, `calendar_event_id`, `emoji`, `parent_id`.
4. Art bestimmen:
   - `INSERT` → `neu`; `DELETE` → `geloescht`.
   - `UPDATE` mit geänderter `list_id` → `geloescht` in der alten Liste **und** `neu` in der neuen (je nach Regel 5 einzeln geprüft).
   - `done` false→true → `erledigt`; true→false → `wieder_offen`.
   - sonst eine der übrigen relevanten Spalten geändert → `geaendert`.
5. Nur geteilte Listen: es existiert eine Zeile in `list_shares` dieser Liste mit `user_id <> lists.user_id`. Liste nicht (mehr) vorhanden (Kaskade beim Löschen einer Liste) → nichts.
6. Bearbeiter: `auth.uid()`; ist er `NULL` **und** ist der Aufruf ein Dienstaufruf (JWT-Claim `role = service_role`, z. B. n8n über PostgREST), `push_config.agent_actor` mit `via_agent = true`; fehlt der → nichts. Wartungs-SQL ohne Claims (SQL-Editor, Migrationen, MCP `execute_sql`) zählt **nicht** als Agent.
6a. Ein Bearbeiter, der nicht Besitzer oder Mitglied der Liste ist (z. B. nach Entzug der Freigabe, die eigene Aufgabe bleibt bearbeitbar), erzeugt kein Event. Der Agent ist ausgenommen.
7. Insert in `notification_events` mit `left(text, 120)`.

**RPCs** — alle `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `revoke execute … from public, anon`, Grants wie angegeben.

| Funktion | Grant | Verhalten |
|---|---|---|
| `push_abo_speichern(p_endpoint text, p_p256dh text, p_auth text, p_geraet text) returns void` | `authenticated` | Fehler, wenn `auth.uid()` null. Upsert auf `endpoint`: `user_id = auth.uid()`, Schlüssel, `geraet`, `last_seen_at = now()`. Übernimmt einen Endpoint, der vorher einem anderen Konto gehörte (Abmelden/Anmelden auf demselben Gerät), **nur wenn p256dh und auth identisch sind** (dasselbe Gerät liefert dasselbe Abo); sonst Fehler `42501` — der Endpoint allein genügt nicht. Prüft Formate wie die Check-Constraints. |
| `push_abo_loeschen(p_endpoint text) returns void` | `authenticated` | Löscht das eigene Abo mit diesem Endpoint. |
| `push_buendel_abholen(p_ruhe interval default '2 minutes', p_max interval default '10 minutes') returns jsonb` | nur `service_role` | Siehe unten. |
| `push_abo_ergebnis(p_ok text[], p_weg text[]) returns void` | nur `service_role` | `last_ok_at = now()` für `p_ok`; löscht Abos mit Endpoint in `p_weg`. |

**`push_buendel_abholen`** — atomar und doppelt-aufruf-sicher:

1. `pg_try_advisory_xact_lock(hashtext('push_buendel_abholen'))`; ohne Lock → `'[]'`.
2. **Veraltet** (je Event, nicht je Gruppe): Event älter als 1 Tag → löschen, nicht senden; geschieht zuerst, damit ein altes Event weder in einer frischen Gruppe mitfährt noch sie über die Höchstwartezeit fällig macht. Danach Gruppen je (`list_id`, `actor_id`) bilden. **Fällig:** jüngstes Event ≤ `now() - p_ruhe` **oder** ältestes ≤ `now() - p_max`. Die Laufzeit ist linear in Events und Gruppen (kein quadratischer Plan; Test mit 10 000 Gruppen).
3. Events fälliger Gruppen per `DELETE … RETURNING` abholen (Holen = Löschen; ein Fehler beim Versand verliert die Meldung, nie doppelt senden).
4. Ergebnis (jsonb-Array, ein Element je Gruppe):

```json
{
  "list_id": "uuid", "list_title": "Einkaufen", "list_kind": "einkauf",
  "actor_id": "uuid", "actor_name": "Anna", "via_agent": false,
  "events": [ { "task_id": "uuid", "art": "neu", "text": "Milch", "at": "2026-10-06T17:01:02Z" } ],
  "empfaenger": [ { "user_id": "uuid", "abos": [ { "endpoint": "https://…", "p256dh": "…", "auth": "…" } ] } ]
}
```

- `events` aufsteigend nach Zeit, höchstens 200 je Gruppe (ältere werden trotzdem gelöscht).
- `actor_name`: `profiles.display_name`, sonst `username`, sonst `Jemand`.
- `via_agent`: true, wenn irgendein Event der Gruppe es ist.
- `empfaenger`: Besitzer der Liste + alle `list_shares.user_id` (jede Rolle), ohne Bearbeiter, ohne Personen mit Stummschaltung dieser Liste, nur Personen mit mindestens einem Abo. Gruppen ohne Empfänger erscheinen nicht (ihre Events sind trotzdem abgeholt).

### Migration `supabase/migrations/027b_push_cron.sql`

Erst **nach** dem Deploy der Edge Function und dem Anlegen der Vault-Secrets anwenden.

- `create extension if not exists pg_net;` und `pg_cron`.
- Job `push-versand`, Zeitplan `* * * * *`, Kommando:

```sql
select net.http_post(
  url     := (select decrypted_secret from vault.decrypted_secrets where name = 'push_versand_url'),
  headers := jsonb_build_object('content-type', 'application/json',
             'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
  body    := '{}'::jsonb,
  timeout_milliseconds := 70000)  -- Function-Gesamtbudget 60 s (lauf.ts) + Puffer
where exists (select 1 from public.notification_events);
```

- Idempotent (`cron.unschedule` der alten Jobs, falls vorhanden).
- Vault-Secrets `push_versand_url` und `push_cron_secret` legt der Deploy an (`vault.create_secret`), nicht die Migration. Fehlen sie, bricht 027b mit klarer Meldung ab.
- Zwei weitere Jobs, unabhängig vom Versandlauf: `push-aufraeumen` (stündlich, `delete from public.notification_events where created_at < now() - interval '1 day'`) und `push-protokoll-aufraeumen` (täglich, kürzt `cron.job_run_details` auf 3 Tage; sonst eine Zeile je Minute).
- Kontrolle des HTTP-Status der Function: `select status_code, count(*) from net._http_response group by 1;` (`cron.job_run_details` zeigt nur, dass pg_net die Anfrage eingestellt hat).

### Edge Function `supabase/functions/push-versand/`

Deno/TypeScript. `verify_jwt = false` (Aufruf kommt von `pg_cron`); Schutz über Header `x-push-secret`, zeitkonstant verglichen mit `PUSH_CRON_SECRET`. Falsch/fehlend → 401, andere Methode als POST → 405.

| Datei | Inhalt |
|---|---|
| `index.ts` | `Deno.serve`: Secret prüfen, `supabase-js` mit `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, `rpc('push_buendel_abholen')`, je Bündel Text bauen, an alle Abos aller Empfänger senden (begrenzt parallel), `rpc('push_abo_ergebnis')`, Antwort `{ buendel, gesendet, fehler, entfernt }`. Logs nur Zähler — nie Aufgabentexte oder Endpoints. |
| `buendeln.ts` | Rein: Events einer Gruppe je Aufgabe verdichten (s. u.), Zählung je Art, Beispieltexte. |
| `texte.ts` | Rein: deutsche Texte, Payload bauen. |
| `webpush.ts` | Versand (VAPID-JWT ES256 + aes128gcm). Bibliothek nach Test wählen (`jsr:@negrel/webpush` oder `npm:web-push`); die Wahl muss in Deno nachweislich verschlüsseln. Status 404/410 → Abo „weg“; 2xx → „ok“; sonst Fehler zählen, Abo behalten. TTL 21600 s, Urgency `normal`. |
| `*_test.ts` | `deno test` für `buendeln`, `texte`, Secret-Prüfung und Versand-Klassifizierung (gemockt). |

Secrets (Supabase Function Secrets, nie im Repo): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (beide base64url, Format von `web-push generate-vapid-keys`), `VAPID_SUBJECT` = `https://taskfuchs.molltoncreative.de`, `PUSH_CRON_SECRET`.

**Verdichtung je Aufgabe** (`buendeln.ts`): erstes Event `neu` und letztes `geloescht` → Aufgabe fällt weg; sonst enthält die Folge `neu` → `neu`; sonst letzte Art. Danach Zählung je Art; Beispieltexte: bis zu 3 je Art in Reihenfolge des Auftretens. Bleibt nichts übrig → kein Versand.

**Texte** (`texte.ts`): `titel` = Listentitel. `body`:

- genau eine Aufgabe: `<Name>[ (Agent)] hat „<Text>“ <Verb>` mit
  - Aufgabenliste: `hinzugefügt` · `erledigt` · `wieder geöffnet` · `geändert` · `gelöscht`
  - Einkaufsliste (`list_kind = 'einkauf'`): `hinzugefügt` · `in den Wagen gelegt` · `wieder auf die Liste gesetzt` · `geändert` · `gelöscht`
- mehrere: `<Name>[ (Agent)]: <Teile>` in der Reihenfolge neu, erledigt, wieder_offen, geaendert, geloescht; Teil = `<N> <Label>`, bei `neu` mit Beispielen in Klammern (`3 neu (Milch, Brot, Eier)`).
  - Labels Aufgabenliste: `neu` · `erledigt` · `wieder offen` · `geändert` · `gelöscht`
  - Labels Einkaufsliste: `neu` · `in den Wagen` · `wieder auf der Liste` · `geändert` · `gelöscht`
- Body höchstens 180 Zeichen, Kürzung mit `…`; Aufgabentext im Body höchstens 60 Zeichen.

**Payload** (JSON, < 2 KB): `{ "titel", "text", "tag": "tf-<list_id>-<actor_id>", "url": "/app?liste=<list_id>" }`.

### App

| Teil | Inhalt |
|---|---|
| `src/lib/push/vapid.ts` | `VAPID_PUBLIC_KEY` als Konstante (öffentlich). |
| `src/lib/push/abo.ts` | `pushStatus()` → `nicht-unterstuetzt` \| `verweigert` \| `aus` \| `an`; `einschalten(sb)` (Berechtigung **nur nach Klick**, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, `rpc push_abo_speichern`); `ausschalten(sb)` (`rpc push_abo_loeschen`, dann `unsubscribe`); `abgleichen(sb)` beim App-Start, wenn Berechtigung erteilt und Abo vorhanden (frischt `last_seen_at`/Schlüssel auf); `geraetName()` (z. B. „Android · Taskfuchs-App“, „Android · Chrome“). Reine Teile testbar ohne Browser. |
| `src/service-worker.ts` | Zusätzlich `push` → `showNotification(titel, { body: text, tag, renotify: true, icon, badge, data: { url } })` (robust gegen kaputte Payloads: Fallback „Taskfuchs“ / „Neue Änderungen“); `notificationclick` → Benachrichtigung schließen, offenes Fenster fokussieren und auf `url` navigieren, sonst `openWindow(url)`. Fetch-/Cache-Logik bleibt unverändert. Nur gleiche Origin als Ziel. |
| `src/routes/app/benachrichtigungen/+page.svelte` | Eigene Seite wie `g2-koppeln`: Status dieses Geräts, Knopf Einschalten/Ausschalten, Hinweis bei verweigerter Berechtigung, Liste der **geteilten** Listen mit Schalter je Liste (Stummschaltung). Nur `tf.css`-Token, echte `<button>`/`<input type="checkbox">` mit Label, 44-px-Ziele, keine UUIDs, keine Animationen. |
| Zahnrad-Menü | Eintrag „Benachrichtigungen“ (Desktop `NavColumn`, mobil wo das Zahnrad-Menü lebt). |
| Abmelden | Vor `signOut` das Abo dieses Geräts löschen (`ausschalten`), Fehler dabei blockieren das Abmelden nicht. |
| Deep Link | `/app?liste=<id>` öffnet die Liste (mobil: Tab „Listen“, Unterschirm Liste), danach Parameter aus der URL entfernen. Unbekannte ID → normaler Start. |
| Typen | Neue Tabellen in die DB-Typen aufnehmen, falls der Typ-File sie führt. |

### Android-App (TWA)

`twa/twa-manifest.json`: `enableNotifications: true`, Version 1.3 / `versionCode` 6. Projekt mit Bubblewrap aktualisieren (Notification-Delegation, `POST_NOTIFICATIONS`), signiert bauen (Keystore aus `infrastruktur/.env`), prüfen per `aapt2 dump`/`apkanalyzer`: Berechtigung `POST_NOTIFICATIONS`, `DelegationService` aktiv, Package `de.molltoncreative.taskfuchs`, Signatur-SHA256 = `TASKFUCHS_KEYSTORE_SHA256`. APK nicht einchecken (gitignored).

## Sicherheit

- Clients sehen `notification_events` und `push_config` nicht; RPCs für den Versand nur `service_role`.
- Abos nur über RPC schreibbar; Endpoint ist ein Geheimnis des Geräts, Übernahme nur durch eingeloggtes Konto, das ihn kennt.
- Edge Function ohne JWT, aber mit zeitkonstant geprüftem Secret; Secret liegt in Function-Secrets und Vault, nie im Repo.
- Payload ist Ende-zu-Ende verschlüsselt (aes128gcm); der Push-Dienst sieht keine Texte. Logs ohne Texte und Endpoints.
- Trigger ist `SECURITY DEFINER` mit festem `search_path`, nicht per RPC aufrufbar.
- Keine Bearbeitungsprotokolle über das Nötige hinaus: Events leben höchstens bis zum Versand bzw. 1 Tag (je Event erzwungen, zusätzlich stündlicher Aufräum-Job).

### Bekanntes Restrisiko (Produktentscheidung offen)

Empfänger sind Besitzer und **alle** Freigaben. Eine Freigabe braucht keine Zustimmung der Person (Policy aus Migration 003; die ID liefert `lookup_user_by_email`), und nur der Besitzer kann sie löschen. Damit kann ein beliebiges registriertes Konto (Registrierung ist offen) eine Liste mit frei gewähltem Titel anlegen, eine fremde Person freigeben und ihr per Aufgabentext Meldungen aufs Handy schicken, sofern sie Push eingeschaltet hat; stummschalten kann sie erst nach der ersten Meldung. Bremse sind nur die Bündelung (eine Meldung je Liste und Bearbeiter und 10 min) und die Stummschaltung. Für die Testversion mit zwei Personen vertretbar, **vor einem öffentlichen Einsatz entscheiden**: z. B. neue Freigaben starten stumm, bis die Liste einmal geöffnet wurde, plus ein Austrittsrecht für Freigegebene (Delete-Policy auf die eigene Zeile in `list_shares`) und eine Obergrenze je Empfänger und Stunde.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Trigger-Fehler | Warnung im Log, Schreibvorgang gelingt trotzdem. |
| Edge Function nicht erreichbar | Events bleiben liegen, nächste Minute neuer Versuch; nach 1 Tag verworfen. |
| Zwei Läufe gleichzeitig | Advisory-Lock + `DELETE … RETURNING` → nie doppelt. |
| Abo abgelaufen (404/410) | Abo wird gelöscht. |
| Push-Dienst-Fehler sonst | Meldung verloren (bewusst: lieber eine Meldung zu wenig als doppelt), Abo bleibt. |
| Berechtigung entzogen | Status `verweigert`, Seite erklärt, wie man sie in Android wieder erteilt. |
| Kaputte Payload im SW | Fallback-Text, nie eine Exception im SW. |

## Tests

- **Datenbank** (lokale Supabase per Docker, Migrationen 001–027): pgTAP unter `supabase/tests/push_benachrichtigungen.test.sql` — Trigger (jede Art, Trenner, irrelevante Updates, private Liste, Verschieben, Kaskade, `service_role` mit/ohne `agent_actor`, Fehler bricht Schreiben nicht), RLS (fremde Abos/Mutes unsichtbar, Events/Config unsichtbar, Mute nur für sichtbare Listen), RPC-Rechte (`anon`/`authenticated` dürfen Versand-RPCs nicht), `push_buendel_abholen` (Fälligkeit 2/10 min, veraltet > 1 Tag, Empfänger ohne Bearbeiter/Stumme/ohne Abo, Doppelaufruf liefert nichts doppelt).
- **Edge Function:** `deno test` (rein + gemockter Versand), dazu ein echter Verschlüsselungs-Nachweis der gewählten Bibliothek.
- **App:** Vitest für die reinen Teile von `abo.ts` und Deep-Link-Parsing; `npm run check`, `npm run lint` ohne neue Fehler, `npm run build`.
- **Ende-zu-Ende (Testversion):** Franks Handy abonniert; Testereignisse werden direkt in `notification_events` gelegt (Bearbeiter = zweite Person, geteilte Liste) — keine sichtbaren Datenänderungen; Meldung kommt innerhalb von ~3 min, Tipp öffnet die Liste.

## Auslieferung der ersten Testversion

1. Migration 027 in Produktion (rein additiv; Trigger fehlertolerant).
2. VAPID-Schlüssel erzeugen; Function-Secrets setzen; Edge Function deployen; Smoke: 401 ohne Secret, 200 mit Secret.
3. Vault-Secrets anlegen, `push_config.agent_actor` setzen, Migration 027b anwenden; Cron-Lauf prüfen (`cron.job_run_details`).
4. App deployen (Opt-in, ohne Einschalten ändert sich für niemanden etwas); APK 1.3 bauen und an Frank geben.
5. Ende-zu-Ende-Test mit Frank.

Rückbau: Cron-Job entfernen, Trigger droppen — App und Daten bleiben unberührt.
