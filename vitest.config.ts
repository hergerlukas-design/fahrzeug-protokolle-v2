import { defineConfig } from 'vitest/config'

// Eigene Konfiguration statt Block in vite.config.ts: die Tests brauchen weder
// den PWA-Plugin noch Tailwind, und der Build bleibt von ihnen unberührt.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Die Module in src/lib ziehen über vehicles.ts den Supabase-Client mit;
    // createClient verlangt eine URL, ohne die der Import scheitert. Es wird
    // nie eine Verbindung aufgebaut.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_KEY: 'test-key',
    },
  },
})
