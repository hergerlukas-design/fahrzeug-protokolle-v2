# Konzept: Zeitstrahl Einlagerung / unterwegs

## Worum es geht

Ein Fahrzeug ist zu jedem Zeitpunkt an einem von wenigen Orten: auf dem
Campus eingelagert, unterwegs zu oder von einem Termin, oder bei einer
Journalistin bzw. einem Journalisten. Für die Einlagerung wird abgerechnet,
also braucht es je Fahrzeug die Antwort auf: **wann stand es wie lange auf dem
Campus, und wann war es wie lange draußen?**

Der Zeitstrahl soll das zeigen und zählen, und zwar **ohne zweite Buchführung**.
Alles, was er braucht, steht schon in den Protokollen und Überführungen. Wer
zusätzlich noch „Fahrzeug hat den Campus verlassen“ klicken müsste, vergäße es
genau an den Tagen, an denen es darauf ankommt.

## Was die Daten heute hergeben

Ein Blick in die Datenbank (Stand 24.09.2026):

| Quelle | Umfang | Was darin steckt |
|--------|--------|------------------|
| Annahmeprotokolle | 79, ab April 2026 | Eingang des Fahrzeugs, Ort oft „Campus“ |
| Überführungsprotokolle | 69, ab Februar 2026 | `location` meist als „Start → Ziel“, z.B. `CarHandling Campus → Köln`; seit Mai zusätzlich `transfer_type` Hinbringen/Rücknahme |
| Überführungen | 19, erst ab 21.09.2026 | geplanter Zeitraum `date_from`–`date_to`, Ist-Zeiten `picked_up_at`/`arrived_at` |

Daraus folgt:

- **Die Vergangenheit steht in den Protokollen**, die Zukunft in den
  Überführungen. Der Zeitstrahl braucht beides.
- **Der Campus heißt jedes Mal anders:** „Campus“, „CarHandling Campus“,
  „Carhandling Campus, Münchner Straße 60“, „CarHndling Campus“,
  „Carhandling Cambus“, „Halle 2“. Erkannt werden muss er trotzdem.
- **Es fehlen Rückfahrten.** 35 Protokolle „Hinbringen“ stehen 15 „Rücknahme“
  gegenüber. Manche Fahrzeuge gehen direkt von einer Journalistin zur nächsten
  („Köln → Darmstadt“), bei anderen fehlt schlicht das Protokoll. Der
  Zeitstrahl muss solche Lücken zeigen, statt sie stillschweigend als Campus
  oder als unterwegs zu zählen, denn beides wäre eine falsche Rechnung.

## Die Zustände

| Zustand | Bedeutung | Abrechnung |
|---------|-----------|------------|
| **Campus** | eingelagert | Lagertag |
| **Unterwegs** | Transport zu oder von einem Termin | kein Lagertag |
| **Extern** | bei Journalist/in, Veranstaltung, Werkstatt | kein Lagertag |
| **Unklar** | Daten widersprechen sich oder fehlen | muss geklärt werden, bevor abgerechnet wird |
| *außerhalb* | vor dem Eingang bzw. nach dem Abgang | gehört nicht zum Bestand |

„Unterwegs“ und „Extern“ werden getrennt angezeigt, weil sie sich im Alltag
unterscheiden. Für die Abrechnung werden sie zusammen gezählt, außer es soll
anders gerechnet werden (siehe offene Fragen).

## Wie der Zustand entsteht

Je Fahrzeug werden alle Ereignisse zeitlich sortiert, und eine kleine
Zustandsmaschine läuft darüber. Das ist eine reine Funktion in
`src/lib/timeline.ts`, im Stil von `calendarPairs.ts`: Eingabe sind Protokolle,
Überführungen und Korrekturen, Ausgabe ist eine Liste von Abschnitten
`{ von, bis, zustand, quelle }`.

### Ereignisse

| Ereignis | woher |
|----------|-------|
| **Eingang** | erstes Annahmeprotokoll (oder eine Korrektur) |
| **verlässt Campus** | Überführungsprotokoll, dessen Start der Campus ist, oder `transfer_type = Hinbringen` ohne Ortsangabe; bei Überführungen `picked_up_at` bzw. geplant `date_from` |
| **kommt am Campus an** | Überführungsprotokoll mit Ziel Campus oder `Rücknahme`; bei Überführungen `arrived_at` bzw. geplant `date_to` |
| **Wechsel extern → extern** | Protokoll „Köln → Darmstadt“: das Fahrzeug bleibt draußen |
| **Abgang** | neu: Fahrzeug an Hersteller zurück, abgemeldet, verkauft (nur als Korrektur) |

