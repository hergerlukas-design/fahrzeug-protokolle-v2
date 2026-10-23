# Fahrzeug-Protokolle v2

Web-App für CarHandling: Übergabe- und Annahmeprotokolle für Fahrzeuge,
Überführungen, Zeitstrahl für die Abrechnung der Einlagerung.

React 19 + TypeScript + Vite + Tailwind CSS 4, Backend Supabase, Deploy über Fly.io.

## Entwicklung

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # TypeScript + Produktions-Build
npm run lint
```

Die Umgebungsvariablen stehen in `.env.example`; die lokale `.env` wird nicht eingecheckt.

Die ausführliche Arbeitsanweisung (Branches, Deploy, Migrationen, Kalender-Import)
steht in [CLAUDE.md](CLAUDE.md). Das Konzept des Zeitstrahls liegt in
[docs/konzept-zeitstrahl.md](docs/konzept-zeitstrahl.md).
