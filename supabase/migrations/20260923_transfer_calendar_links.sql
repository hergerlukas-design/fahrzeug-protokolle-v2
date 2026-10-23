-- Migration: mehrere Kalendertermine je Überführung
--
-- Eine Fahrt steht im Kalender meist als zwei Termine (Abholung und
-- Überführung desselben Fahrzeugs). Werden beide zu einer Überführung
-- zusammengefasst, muss die App sich beide UIDs merken – sonst taucht der
-- zweite Termin gleich wieder als "neu" auf.
--
-- transfers.calendar_uid bleibt als Herkunftsmerkmal der ersten UID erhalten;
-- die vollständige Liste steht hier. Der Primärschlüssel auf calendar_uid
-- verhindert, dass derselbe Termin an zwei Überführungen hängt.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

CREATE TABLE IF NOT EXISTS transfer_calendar_links (
  calendar_uid text PRIMARY KEY,
  transfer_id  uuid NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transfer_calendar_links_transfer_id_idx
  ON transfer_calendar_links (transfer_id);

-- Bereits übernommene Termine nachtragen, damit sie nicht wieder auftauchen
INSERT INTO transfer_calendar_links (calendar_uid, transfer_id)
SELECT calendar_uid, id FROM transfers WHERE calendar_uid IS NOT NULL
ON CONFLICT (calendar_uid) DO NOTHING;

-- Row Level Security – wie bei transfers: nur für Mitglieder (siehe unten)
ALTER TABLE transfer_calendar_links ENABLE ROW LEVEL SECURITY;

-- Früher stand hier eine Policy allow_all (USING true) für jeden mit dem
-- Anon-Key. Sie ist entfernt, damit ein erneuter Lauf dieser Datei den
-- Zugriff nicht wieder öffnet. Ohne Policy ist die Tabelle zu; Zugriff gibt
-- die Policy "members" aus 20261023_team_login.sql.
