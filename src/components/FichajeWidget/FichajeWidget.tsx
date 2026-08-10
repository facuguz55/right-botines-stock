import { useState, useEffect } from 'react'
import { Play, Square } from 'lucide-react'
import type { useFichajeActual } from '../../hooks/useFichajeActual'
import './FichajeWidget.css'

function tiempoEnTurno(horaEntrada: string): string {
  const entrada = new Date(horaEntrada).getTime()
  const mins = Math.max(0, Math.round((Date.now() - entrada) / 60000))
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

interface FichajeWidgetProps {
  fichajeHook: ReturnType<typeof useFichajeActual>
}

// Fichar entrada/salida es una acción propia, separada de iniciar/cerrar
// sesión — así el empleado puede seguir usando la app sin que eso afecte
// su fichaje, y es responsable de ficharse él mismo.
export function FichajeWidget({ fichajeHook }: FichajeWidgetProps) {
  const { fichaje, loading, ficharEntrada, ficharSalida } = fichajeHook
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!fichaje) return
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [fichaje])

  if (loading) return null

  const handleClick = async () => {
    setSaving(true)
    try {
      if (fichaje) await ficharSalida()
      else await ficharEntrada()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`fichaje-widget${fichaje ? ' en-turno' : ''}`}>
      {fichaje && (
        <span className="fichaje-tiempo">En turno · {tiempoEnTurno(fichaje.hora_entrada)}</span>
      )}
      <button
        type="button"
        className={`fichaje-btn${fichaje ? ' salida' : ' entrada'}`}
        onClick={handleClick}
        disabled={saving}
      >
        {fichaje ? <Square size={12} /> : <Play size={12} />}
        <span>{saving ? 'Guardando...' : fichaje ? 'Fichar salida' : 'Fichar entrada'}</span>
      </button>
    </div>
  )
}
