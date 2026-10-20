import { useEffect, useRef, useState } from 'react'
import { Check, Trash2, Plus } from 'lucide-react'
import type { CrmEtiqueta } from '../../../types/crm'
import { ETIQUETA_COLORES } from '../../../types/crm'
import './Etiquetas.css'

interface EtiquetasPickerProps {
  etiquetas: CrmEtiqueta[]
  seleccionadas: Set<string>
  onToggle: (etiquetaId: string) => void
  onCrear: (nombre: string, color: string) => Promise<void>
  onEliminar: (etiquetaId: string) => void
  onClose: () => void
}

export default function EtiquetasPicker({ etiquetas, seleccionadas, onToggle, onCrear, onEliminar, onClose }: EtiquetasPickerProps) {
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(ETIQUETA_COLORES[0])
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      // El botón que abre el selector se encarga de cerrarlo él mismo.
      if (target.closest?.('[data-etiquetas-toggle]')) return
      if (ref.current && !ref.current.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const crear = async () => {
    const n = nombre.trim()
    if (!n || creando) return
    setCreando(true)
    setError(null)
    try {
      await onCrear(n, color)
      setNombre('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la etiqueta.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="etiquetas-picker" ref={ref} role="dialog" aria-label="Etiquetas del chat">
      <div className="etiquetas-picker-title">Etiquetas</div>

      {etiquetas.length === 0 ? (
        <p className="etiquetas-picker-empty">Todavía no hay etiquetas. Creá la primera acá abajo.</p>
      ) : (
        <ul className="etiquetas-picker-list">
          {etiquetas.map(e => {
            const activa = seleccionadas.has(e.id)
            return (
              <li key={e.id} className="etiquetas-picker-row">
                <button className="etiquetas-picker-item" onClick={() => onToggle(e.id)}>
                  <span className={`etiquetas-picker-check${activa ? ' etiquetas-picker-check--on' : ''}`}>
                    {activa && <Check size={12} />}
                  </span>
                  <span className="etiquetas-picker-dot" style={{ background: e.color }} />
                  <span className="etiquetas-picker-name">{e.nombre}</span>
                </button>
                <button
                  className="etiquetas-picker-delete"
                  title="Borrar esta etiqueta de todos los chats"
                  onClick={() => {
                    if (window.confirm(`¿Borrar la etiqueta "${e.nombre}"? Se saca de todos los chats que la tienen.`)) onEliminar(e.id)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="etiquetas-picker-new">
        <div className="etiquetas-picker-colors">
          {ETIQUETA_COLORES.map(c => (
            <button
              key={c}
              className={`etiquetas-picker-color${color === c ? ' etiquetas-picker-color--on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="etiquetas-picker-new-row">
          <input
            type="text"
            placeholder="Nueva etiqueta (ej: Cambio pendiente)"
            value={nombre}
            maxLength={30}
            onChange={(e) => { setNombre(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') crear() }}
          />
          <button className="etiquetas-picker-add" disabled={!nombre.trim() || creando} onClick={crear} title="Crear y ponérsela a este chat">
            <Plus size={16} />
          </button>
        </div>
        {error && <p className="etiquetas-picker-error">{error}</p>}
      </div>
    </div>
  )
}
