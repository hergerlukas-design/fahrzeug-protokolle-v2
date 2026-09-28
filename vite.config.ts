import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// Nur der Vorschau-Deploy setzt VITE_PREVIEW=1 (preview.yml). Dann bekommt die
// App das Icon mit lila Hintergrund – auf dem Startbildschirm sonst nicht von der
// echten App zu unterscheiden, obwohl beide dieselben Daten ändern.
const preview = process.env.VITE_PREVIEW === '1'
const icon = preview ? 'logo-preview.webp' : 'logo.webp'

export default defineConfig({
  // Version aus der package.json, damit die Einstellungen-Seite nicht driftet
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    // Auch der Tab im Browser zeigt in der Vorschau das lila Icon.
    {
      name: 'preview-favicon',
      transformIndexHtml: (html: string) =>
        preview ? html.replace('href="/logo.png"', `href="/${icon}"`).replace('type="image/png"', 'type="image/webp"') : html,
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', icon],
      manifest: {
        name: 'Vehicle Protocol Pro',
        short_name: 'VPP',
        description: 'Fahrzeug-Protokolle CarHandling',
        theme_color: '#3f3f3f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: icon, sizes: '192x192', type: 'image/webp' },
          { src: icon, sizes: '512x512', type: 'image/webp' },
          // Android schneidet Icons rund oder als Squircle zu. Im maskable
          // Icon steht das Logo deshalb kleiner in der sicheren Mitte, damit
          // der Zuschnitt nichts davon abschneidet.
          ...(preview
            ? [
                { src: 'logo-preview-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
                { src: 'logo-preview-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ]
            : []),
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,webp,png}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\.supabase\.co\/rest\/v1\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.supabase\.co\/storage\/v1\/object\/public\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
