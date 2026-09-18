-- Migration: Überführungen (Planungsebene über den Protokollen)
--
-- Eine Überführung gehört immer zu genau einem Fahrzeug und hält fest, wann
-- es wohin geht, wer fährt, wer Ansprechpartner ist und wie weit die Fahrt
-- ist. Die Protokolle bleiben davon unberührt – sie werden nur verlinkt.
--
-- Idempotent, im Stil von 20260522_projects.sql. Manuell im Supabase SQL
-- Editor ausführen.

-- ─────────────────────────────────────────────────────────────────────────────
-- transfers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date_from       date NOT NULL,
  date_to         date,
  location_from   text,
  location_to     text,
  status          text NOT NULL DEFAULT 'geplant',
  picked_up_at    timestamptz,
  arrived_at      timestamptz,
  driver_name     text,
  contact_name    text,
  contact_phone   text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Fehlende Spalten einzeln nachziehen, falls die Tabelle schon existiert
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='date_to') THEN
    ALTER TABLE transfers ADD COLUMN date_to date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='location_from') THEN
    ALTER TABLE transfers ADD COLUMN location_from text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='location_to') THEN
    ALTER TABLE transfers ADD COLUMN location_to text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='picked_up_at') THEN
    ALTER TABLE transfers ADD COLUMN picked_up_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='arrived_at') THEN
    ALTER TABLE transfers ADD COLUMN arrived_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='driver_name') THEN
    ALTER TABLE transfers ADD COLUMN driver_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='contact_name') THEN
    ALTER TABLE transfers ADD COLUMN contact_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='contact_phone') THEN
    ALTER TABLE transfers ADD COLUMN contact_phone text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='notes') THEN
    ALTER TABLE transfers ADD COLUMN notes text;
  END IF;
END $$;

-- Erlaubte Statuswerte
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transfers_status_check') THEN
    ALTER TABLE transfers ADD CONSTRAINT transfers_status_check
      CHECK (status IN ('geplant', 'unterwegs', 'angekommen', 'abgebrochen'));
  END IF;
END $$;

-- Enddatum darf nicht vor dem Startdatum liegen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transfers_date_order_check') THEN
    ALTER TABLE transfers ADD CONSTRAINT transfers_date_order_check
      CHECK (date_to IS NULL OR date_to >= date_from);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verknüpfung zu den Protokollen
--
-- protocols.id ist uuid (gen_random_uuid()), nicht die Integer-Sequenz, die der
-- TypeScript-Typ Protocol.id nahelegt. Der Check unten bricht sauber ab, falls
-- das in einer anderen Umgebung abweicht – sonst scheitert erst der
-- Fremdschlüssel mit einer schwer lesbaren Meldung.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  proto_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO proto_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.protocols'::regclass
     AND a.attname  = 'id'
     AND NOT a.attisdropped;

  IF proto_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'protocols.id hat den Typ % statt uuid – Migration bitte anpassen.', COALESCE(proto_type, '<nicht gefunden>');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='pickup_protocol_id') THEN
    ALTER TABLE transfers ADD COLUMN pickup_protocol_id uuid REFERENCES protocols(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='dropoff_protocol_id') THEN
    ALTER TABLE transfers ADD COLUMN dropoff_protocol_id uuid REFERENCES protocols(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indizes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS transfers_vehicle_id_idx ON transfers (vehicle_id);
CREATE INDEX IF NOT EXISTS transfers_date_from_idx  ON transfers (date_from);
CREATE INDEX IF NOT EXISTS transfers_status_idx     ON transfers (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security – wie bei projects: Zugriff über Anon Key + App-PIN
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='transfers' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON transfers FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
