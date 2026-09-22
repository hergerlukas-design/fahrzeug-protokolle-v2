-- Migration: Herkunft aus dem Kalender festhalten
--
-- Speichert die UID des Termins, aus dem eine Überführung übernommen wurde.
-- Damit erscheint derselbe Termin nicht erneut als "neu", und eine versehentlich
-- doppelte Übernahme wird von der Datenbank abgewiesen.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='calendar_uid') THEN
    ALTER TABLE transfers ADD COLUMN calendar_uid text;
  END IF;
END $$;

-- Partiell, damit von Hand angelegte Überführungen ohne Kalenderbezug
-- unberührt bleiben – mehrere NULL-Werte wären sonst ein Konflikt.
CREATE UNIQUE INDEX IF NOT EXISTS transfers_calendar_uid_key
  ON transfers (calendar_uid) WHERE calendar_uid IS NOT NULL;
