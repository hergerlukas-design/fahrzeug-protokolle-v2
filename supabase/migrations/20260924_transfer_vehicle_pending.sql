-- Migration: Überführungen mit noch unbekanntem Fahrzeug
--
-- Eine Abholung steht oft fest, bevor das Fahrzeug bekannt ist: "Abholung,
-- 2× BMW M3". Kennzeichen und Annahmeprotokoll entstehen erst vor Ort. Die
-- Fahrt trägt bis dahin nur, was erwartet wird (vehicle_hint), und bekommt
-- ihr Fahrzeug, sobald es erfasst ist.
--
-- Voraussetzung: 20260924_transfer_acceptance_required.sql
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

ALTER TABLE transfers ALTER COLUMN vehicle_id DROP NOT NULL;

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS vehicle_hint text;

-- Irgendetwas muss die Fahrt über ihr Fahrzeug sagen – das Fahrzeug selbst
-- oder wenigstens, was erwartet wird.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transfers_vehicle_or_hint_check') THEN
    ALTER TABLE transfers ADD CONSTRAINT transfers_vehicle_or_hint_check
      CHECK (vehicle_id IS NOT NULL OR vehicle_hint IS NOT NULL);
  END IF;
END $$;
