-- Migration: auch die Notizen des Termins im Schnappschuss halten
--
-- transfer_calendar_links merkt sich, wie ein Termin am Tag der Übernahme
-- aussah. Titel, Zeitraum und Ort stehen schon drin, die Notizen nicht — und
-- genau dort stehen Ansprechpartner und Telefonnummer. Ohne sie lässt sich
-- nicht erkennen, ob im Kalender inzwischen eine andere Nummer steht.
--
-- Zeilen von vorher behalten NULL: für sie ist der alte Stand unbekannt, und
-- unbekannt heißt "keine Änderung melden" — sonst meldete jede ältere Fahrt
-- eine Änderung, die keine ist.
--
-- Idempotent. Manuell im Supabase SQL Editor ausführen.

ALTER TABLE transfer_calendar_links
  ADD COLUMN IF NOT EXISTS description text;
