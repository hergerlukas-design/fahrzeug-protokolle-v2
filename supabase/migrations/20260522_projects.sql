-- Migration: Projektordner-Struktur für Fahrzeug-Protokolle
-- Idempotent – funktioniert egal ob projects-Tabelle schon existiert oder nicht

-- ─────────────────────────────────────────────────────────────────────────────
-- projects table – Grundstruktur
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fehlende Spalten einzeln und sicher hinzufügen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='description') THEN
    ALTER TABLE projects ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='color') THEN
    ALTER TABLE projects ADD COLUMN color text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='is_archived') THEN
    ALTER TABLE projects ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='archived_at') THEN
    ALTER TABLE projects ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

-- Unique-Constraint auf name (falls noch nicht vorhanden)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_name_unique') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_name_unique UNIQUE (name);
  END IF;
END $$;

-- Index auf is_archived (jetzt sicher, da Spalte existiert)
CREATE INDEX IF NOT EXISTS projects_is_archived_idx ON projects (is_archived);

-- ─────────────────────────────────────────────────────────────────────────────
-- vehicle_projects join table (m:n)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vehicle_projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_projects_unique UNIQUE (vehicle_id, project_id)
);

CREATE INDEX IF NOT EXISTS vehicle_projects_vehicle_id_idx ON vehicle_projects (vehicle_id);
CREATE INDEX IF NOT EXISTS vehicle_projects_project_id_idx ON vehicle_projects (project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON projects FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_projects' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON vehicle_projects FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