### Welche Quelle zählt

1. **Korrektur von Hand**: schlägt alles, weil sie bewusst gesetzt wurde.
2. **Protokoll**: ist unterschrieben und hat einen echten Zeitstempel.
3. **Überführung, Ist** (`picked_up_at`, `arrived_at`).
4. **Überführung, Plan** (`date_from`, `date_to`): gestrichelt dargestellt und
   nie abgerechnet, solange er in der Zukunft liegt.

Dieselbe Fahrt taucht oft doppelt auf, als Überführung und als verknüpftes
Protokoll (`pickup_protocol_id`). Dann zählt sie einmal, mit der Zeit aus dem
Protokoll.

### Den Campus erkennen

Eine Liste von Schreibweisen, nach Normalisierung (Kleinbuchstaben, ohne
Satzzeichen) mit Toleranz für Tippfehler: `campus`, `carhandling`,
`münchner straße 60`, `halle 2`. Für die bestehenden Daten reicht das.

Damit es künftig gar nicht erst geraten werden muss, bekommt das
Protokollformular für Start und Ziel einen Knopf **Campus**, der den Ort
einheitlich einträgt. Freitext bleibt für alle anderen Orte.

### Lücken

„Unklar“ entsteht, wenn die Kette nicht aufgeht:

- Zweimal hintereinander „verlässt Campus“ ohne Rückkehr dazwischen: Der
  Abschnitt zwischen dem Ende der ersten Fahrt und der zweiten Abfahrt ist
  unklar.
- Eine Hinfahrt ohne Rückfahrt, die länger als eine einstellbare Frist (z.B.
  30 Tage) zurückliegt.
- Protokolle ohne erkennbaren Start und ohne `transfer_type`.

Eine Lücke hat im Zeitstrahl eine eigene Farbe und einen Knopf
**„Zurück am Campus am …“**. Der legt eine Korrektur an, und die Lücke ist
geschlossen. Rückwirkend lassen sich so die fehlenden Rücknahmen in wenigen
Minuten nachtragen.

## Wie Tage gezählt werden

Abgerechnet wird in ganzen Tagen. Der Vorschlag ist das
**Übernachtungsprinzip** wie im Hotel: Ein Tag ist ein Lagertag, wenn das
Fahrzeug die Nacht auf dem Campus verbringt. Abfahrt am Morgen heißt also, dass
der Vortag noch ein Lagertag war und der Abfahrtstag keiner mehr. Kommt es am
Abend zurück, ist dieser Tag wieder einer.

Die Regel steht an einer Stelle (`countDays` in `timeline.ts`) und ist damit
leicht zu tauschen, falls vertraglich anders gerechnet wird, etwa „jeder
angebrochene Tag auf dem Campus zählt“.

## Die Oberfläche

### Seite „Zeitstrahl“

Eigener Menüpunkt in der Sidebar. Auf Tablet und Desktop ein Gantt-Diagramm:

```
              Sep                     Okt                     Nov
              |    |    |    |    |    |    |    |    |    |   ¦ heute
Projekt Lynk & Co
WI-L 8956E    ██████████████████▓░░░░░░░░░░▓████████████████▓┄┄┄┄┄┄┄
WI-L 8958E    ████▓░░░░░░░░░░░░░░░░▓█████████▓░░░░░░░░░░░░░░┄┄┄┄┄┄┄
DPG98A        ░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒████████████▓░░░░░░░░░┄┄┄┄┄┄┄
              █ Campus  ▓ unterwegs  ░ extern  ▒ unklar  ┄ geplant
```

- **Zeilen** sind Fahrzeuge, gruppiert nach Projekt (`vehicle_projects`), weil
  pro Projekt bzw. Kunde abgerechnet werden dürfte.
- **Zeitraum** umschaltbar: Woche, Monat, Quartal. Voreingestellt ist der
  laufende Monat. Eine Linie markiert heute, die Zukunft ist blasser.
