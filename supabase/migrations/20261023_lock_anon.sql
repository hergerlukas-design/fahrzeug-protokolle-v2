-- Gemeinsames Konto statt offenem Anon-Zugriff, Teil 2 von 2.
--
-- Erst ausführen, wenn die App mit dem neuen Login deployt ist und die
-- Anmeldung funktioniert – vorher sperrt es die laufende App aus.
-- Voraussetzung: 20261023_team_login.sql.

DROP POLICY IF EXISTS allow_all ON public.projects;
DROP POLICY IF EXISTS "anon all" ON public.projects;
DROP POLICY IF EXISTS "anon all" ON public.protocols;
DROP POLICY IF EXISTS allow_all ON public.transfer_calendar_links;
DROP POLICY IF EXISTS allow_all ON public.transfers;
DROP POLICY IF EXISTS allow_all ON public.vehicle_location_events;
DROP POLICY IF EXISTS allow_all ON public.vehicle_projects;
DROP POLICY IF EXISTS "anon all" ON public.vehicles;

DROP POLICY IF EXISTS "Einfacher Zugriff xzv0aq_0" ON storage.objects;
DROP POLICY IF EXISTS "Einfacher Zugriff xzv0aq_1" ON storage.objects;
DROP POLICY IF EXISTS "Einfacher Zugriff xzv0aq_2" ON storage.objects;
DROP POLICY IF EXISTS "Einfacher Zugriff xzv0aq_3" ON storage.objects;

-- Zusätzlich zu RLS: anon bekommt auf den Tabellen gar keine Rechte mehr.
-- TRUNCATE etwa prüft RLS nicht.
REVOKE ALL ON public.projects, public.protocols, public.transfer_calendar_links,
  public.transfers, public.vehicle_location_events, public.vehicle_projects,
  public.vehicles, public.app_members FROM anon;
