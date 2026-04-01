import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/auth'
import Login from './pages/Login'
import Layout from './components/Layout'
import Ueberfuehrung from './pages/Ueberfuehrung'
import Annahme from './pages/Annahme'
import Fahrzeuge from './pages/Fahrzeuge'
import Archiv from './pages/Archiv'
import Einstellungen from './pages/Einstellungen'

function RequireAuth({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
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
  )
}
