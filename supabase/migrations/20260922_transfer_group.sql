-- Migration: Überführungen untereinander verknüpfen
--
-- Fahrten gehören oft zusammen: hin mit dem einen Fahrzeug, zurück mit dem
-- anderen, oder mehrere Etappen an einem Tag. Statt eines Paares (das bei der
-- dritten Fahrt nicht mehr trägt) bekommen verbundene Fahrten dieselbe
-- group_id. Verknüpfen heißt dann "in dieselbe Gruppe", Lösen "raus aus der
-- Gruppe", und zwei bestehende Gruppen lassen sich zusammenführen.
--
-- Bewusst ohne eigene Tabelle: die Gruppe hat keine eigenen Daten – kein Name,
-- kein Datum, nichts, was nicht schon an den Fahrten hängt.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='group_id') THEN
    ALTER TABLE transfers ADD COLUMN group_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transfers_group_id_idx ON transfers (group_id) WHERE group_id IS NOT NULL;
