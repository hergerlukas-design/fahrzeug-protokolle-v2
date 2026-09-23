-- Migration: ein Termin darf zu zwei Fahrten gehören
--
-- Beim Tausch ("Tausch A gegen B") entstehen aus einem Termin zwei Fahrten:
-- A wird abgeholt, B gebracht. Beide stammen aus demselben Kalendereintrag und
-- sollen ihn in der Karte zeigen — mit calendar_uid als Primärschlüssel ginge
-- das nicht, die zweite Zeile fiele weg.
--
-- Der Schlüssel wird deshalb zusammengesetzt: (calendar_uid, transfer_id).
-- Dieselbe Fahrt bekommt denselben Termin weiterhin nur einmal, und die Frage
-- "ist dieser Termin schon übernommen?" beantwortet nach wie vor ein Blick in
-- die Tabelle.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

DO $$
DECLARE
  key_cols int;
BEGIN
  SELECT cardinality(conkey) INTO key_cols
    FROM pg_constraint
   WHERE conrelid = 'public.transfer_calendar_links'::regclass
     AND contype = 'p';

  -- Nur umstellen, solange der Schlüssel noch allein auf calendar_uid liegt
  IF key_cols = 1 THEN
    ALTER TABLE transfer_calendar_links
      DROP CONSTRAINT transfer_calendar_links_pkey;
    ALTER TABLE transfer_calendar_links
      ADD CONSTRAINT transfer_calendar_links_pkey PRIMARY KEY (calendar_uid, transfer_id);
  END IF;
END $$;

-- Die Suche nach "schon übernommen?" läuft weiterhin über die UID
CREATE INDEX IF NOT EXISTS transfer_calendar_links_calendar_uid_idx
  ON transfer_calendar_links (calendar_uid);
