import { useNavigate } from 'react-router-dom'

export default function Datenschutz() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-brand-600 font-medium text-sm"
        >
          ← Zurück
        </button>
        <h1 className="text-lg font-bold text-gray-900">Datenschutzerklärung</h1>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 text-sm text-gray-700">
        <section>
          <h2 className="font-semibold text-gray-900 mb-2">1. Verantwortlicher</h2>
          <p>
            Lukas Herger<br />
            Passauerstraße 26, 81369 München<br />
            E-Mail:{' '}
            <a href="mailto:herger.lukas@gmail.com" className="text-brand-600 underline">
              herger.lukas@gmail.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">2. Welche Daten werden verarbeitet</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Namen von Mitarbeitern und Kunden</li>
            <li>Fahrzeugfotos und Schadensfotos</li>
            <li>Unterschriften (Mitarbeiter und Kunden bei Übernahme)</li>
            <li>Standortangaben (Abholort / Zielort)</li>
            <li>Kilometerstand und Fahrzeugdaten</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">3. Zweck der Verarbeitung</h2>
          <p>
            Interne Dokumentation von Fahrzeugübergaben und -überführungen.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">4. Rechtsgrundlage</h2>
          <p>
            Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) für Kunden-Unterschriften;
            Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse) für die interne Dokumentation.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">5. Speicherung &amp; Löschung</h2>
          <p>
            Daten werden auf Servern von Supabase (Irland / EU) gespeichert.
            Protokolle werden nach 3 Jahren gelöscht. Mit Supabase besteht ein
            Auftragsverarbeitungsvertrag (DPA).
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">6. Auftragsverarbeiter</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Supabase Inc. (Datenbank &amp; Dateispeicher) — DPA abgeschlossen</li>
            <li>Fly.io Inc. (Hosting) — DPA abgeschlossen</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">7. Rechte der betroffenen Personen</h2>
          <p>
            Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
            Verarbeitung und Widerspruch gemäß Art. 15–21 DSGVO. Anfragen richten Sie bitte
            an:{' '}
            <a href="mailto:herger.lukas@gmail.com" className="text-brand-600 underline">
              herger.lukas@gmail.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">8. Hinweis zur Unterschrift</h2>
          <p>
            Mit der geleisteten Unterschrift stimmt die unterzeichnende Person der
            Verarbeitung ihrer Unterschrift zum Zweck der Protokollierung der
            Fahrzeugübergabe zu (Art. 6 Abs. 1 lit. b DSGVO).
          </p>
        </section>
      </div>
    </div>
  )
}
