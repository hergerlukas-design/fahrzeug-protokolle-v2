-- Fotos und Unterschriften nicht mehr öffentlich.
--
-- Bisher war der Bucket vehicle-photos öffentlich: wer den Link eines Fotos
-- hatte, sah es ohne Anmeldung – auch Unterschriften, und Links gelangen über
-- weitergeleitete PDFs oder Nachrichten leicht nach außen. Jetzt lädt nur, wer
-- angemeldet und Mitglied ist (Policy "vehicle-photos members" aus
-- 20261023_team_login.sql). Die App zeigt Fotos über signierte Links
-- (src/lib/photoUrls.ts); die in der Datenbank gespeicherten öffentlichen
-- Adressen bleiben als Kennung stehen.
--
-- Erst ausführen, wenn die App mit src/lib/photoUrls.ts deployt ist – vorher
-- zeigt sie keine Fotos mehr.

UPDATE storage.buckets SET public = false WHERE id = 'vehicle-photos';
