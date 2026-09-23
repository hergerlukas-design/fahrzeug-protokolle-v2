# Fahrzeug-Protokolle v2 – Claude Code Arbeitsanweisung

## Neuen Feature-Branch holen und lokal starten

Wenn ein neuer Branch von Claude Code (Web) erstellt wurde, z.B. nach einem
Feature-Auftrag, führe folgende Schritte aus:

```bash
# 1. Alle Remote-Branches holen
git fetch origin

# 2. Auf den neuen Branch wechseln (Branch-Name aus GitHub PR entnehmen)
git checkout claude/vehicle-list-organization-1fFmw

# 3. Abhängigkeiten installieren (falls package.json geändert wurde)
npm install

# 4. Dev-Server starten
npm run dev
```

## Lokalen Stand mit Remote synchronisieren

```bash
# Neueste Commits vom Remote-Branch holen
git pull origin claude/vehicle-list-organization-1fFmw
npm install   # nur nötig wenn package.json geändert wurde
```

## Branch in main mergen (nach PR-Approval)

```bash
git checkout main
git pull origin main
git merge claude/vehicle-list-organization-1fFmw
git push origin main
```

## Umgebungsvariablen

Die `.env`-Datei liegt lokal und ist in `.gitignore`. Sie wird **nie** ins
Repo eingecheckt. Inhalt:

```
VITE_SUPABASE_URL=https://DEIN_PROJEKT.supabase.co
VITE_SUPABASE_KEY=dein-anon-public-key
VITE_APP_PASSWORD=dein-pin
```

## Deploy

Ein Push auf `main` löst den Workflow `.github/workflows/deploy.yml` aus, der
über den Fly-Remote-Builder baut und deployt. Nötig sind die Repository-Secrets
`FLY_API_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` und
`VITE_APP_PASSWORD` (Settings → Secrets and variables → Actions); fehlt eines,
bricht der Workflow mit einer entsprechenden Meldung ab.

Die `VITE_*`-Werte stehen bewusst **nicht** in der `fly.toml`, weil sie ins
Client-Bundle kompiliert werden. Ein Deploy von Hand braucht sie deshalb als
Build-Args:

```bash
flyctl deploy --remote-only \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_KEY="$VITE_SUPABASE_KEY" \
  --build-arg VITE_APP_PASSWORD="$VITE_APP_PASSWORD"
```

Ohne die Build-Args entsteht ein Bundle ohne Supabase-Zugang, bei dem auch der
Login nicht funktioniert.

## Vorschau-Umgebung für Pull Requests

Jeder Pull Request wird über `.github/workflows/preview.yml` auf **eine feste,
gemeinsame** Fly-App deployt:

```
https://fahrzeug-protokolle-v2-preview.fly.dev
```

Die URL kommentiert die Action an den PR; bei jedem weiteren Push wird
derselbe Kommentar aktualisiert.

### Einmalige Einrichtung

```bash
fly apps create fahrzeug-protokolle-v2-preview
fly tokens create deploy -a fahrzeug-protokolle-v2-preview
```

Den Token als Secret `FLY_API_TOKEN_PREVIEW` hinterlegen (Settings → Secrets
and variables → Actions). Der produktive Deploy benutzt weiterhin
`FLY_API_TOKEN`.

Eine so angelegte App hat noch **keine IP-Adresse** — anders als bei
`fly launch`. Ohne IP existiert kein DNS-Eintrag und die URL löst nicht auf,
obwohl der Deploy durchläuft. Der Workflow legt die Adressen deshalb selbst
an, falls sie fehlen (die gemeinsame IPv4 ist kostenlos).

### Zu wissen

- **Eine App für alle PRs.** Bei mehreren gleichzeitig offenen PRs
  überschreibt der neuere Push den älteren; der PR-Kommentar nennt den Stand.
  Bewusst so: eine App pro PR müsste der Workflow selbst anlegen, und ein
  Token mit dieser Berechtigung öffnet das gesamte Fly-Konto.
- Die Vorschau nutzt **dieselbe Supabase-Datenbank** wie die produktive App.
  Dort angelegte Daten sind echt.
- Sie läuft mit `min_machines_running = 0` (`fly.preview.toml`) und fährt nach
  einiger Zeit ohne Zugriff herunter. Der nächste Aufruf dauert dann länger.
- Optional lässt sich eine abweichende PIN als Secret
  `VITE_APP_PASSWORD_PREVIEW` hinterlegen; ohne das Secret gilt die produktive.
- PRs aus Forks bekommen keine Vorschau — GitHub gibt dort keine Secrets frei.

## Kalender-Import für Überführungen

Termine aus einem veröffentlichten iCloud-Kalender lassen sich auf der Seite
"Überführungen" als Überführung übernehmen.

### Einrichtung

1. Die Eigentümerin bzw. der Eigentümer des Kalenders aktiviert
   **Kalender → Freigabe → Öffentlicher Kalender** und schickt den
   `webcal://`-Link. Nur die Besitzerin kann das; eine Einladung an die eigene
   Apple-ID erzeugt **keine** abrufbare URL.
