# Fahrzeug-Protokolle v2 – Claude Code Arbeitsanweisung

## Neuen Feature-Branch holen und lokal starten

Wenn ein neuer Branch von Claude Code (Web) erstellt wurde, z.B. nach einem
Feature-Auftrag, führe folgende Schritte aus:

```bash
# 1. Alle Remote-Branches holen
git fetch origin

# 2. Auf den neuen Branch wechseln (Branch-Name aus GitHub PR entnehmen)
git checkout claude/vehicle-list-organization-1fFmw

# 3. Abhängigkeiten installieren (falls package.json geändert wurde)
npm install

# 4. Dev-Server starten
npm run dev
```

## Lokalen Stand mit Remote synchronisieren

```bash
# Neueste Commits vom Remote-Branch holen
git pull origin claude/vehicle-list-organization-1fFmw
npm install   # nur nötig wenn package.json geändert wurde
```

## Branch in main mergen (nach PR-Approval)

```bash
git checkout main
git pull origin main
git merge claude/vehicle-list-organization-1fFmw
git push origin main
```

## Umgebungsvariablen

Die `.env`-Datei liegt lokal und ist in `.gitignore`. Sie wird **nie** ins
Repo eingecheckt. Inhalt:

```
VITE_SUPABASE_URL=https://DEIN_PROJEKT.supabase.co
VITE_SUPABASE_KEY=dein-anon-public-key
VITE_APP_PASSWORD=dein-pin
```

## Datenbank-Migrationen

Neue Migrationen liegen unter `supabase/migrations/`. Nach einem neuen
Feature-Branch prüfen ob neue `.sql`-Dateien vorhanden sind und diese
manuell im **Supabase SQL Editor** ausführen.

```bash
# Neue Migrationsdateien seit letztem Merge anzeigen
git diff main --name-only | grep supabase/migrations
```

## Projekt-Infos

- **Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL + Storage)
- **Deploy:** Docker + Fly.io + Nginx
- **Version:** siehe `package.json`

## Wichtige Befehle

| Befehl | Zweck |
|--------|-------|
| `npm run dev` | Lokaler Dev-Server (http://localhost:5173) |
| `npm run build` | Produktions-Build (TypeScript + Vite) |
| `npm run lint` | ESLint |
