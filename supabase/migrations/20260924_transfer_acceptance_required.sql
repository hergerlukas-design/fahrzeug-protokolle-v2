-- Migration: Abnahme für neue Fahrzeuge
--
-- Steht ein Kennzeichen im Kalender, das es in der Flotte noch nicht gibt,
-- wird das Fahrzeug beim Übernehmen der Fahrt angelegt. Für diese erste Fahrt
-- ist dann ein Abnahmeprotokoll fällig; die Markierung sagt der Karte, dass
-- sie danach fragen soll.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS acceptance_required boolean NOT NULL DEFAULT false;
