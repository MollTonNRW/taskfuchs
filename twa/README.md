# TWA (Android)

Gradle-Projekt der Trusted Web Activity, erzeugt mit Bubblewrap (`@bubblewrap/cli`, global als `bubblewrap`). Quelle der Wahrheit für Host, Package, Version und Farben ist `twa-manifest.json`. Host `taskfuchs.molltoncreative.de`, Package `de.molltoncreative.taskfuchs`.

Nicht im Repo (gitignored): `taskfuchs-keystore.jks`, `local.properties`, `*.apk`, `*.apk.idsig`, `*.aab`, `app/build/`.

## Voraussetzungen

- `~/.bubblewrap/config.json` mit `jdkPath` (JDK 17) und `androidSdkPath`.
- `twa/taskfuchs-keystore.jks` und `twa/local.properties` (`sdk.dir=…`) liegen lokal.
- Alias, Passwort und erwarteter Fingerabdruck stehen in der lokalen `.env` der Infrastruktur (nicht im Repo) als `TASKFUCHS_KEYSTORE_ALIAS`, `TASKFUCHS_KEYSTORE_PASSWORD`, `TASKFUCHS_KEYSTORE_SHA256`. Nie ausgeben, nie in Dateien oder Commits schreiben.

## Bubblewrap-Stolperfallen

- Immer `</dev/null` anhängen. Fragt Bubblewrap interaktiv nach etwas, bricht der Lauf ab, statt zu hängen.
- Hilfe über `bubblewrap help build`. `bubblewrap build --help` zeigt keine Hilfe, sondern hängt ohne Ausgabe (im Test minutenlang).
- Ohne `--skipSigning` und ohne Passwort-Variablen fragt `bubblewrap build` interaktiv nach dem Keystore-Passwort (bei leerem stdin Abbruch mit `ERR_USE_AFTER_CLOSE`). Deshalb wird mit `apksigner` signiert (unten): Das Passwort bleibt in der Umgebung und nie in Argumenten.

## Version ändern oder Projekt neu erzeugen

`bubblewrap update` überschreibt handangepasste Dateien. Ein Test mit Bubblewrap 1.24.1 hat das bestätigt. Betroffen sind:

| Datei                                                                            | Folge ohne Wiederherstellung                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `app/src/main/res/drawable-*/splash.png`, `drawable/splash.png` (1080×1920)      | dunkler Splash wird ersetzt, `drawable/splash.png` wird gelöscht                                                  |
| `app/src/main/res/mipmap-*/ic_launcher.png`, `ic_maskable.png`, `store_icon.png` | Launcher-Icons werden ersetzt                                                                                     |
| `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`, `values/colors.xml`        | `ic_launcher_background` wird weiß bzw. fällt weg                                                                 |
| `app/src/main/res/drawable-*/ic_notification_icon.png`                           | Benachrichtigungs-Kleinsymbol wird wieder das deckende Vollfarb-Logo (Android zeigt dann ein einfarbiges Quadrat) |
| `build.gradle` (Root)                                                            | `mavenCentral()` wird zu `jcenter()`, der Gradle-Build hängt an einem abgekündigten Repo                          |
| `app/src/main/res/raw/web_app_manifest.json`, `xml/shortcuts.xml`                | Momentaufnahme des Live-Manifests bzw. nur Lizenzkopf, harmlos, aber unnötiger Diff                               |

Ablauf in `twa/`:

```bash
# 1. Version in twa-manifest.json anheben (appVersionName, appVersionCode, appVersion)
bubblewrap update --skipVersionUpgrade </dev/null

# 2. Handangepasste Dateien zurückholen
git checkout HEAD -- \
  app/src/main/res/drawable/splash.png \
  app/src/main/res/drawable-{m,h,xh,xxh,xxxh}dpi/{splash,ic_notification_icon}.png \
  app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/{ic_launcher,ic_maskable}.png \
  app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml \
  app/src/main/res/values/colors.xml \
  app/src/main/res/raw/web_app_manifest.json \
  app/src/main/res/xml/shortcuts.xml \
  build.gradle store_icon.png

# 3. Diff prüfen: erwartet sind nur Version, app/build.gradle,
#    manifest-checksum.txt und gewollte Feature-Änderungen
git diff --stat
```

Danach prüfen, dass Host, Package, Fingerabdruck und Asset-Links in `twa-manifest.json` unverändert sind. `npm test` enthält einen Test für das Benachrichtigungs-Kleinsymbol und schlägt an, wenn Schritt 2 vergessen wurde.

## Bauen und signieren

```bash
cd twa
bubblewrap build --skipSigning --skipPwaValidation </dev/null   # erzeugt app-release-unsigned-aligned.apk

# apksigner braucht Java: JAVA_HOME auf das JDK aus ~/.bubblewrap/config.json (jdkPath) setzen
source <lokale .env mit den TASKFUCHS_KEYSTORE_*-Variablen>
export KS_PASS="$TASKFUCHS_KEYSTORE_PASSWORD"
<androidSdkPath>/build-tools/<Version>/apksigner sign \
  --ks taskfuchs-keystore.jks --ks-key-alias "$TASKFUCHS_KEYSTORE_ALIAS" \
  --ks-pass env:KS_PASS --key-pass env:KS_PASS \
  --out taskfuchs-v<Version>.apk app-release-unsigned-aligned.apk
```

`<androidSdkPath>` und `<Version>` (Build-Tools) sind Platzhalter. Das Passwort geht nur über die Umgebungsvariable an `apksigner`, nie als Argument.

## Prüfen

Mit `aapt2` und `apksigner` aus denselben Build-Tools:

```bash
aapt2 dump badging taskfuchs-v<Version>.apk | grep ^package   # Package, versionCode, versionName
aapt2 dump permissions taskfuchs-v<Version>.apk               # u. a. POST_NOTIFICATIONS
apksigner verify --verbose --print-certs taskfuchs-v<Version>.apk
```

Die Zeile `Signer #1 certificate SHA-256 digest` muss dem Wert aus `TASKFUCHS_KEYSTORE_SHA256` entsprechen (Doppelpunkte und Groß-/Kleinschreibung ignorieren). Derselbe Fingerabdruck steht in `twa-manifest.json` und `static/.well-known/assetlinks.json`.

APK nicht mit `unzip` auf macOS entpacken, um Ressourcen zu prüfen: Das Dateisystem ist case-insensitiv, die verschleierten Namen unter `res/` (zum Beispiel `KS.png` und `Ks.png`) überschreiben sich gegenseitig. Einzelne Einträge mit `unzip -p` oder Pythons `zipfile` lesen.