2. Den Link als Secret `TRANSFER_CALENDAR_URL` hinterlegen:
   Dashboard → **Edge Functions → Secrets**. Ein erneutes Deployen ist nicht
   nötig, der Wert steht sofort bereit.

Der Link gehört **nicht** in die `.env` — alle `VITE_*`-Werte werden ins
Client-Bundle kompiliert und sind im Browser lesbar. Und er ist wie ein
Passwort zu behandeln: wer ihn hat, sieht alle Termine des Kalenders.

### Wie es funktioniert

Die Edge Function `transfer-calendar` liest den Feed serverseitig — nötig,
weil die URL geheim ist und iCloud keine CORS-Header liefert. Sie gibt die
Termine als JSON zurück und rührt die Datenbank nicht an.

Die App ordnet das Fahrzeug über das Kennzeichen im Termintitel zu und merkt
sich in `transfers.calendar_uid`, welcher Termin schon übernommen wurde.
Gespeichert wird erst nach Bestätigung im Formular — die Zuordnung ist ein
Vorschlag, keine Automatik.

Der Termintitel wird als `transfers.title` übernommen und steht im Kopf der
Karte, das Kennzeichen eine Zeile darunter. Aus den Notizen des Termins liest
`src/lib/calendarContact.ts` zusätzlich Ansprechpartner und Telefonnummer.
Gesucht wird in dieser Reihenfolge: beschriftete Angaben (`Ansprechpartner: …`,
`Tel: …`), die erste Zeichenfolge, die wie eine Rufnummer aussieht, der Text
davor in derselben Zeile — und zuletzt die Zeile **über** der Nummer, wo der
Name am häufigsten steht, mit Vor- und Nachnamen und ohne Beschriftung.

Anschriften werden dabei aussortiert: Zeilen mit Ziffern (Hausnummer,
Postleitzahl), mit Straßenwörtern und alles, was schon im Ort des Termins
steht — dafür bekommt `extractContact` den Ort als `exclude` mitgegeben.
Datumsangaben und Auftragsnummern gelten weiterhin nicht als Rufnummer. Auch das ist ein Vorschlag: beides landet im Formular und ist dort
änderbar.

