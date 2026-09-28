import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/index'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Nur in der Vorschau-App: ein lila Rahmen, damit sie nicht mit der
        produktiven verwechselt wird – beide greifen auf dieselben Daten zu.
        pointer-events-none, damit darunter alles bedienbar bleibt. */}
    {import.meta.env.VITE_PREVIEW === '1' && (
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[9999] pointer-events-none border-4 border-purple-500"
      />
    )}
  </StrictMode>,
)
