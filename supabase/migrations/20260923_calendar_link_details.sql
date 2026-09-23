-- Migration: die übernommenen Termine mitspeichern
--
-- Bisher merkte sich transfer_calendar_links nur, welcher Termin schon
-- übernommen wurde. Damit eine übernommene Fahrt in der Liste genauso aussehen
-- kann wie der Termin im Kalender – bei einem Paar mit beiden Blöcken –,
-- braucht die Karte Titel, Zeitraum und Ort der Termine selbst.
--
-- Eine Momentaufnahme, keine Synchronisation: ändert sich der Termin später im
-- Kalender, bleibt hier der Stand der Übernahme stehen. Das ist dieselbe
-- Zusage wie bisher (siehe "Grenzen" in CLAUDE.md).
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_calendar_links' AND column_name='summary') THEN
    ALTER TABLE transfer_calendar_links ADD COLUMN summary text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_calendar_links' AND column_name='date_from') THEN
    ALTER TABLE transfer_calendar_links ADD COLUMN date_from date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_calendar_links' AND column_name='date_to') THEN
    ALTER TABLE transfer_calendar_links ADD COLUMN date_to date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_calendar_links' AND column_name='time_from') THEN
    ALTER TABLE transfer_calendar_links ADD COLUMN time_from time;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_calendar_links' AND column_name='time_to') THEN
    ALTER TABLE transfer_calendar_links ADD COLUMN time_to time;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfer_calendar_links' AND column_name='location') THEN
    ALTER TABLE transfer_calendar_links ADD COLUMN location text;
  END IF;
END $$;