- **Antippen eines Abschnitts** zeigt, woraus er entstanden ist („Protokoll vom
  05.11., CarHandling Campus → Köln“), mit Sprung zum Protokoll bzw. zur
  Überführung. So lässt sich jede Zahl nachprüfen.
- **Rechts je Zeile** die Summen im gewählten Zeitraum: Lagertage, Tage
  draußen, unklare Tage.
- **Filter**: Projekt, nur Fahrzeuge mit Lücken.

Auf dem Telefon ist ein Gantt-Diagramm mit 70 Zeilen unbrauchbar. Dort
erscheint dieselbe Seite als Liste: je Fahrzeug eine schmale Balkenleiste für
den Monat und darunter die drei Zahlen. Antippen öffnet die Abschnitte als
Liste.

### Im Fahrzeug

In der Fahrzeugkarte (`Fahrzeuge.tsx`) steht der Zeitstrahl dieses einen
Fahrzeugs über die letzten Monate. Dort liegt auch der Knopf für Eingang und
Abgang.

### Monatsauswertung

Eine Tabelle Fahrzeug × Lagertage für einen Monat, je Projekt summiert, als CSV
und als PDF (über den vorhandenen `generatePdf`). Solange ein Fahrzeug im Monat
unklare Tage hat, steht die Auswertung auf „vorläufig“ und nennt diese
Fahrzeuge.

Mit **Monat abschließen** wird das Ergebnis eingefroren. Ein nachträglich
angehängtes Protokoll ändert dann nicht mehr die schon verschickte Rechnung,
sondern wird als Abweichung zum Abschluss angezeigt.

## Datenmodell

Die Ableitung kommt ohne Änderungen aus. Neu sind nur zwei kleine Tabellen,
und erst in späteren Schritten:

```sql
-- Korrekturen, Eingang und Abgang von Hand
CREATE TABLE vehicle_location_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('eingang', 'abgang', 'campus_an', 'campus_ab')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Abgeschlossene Monate
CREATE TABLE storage_closings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month      date NOT NULL,            -- erster des Monats
  project_id uuid REFERENCES projects(id),
  result     jsonb NOT NULL,           -- je Fahrzeug die Tage je Zustand
  closed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, project_id)
);
```

Die Abschnitte selbst werden **nicht gespeichert**, sondern bei jedem Aufruf
berechnet. Bei 70 Fahrzeugen und ein paar hundert Protokollen geht das im
Browser in Millisekunden. Und es gibt keinen zweiten Stand, der mit den
Protokollen auseinanderlaufen kann.

## Umsetzung in Schritten

1. **Ableitung und Anzeige** (keine Migration): `timeline.ts` mit Tests für
   die Zustandsmaschine, Seite „Zeitstrahl“ nur lesend, Lücken sichtbar. Schon
   damit sieht man, wie gut die vorhandenen Daten tragen.
2. **Korrekturen**: `vehicle_location_events`, Knopf „Zurück am Campus am …“,
   Eingang und Abgang. Danach die alten Lücken einmal nachtragen.
3. **Saubere Daten ab jetzt**: Knopf „Campus“ für Start und Ziel im
   Protokollformular.
4. **Monatsauswertung**: Summen, Export CSV/PDF, Monatsabschluss.

## Offene Fragen

1. **Wechseltage:** Gilt das Übernachtungsprinzip, oder zählt jeder
   angebrochene Tag auf dem Campus als Lagertag?
2. **Extern und unterwegs:** Werden beide gleich behandelt (kein Lagertag),
   oder wird die Zeit bei Journalistinnen und Journalisten gesondert berechnet?
3. **Pro Projekt?** Wird je Projekt bzw. Kunde abgerechnet? Sollen im Tool
   nur Tage stehen oder auch Beträge (Tagessatz je Projekt)?
4. **Beginn und Ende:** Beginnt die Einlagerung mit der ersten Annahme? Was
   beendet sie: Rückgabe an den Hersteller, Abmeldung?
5. **Weitere Standorte:** Ist „Halle 2“ Teil des Campus? Gibt es weitere
   Lagerorte, die gleich zählen (in den Protokollen taucht z.B.
   „Lüß, Carhandling Campus“ auf)?
