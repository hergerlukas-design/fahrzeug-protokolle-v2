-- Migration: Titel einer Überführung
--
-- Bei einer Übernahme aus dem Kalender ist der Termintitel die Beschriftung,
-- unter der die Fahrt bekannt ist ("Abholung Autohaus Meier"). Bisher landete
-- er in den Notizen und war in der Liste nicht mehr zu sehen; als eigene Spalte
-- steht er im Kopf der Karte, das Kennzeichen darunter.
--
-- Optional: von Hand angelegte Überführungen brauchen keinen Titel, dort bleibt
-- das Kennzeichen der Kopf.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='title') THEN
    ALTER TABLE transfers ADD COLUMN title text;
  END IF;
END $$;
