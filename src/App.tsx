import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/auth'
import Login from './pages/Login'
import Layout from './components/Layout'
import Ueberfuehrung from './pages/Ueberfuehrung'
import Annahme from './pages/Annahme'
import Fahrzeuge from './pages/Fahrzeuge'
import Archiv from './pages/Archiv'
import Einstellungen from './pages/Einstellungen'
import Impressum from './pages/Impressum'
import Datenschutz from './pages/Datenschutz'
import ErrorBoundary from './components/ErrorBoundary'

function RequireAuth({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/datenschutz" element={<Datenschutz />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/ueberfuehrung" element={<Ueberfuehrung />} />
          <Route path="/annahme" element={<Annahme />} />
          <Route path="/fahrzeuge" element={<Fahrzeuge />} />
          <Route path="/archiv" element={<Archiv />} />
          <Route path="/einstellungen" element={<Einstellungen />} />
          <Route path="/" element={<Navigate to="/fahrzeuge" replace />} />
          <Route path="*" element={<Navigate to="/fahrzeuge" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
