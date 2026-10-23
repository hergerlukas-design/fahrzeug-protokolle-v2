-- Gemeinsames Konto statt offenem Anon-Zugriff, Teil 1 von 2.
--
-- Bisher erlaubte jede Policy alles für anon. Der Anon-Key steht aber im
-- Client-Bundle, und der PIN wurde nur im Browser verglichen: wer die URL der
-- App kannte, konnte alle Protokolle, Kontakte und Fotos lesen und löschen.
--
-- Jetzt meldet sich die App mit einem gemeinsamen Supabase-Konto an. Zugriff
-- hat, wer in app_members steht – nicht schon jeder, der angemeldet ist: ob
-- sich jemand selbst registrieren kann, entscheidet eine Einstellung im
-- Dashboard, und darauf soll der Schutz nicht beruhen.
--
-- Dieser Teil ergänzt nur. Die alten anon-Policies bleiben, bis die App mit
-- dem neuen Login deployt ist; sie entfernt 20261023_lock_anon.sql.

CREATE TABLE IF NOT EXISTS public.app_members (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ohne Policy: lesen darf sie nur is_member() selbst (SECURITY DEFINER).
ALTER TABLE public.app_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_members WHERE user_id = auth.uid())
$$;

REVOKE ALL ON FUNCTION public.is_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member() TO authenticated;

-- Eine Policy je Tabelle. (select …) wertet is_member() einmal pro Abfrage
-- aus statt einmal pro Zeile.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects', 'protocols', 'transfer_calendar_links', 'transfers',
    'vehicle_location_events', 'vehicle_projects', 'vehicles'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'members') THEN
      EXECUTE format(
        'CREATE POLICY members ON public.%I FOR ALL TO authenticated
           USING ((SELECT public.is_member())) WITH CHECK ((SELECT public.is_member()))',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Fotos und Unterschriften. Der Bucket bleibt öffentlich, damit die Bilder
-- über ihre (nicht erratbaren) Links weiter laden, auch im PDF. Auflisten,
-- Hochladen, Überschreiben und Löschen geht nur noch für Mitglieder.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'vehicle-photos members') THEN
    CREATE POLICY "vehicle-photos members" ON storage.objects FOR ALL TO authenticated
      USING (bucket_id = 'vehicle-photos' AND (SELECT public.is_member()))
      WITH CHECK (bucket_id = 'vehicle-photos' AND (SELECT public.is_member()));
  END IF;
END $$;

-- Aufräumen nach dem Datenbank-Advisor.
-- Zwei identische Unique-Constraints auf projects.name; projects_name_unique
-- bleibt, weil 20260522_projects.sql es bei einem erneuten Lauf anlegt.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_name_key;

-- Fremdschlüssel ohne Index.
CREATE INDEX IF NOT EXISTS transfers_pickup_protocol_id_idx ON public.transfers (pickup_protocol_id);
CREATE INDEX IF NOT EXISTS transfers_dropoff_protocol_id_idx ON public.transfers (dropoff_protocol_id);
CREATE INDEX IF NOT EXISTS vehicles_project_id_idx ON public.vehicles (project_id);
