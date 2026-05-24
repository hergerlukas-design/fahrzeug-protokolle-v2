import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.webp'],
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
          { src: 'logo.webp', sizes: '192x192', type: 'image/webp' },
          { src: 'logo.webp', sizes: '512x512', type: 'image/webp' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,webp}'],
        globIgnores: ['carhandling.png'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