Die Liste der Termine zeigt voreingestellt alles ab heute — der Feed liefert
den ganzen Kalender samt Vergangenheit. Über die Felder **Von**/**Bis** lässt
sich der Zeitraum ändern, **Alle** hebt den Filter auf.

### Abholung und Überführung als eine Fahrt

Im Kalender steht eine Fahrt meist als zwei Termine: der Zeitraum der
Überführung und die Abholung darin. Zum Beispiel

```
LYNK 02 MY27 in Seevetal            02.11.2026 – 09.11.2026
Abholung LYNK 02 MY27 in Seevetal   09.11.2026, 12:00
```

`calendarPairs.ts` bündelt sie zu einem Vorschlag. Zusammen gehören zwei
Termine, wenn sie dasselbe Fahrzeug betreffen (Kennzeichen im Titel) und ihre
**Zeiträume sich berühren** — die Abholung also in den Zeitraum fällt, meist auf
dessen letzten Tag. Ein bloß ähnliches Datum genügt nicht: zwei Fahrten
desselben Fahrzeugs in derselben Woche sind zwei Fahrten. Die Art des Termins
entscheidet mit, damit aus zweimal "Abholung" nicht eine Fahrt wird; ein Titel
ohne Schlagwort ("LYNK 02 MY27 in Seevetal") gilt als unbestimmt und passt zu
beidem.

Beim Übernehmen wird daraus: Start vom früheren Termin, Ende vom spätesten Tag
aller Termine, Uhrzeit vom Termin, der an diesem Tag liegt. Titel wird der
Termin, der nach Überführung klingt, sonst der frühere. Die Notizen beider
Termine landen zusammen im Feld Notizen und werden gemeinsam nach
Ansprechpartner und Telefon durchsucht. Steht in beiden Terminen derselbe Ort,
ist das der **Startort** und der Zielort bleibt leer — wohin die Fahrt geht,
sagt der Kalender dann nicht.

Die Karte im Kalenderbereich zeigt beide Termine untereinander mit dem Hinweis
"2 Termine · eine Fahrt". Passt die Paarung nicht, übernimmt das kleine Symbol
neben einem Termin nur diesen einen. In der übernommenen Fahrt fällt der
Hinweis weg — dass zwei Termine zu einer Fahrt wurden, zeigen dort die beiden
Blöcke selbst.

**Nach der Übernahme bleibt die Karte, wie sie war** — nur der Knopf
"Übernehmen" weicht dem Pfeil zum Aufklappen. Dafür speichert
`transfer_calendar_links` nicht bloß die UID, sondern auch Titel, Zeitraum und
Ort jedes Termins: eine Momentaufnahme vom Tag der Übernahme, die die Liste
später zeigen kann, ohne den Kalender erneut zu lesen. Eine Fahrt aus zwei
Terminen zeigt beide Blöcke.

Fahrten ohne solche Termine — von Hand angelegt oder vor dieser Änderung
übernommen — zeigen an derselben Stelle ihre eigenen Felder: Titel oder
Kennzeichen, Zeitraum, Strecke.

`transfers.calendar_uid` bleibt als Herkunftsmerkmal an der Fahrt, trägt aber
nur den ersten Termin.

Function deployen:

```bash
supabase functions deploy transfer-calendar --project-ref zhsqcrmdqxfnupmuqaya
```

### Adressen und Telefonnummern

Adressen sind Links in die Karten-App:
`https://www.google.com/maps/search/?api=1&query=…`. Auf dem Telefon öffnet
das die installierte App, sonst die Website — ein `maps:`-Link kennen nur
Apple-Geräte. Telefonnummern sind `tel:`-Links, die Nummer darin ohne
Leerzeichen.

Die Karte einer Fahrt ist deshalb keine Schaltfläche mehr, sondern ein
klickbarer Bereich (`role="button"`): ein Link darf nicht in einem `<button>`
stecken. Die Links rufen `stopPropagation`, sonst klappte beim Antippen
zusätzlich die Karte auf.

### Grenzen

- **Einmalige Übernahme, keine Synchronisation.** Wird der Termin im Kalender
  später geändert, zieht die Überführung nicht nach.
- **Serientermine** werden markiert, aber nicht aufgelöst; übernommen wird nur
  der erste Eintrag.
- Uhrzeiten werden in `Europe/Berlin` gelesen.

## Protokolle und Überführungen verknüpfen

Ein Protokoll entsteht nicht immer aus einer Überführung heraus — oft ist es
zuerst da, weil unterwegs schnell dokumentiert wurde. In der aufgeklappten
Überführung steht deshalb neben "Abholprotokoll erstellen" ein Kettensymbol:
es listet alle Protokolle des Fahrzeugs auf, die an keiner Überführung hängen,
und hängt das gewählte an.

Verknüpfen zieht den Status mit (Abholprotokoll → unterwegs, Ankunftsprotokoll
→ angekommen) und damit auch `vehicles.availability` — dieselbe Logik wie beim
Erstellen aus der Überführung heraus. Das Lösen einer Verknüpfung lässt den
Status dagegen stehen: er kann von Hand gesetzt worden sein, und ein
versehentlich angehängtes Protokoll soll die Fahrt nicht zurückwerfen.

## Fahrten untereinander verbinden

Hin mit dem einen Fahrzeug, zurück mit dem anderen, oder mehrere Etappen an
einem Tag: solche Überführungen gehören zusammen, bleiben aber eigene Fahrten
mit eigenem Status und eigenen Protokollen. Verknüpfte Fahrten stehen als eigener Block in der Karte — wie ein zweiter
Termin, nur mit Kettensymbol statt Trennstrich und mit eigenem Status, denn es
ist eine eigene Fahrt. **Aber nur, wenn sie nicht ohnehin als eigene Karte in
der Liste steht**: sonst stünde derselbe Termin zweimal untereinander, einmal
als Karte und einmal als Block der Partnerfahrt. Die abgeschlossenen Fahrten
zählen dabei nur mit, solange ihr Abschnitt aufgeklappt ist. Verwaltet werden sie aufgeklappt unter **Verbundene
Fahrten**: dort sind sie anzutippen (die Karte klappt auf und wird
angesprungen), je Zeile löst ein Symbol die Verbindung, und "Fahrt verknüpfen"
öffnet die Auswahl.

Technisch ist das kein Paar, sondern eine gemeinsame `transfers.group_id`:
damit passt auch die dritte Fahrt noch dazu. Wird eine Fahrt aus einer Gruppe
mit einer anderen Gruppe verknüpft, werden beide Gruppen zusammengeführt.
Bleibt beim Lösen nur eine Fahrt übrig, verliert auch sie die Gruppe — eine
Gruppe aus einer einzigen Fahrt ist keine. Das Fahrzeug spielt dabei keine
Rolle: die Rückfahrt mit einem anderen Auto ist der Normalfall.

## Datenbank-Migrationen

Neue Migrationen liegen unter `supabase/migrations/`. Nach einem neuen
Feature-Branch prüfen ob neue `.sql`-Dateien vorhanden sind und diese
manuell im **Supabase SQL Editor** ausführen.

```bash
# Neue Migrationsdateien seit letztem Merge anzeigen
git diff main --name-only | grep supabase/migrations
```

## Projekt-Infos

- **Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL + Storage)
- **Deploy:** Docker + Fly.io + Nginx
- **Version:** siehe `package.json`

## Wichtige Befehle

| Befehl | Zweck |
|--------|-------|
| `npm run dev` | Lokaler Dev-Server (http://localhost:5173) |
| `npm run build` | Produktions-Build (TypeScript + Vite) |
| `npm run lint` | ESLint |
