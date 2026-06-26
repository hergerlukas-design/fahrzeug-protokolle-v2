import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 gap-4 text-center bg-gray-50">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-lg font-bold text-gray-900">Etwas ist schiefgelaufen</h1>
        <p className="text-sm text-gray-500 max-w-xs">{this.state.error.message}</p>
        <button
          onClick={() => { this.setState({ error: null }); window.location.reload() }}
          className="px-6 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold"
        >
          Neu laden
        </button>
      </div>
    )
  }
}
