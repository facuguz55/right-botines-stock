import { Component, type ReactNode } from 'react'
import { reportarError } from '../../lib/reportarError'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    reportarError('ErrorBoundary', error, { componentStack: info.componentStack })
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{ padding: 24 }}>
          <p>Algo salió mal. Ya lo estamos investigando.</p>
        </div>
      )
    }
    return this.props.children
  }
}
