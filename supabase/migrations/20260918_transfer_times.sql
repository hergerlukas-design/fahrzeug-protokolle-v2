-- Migration: Uhrzeiten für Überführungen
--
-- Bewusst als eigene time-Spalten statt einer Umstellung von date auf
-- timestamptz: die Uhrzeit ist optional (das Datum steht oft früher fest als
-- die Stunde), und ohne Zeitzonenanteil gibt es keine Verschiebung zwischen
-- Erfassung und Anzeige. Die vorhandene Datumslogik bleibt unberührt.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='time_from') THEN
    ALTER TABLE transfers ADD COLUMN time_from time;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='time_to') THEN
    ALTER TABLE transfers ADD COLUMN time_to time;
  END IF;
END $$;
