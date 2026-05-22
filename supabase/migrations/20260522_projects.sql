-- Migration: Projektordner-Struktur für Fahrzeug-Protokolle
-- Idempotent (safe to run multiple times)

-- ─────────────────────────────────────────────────────────────────────────────
-- projects table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  color       text,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_unique UNIQUE (name)
);

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
-- Row Level Security (RLS) – analog zur bestehenden Konfiguration
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_projects ENABLE ROW LEVEL SECURITY;

-- Allow full access (same pattern as existing tables using anon key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY allow_all ON projects FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_projects' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY allow_all ON vehicle_projects FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
