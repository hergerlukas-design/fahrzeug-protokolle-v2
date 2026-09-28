-- Migration: unbestätigte Kalendertermine in der App bestätigen
--
-- Ein Fragezeichen im Termintitel heißt: vom Kunden noch nicht bestätigt.
-- Der Kalender ist ein veröffentlichter iCloud-Feed, den die App nur lesen
-- kann – das Fragezeichen lässt sich von hier aus nicht entfernen. Die
-- Bestätigung steht deshalb hier, je Termin-UID.
--
-- summary hält den Titel zum Zeitpunkt der Bestätigung fest – nur zur
-- Nachvollziehbarkeit, die App vergleicht nicht damit.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

CREATE TABLE IF NOT EXISTS calendar_confirmations (
  calendar_uid text PRIMARY KEY,
  summary      text,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security – wie bei transfers: Zugriff über Anon Key + App-PIN
ALTER TABLE calendar_confirmations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='calendar_confirmations' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON calendar_confirmations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
