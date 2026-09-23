-- Migration: calendar_uid an der Fahrt ist kein Alleinstellungsmerkmal mehr
--
-- Beim Tausch ("Tausch A gegen B") entstehen aus einem Termin zwei Fahrten:
-- A wird abgeholt, B gebracht. Beide tragen denselben Termin als Herkunft —
-- der eindeutige Index transfers_calendar_uid_key ließ das nicht zu und
-- verweigerte die zweite Fahrt mit 23505.
--
-- Die Frage "ist dieser Termin schon übernommen?" beantwortet ohnehin
-- transfer_calendar_links; die Spalte an der Fahrt ist nur noch ein Vermerk,
-- woher sie stammt. Der Index bleibt deshalb, verliert aber die Eindeutigkeit.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

DROP INDEX IF EXISTS transfers_calendar_uid_key;

CREATE INDEX IF NOT EXISTS transfers_calendar_uid_idx
  ON transfers (calendar_uid) WHERE calendar_uid IS NOT NULL;
