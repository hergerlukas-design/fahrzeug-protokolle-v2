-- Migration: Korrekturen für den Zeitstrahl
--
-- Der Zeitstrahl leitet ab, wann ein Fahrzeug auf dem Campus stand, aus
-- Protokollen und Überführungen. Wo die Kette nicht aufgeht – etwa eine
-- Rücknahme ohne Protokoll –, wird hier von Hand nachgetragen, was passiert
-- ist. Eine Korrektur schlägt am selben Tag jede andere Quelle.
--
--   eingang    das Fahrzeug kommt in den Bestand, auf den Campus
--   abgang     das Fahrzeug verlässt den Bestand (Rückgabe, Abmeldung) –
--              danach zählt es nicht mehr
--   campus_an  das Fahrzeug ist zurück auf dem Campus
--   campus_ab  das Fahrzeug hat den Campus verlassen
--
-- Ein Tag statt eines Zeitstempels: gezählt wird nach dem
-- Übernachtungsprinzip, und für die Nacht zählt nur, wo das Fahrzeug am Ende
-- des Tages steht.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

CREATE TABLE IF NOT EXISTS vehicle_location_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  occurred_on date NOT NULL,
  kind        text NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicle_location_events_kind_check') THEN
    ALTER TABLE vehicle_location_events ADD CONSTRAINT vehicle_location_events_kind_check
      CHECK (kind IN ('eingang', 'abgang', 'campus_an', 'campus_ab'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vehicle_location_events_vehicle_id_idx ON vehicle_location_events (vehicle_id);

-- Row Level Security – wie bei den anderen Tabellen: Zugriff über Anon Key + App-PIN
ALTER TABLE vehicle_location_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_location_events' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON vehicle_location_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
