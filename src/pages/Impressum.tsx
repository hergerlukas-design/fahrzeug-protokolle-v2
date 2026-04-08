import { useNavigate } from 'react-router-dom'

export default function Impressum() {
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
        <h1 className="text-lg font-bold text-gray-900">Impressum</h1>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 text-sm text-gray-700">
        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Angaben gemäß § 5 TMG</h2>
          <p>
            Lukas Herger<br />
            Passauerstraße 26<br />
            81369 München
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Kontakt</h2>
          <p>
            Telefon: +49 160 3504039<br />
            E-Mail:{' '}
            <a
              href="mailto:herger.lukas@gmail.com"
              className="text-brand-600 underline"
            >
              herger.lukas@gmail.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">
            Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV
          </h2>
          <p>
            Lukas Herger<br />
            Passauerstraße 26<br />
            81369 München
          </p>
        </section>
      </div>
    </div>
  )
}
