import { useCallback, useEffect, useState } from 'react'
import { Loader2, Send, X, Check } from 'lucide-react'
import { searchModelosByTalleDisponible, logEnvioFotos } from '../../../services/crmPhotos'
import type { PhotoMatch } from '../../../types/crm'
import { TIPOS_BOTIN, TIPO_LABEL, TALLE_ARG_MIN, TALLE_ARG_MAX, normalizeTipo, type TipoBotin } from '../../../lib/crmBusqueda'
import './PhotoSender.css'

const TALLES_ARG = Array.from({ length: TALLE_ARG_MAX - TALLE_ARG_MIN + 1 }, (_, i) => TALLE_ARG_MIN + i)

interface PhotoSenderProps {
  isOpen: boolean
  onClose: () => void
  tipo: string | null
  talle: number | null
  conversacionId: string
  empleadoId: string | null
  onSendPhotos: (items: PhotoMatch[], conversacionId: string) => Promise<void>
}

export function PhotoSender({
  isOpen, onClose, tipo, talle, conversacionId, empleadoId, onSendPhotos,
}: PhotoSenderProps) {
  const [matches, setMatches] = useState<PhotoMatch[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  // Arrancan con lo que detectó la IA, pero se pueden cambiar acá mismo: si
  // entendió mal el talle o el tipo, se corrige antes de mandar nada.
  const [tipoFiltro, setTipoFiltro] = useState<TipoBotin | null>(normalizeTipo(tipo))
  const [talleFiltro, setTalleFiltro] = useState<number | null>(talle)

  useEffect(() => {
    if (!isOpen) return
    setTipoFiltro(normalizeTipo(tipo))
    setTalleFiltro(talle)
  }, [isOpen, tipo, talle])

  const search = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const data = await searchModelosByTalleDisponible(tipoFiltro, talleFiltro)
      setMatches(data)
    } catch (err) {
      console.error('Error buscando modelos:', err)
      setMatches([])
    } finally {
      setLoading(false)
    }
  }, [tipoFiltro, talleFiltro])

  useEffect(() => {
    if (isOpen) search()
  }, [isOpen, search])

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  function toggleSelect(modeloId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(modeloId)) next.delete(modeloId)
      else next.add(modeloId)
      return next
    })
  }

  const todosSeleccionados = matches.length > 0 && selected.size === matches.length
  function toggleSelectAll() {
    setSelected(todosSeleccionados ? new Set() : new Set(matches.map(m => m.modelo_id)))
  }

  async function handleSend() {
    const items = matches.filter(m => selected.has(m.modelo_id))
    if (items.length === 0) return
    setSending(true)
    try {
      await onSendPhotos(items, conversacionId)
      for (const item of items) {
        await logEnvioFotos(conversacionId, item.modelo_id, talleFiltro, empleadoId)
      }
      onClose()
    } catch (err) {
      console.error('Error enviando fotos:', err)
    } finally {
      setSending(false)
    }
  }

  const selectedItems = matches.filter(m => selected.has(m.modelo_id))

  if (!isOpen) return null

  return (
    <div className="photo-sender-overlay" onClick={onClose}>
      <div className="photo-sender-modal" onClick={e => e.stopPropagation()}>
        <div className="photo-sender-header">
          <div>
            <h2>Mandar fotos</h2>
            <span className="photo-sender-subtitle">
              {tipoFiltro && TIPO_LABEL[tipoFiltro]}
              {tipoFiltro && talleFiltro && ' · '}
              {talleFiltro && `Talle ${talleFiltro}`}
              {!tipoFiltro && !talleFiltro && 'Todos los modelos disponibles'}
            </span>
          </div>
          <button className="photo-sender-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="photo-sender-filters">
          <div className="photo-sender-filter-chips" role="group" aria-label="Tipo de botín">
            <button
              type="button"
              className={`photo-sender-chip${tipoFiltro === null ? ' photo-sender-chip--active' : ''}`}
              onClick={() => setTipoFiltro(null)}
              title="Mostrar modelos de todos los tipos"
            >
              Todos
            </button>
            {TIPOS_BOTIN.map(t => (
              <button
                key={t}
                type="button"
                className={`photo-sender-chip${tipoFiltro === t ? ' photo-sender-chip--active' : ''}`}
                onClick={() => setTipoFiltro(t)}
                title={`Mostrar solo ${TIPO_LABEL[t]}`}
              >
                {TIPO_LABEL[t]}
              </button>
            ))}
          </div>
          <select
            className="photo-sender-talle-select"
            value={talleFiltro ?? ''}
            onChange={e => setTalleFiltro(e.target.value ? Number(e.target.value) : null)}
            title="Talle (argentino)"
          >
            <option value="">Cualquier talle</option>
            {TALLES_ARG.map(t => <option key={t} value={t}>Talle {t}</option>)}
          </select>
        </div>

        <div className="photo-sender-body">
          {loading ? (
            <div className="photo-sender-loading">
              <Loader2 className="photo-sender-spin" size={28} />
              <span>Buscando modelos disponibles...</span>
            </div>
          ) : matches.length === 0 ? (
            <div className="photo-sender-empty">
              No se encontraron modelos con stock para esta consulta.
            </div>
          ) : (
            <>
              <div className="photo-sender-select-all-row">
                <button
                  type="button"
                  className="photo-sender-select-all-btn"
                  onClick={toggleSelectAll}
                  title={todosSeleccionados ? 'Deseleccionar todos los modelos de la lista' : 'Seleccionar todos los modelos de la lista para mandarlos juntos'}
                >
                  {todosSeleccionados ? <X size={14} /> : <Check size={14} />}
                  {todosSeleccionados ? 'Deseleccionar todo' : `Seleccionar todo (${matches.length})`}
                </button>
              </div>
              <div className="photo-sender-grid">
              {matches.map(m => (
                <div
                  key={m.modelo_id}
                  className={`photo-sender-card ${selected.has(m.modelo_id) ? 'photo-sender-card--selected' : ''}`}
                  onClick={() => toggleSelect(m.modelo_id)}
                >
                  <div className="photo-sender-card-check">
                    {selected.has(m.modelo_id) && <Check size={14} />}
                  </div>
                  <div className="photo-sender-thumb">
                    <img
                      src={m.fotos[0]?.foto_url}
                      alt={`${m.marca} ${m.modelo}`}
                      loading="lazy"
                    />
                  </div>
                  <div className="photo-sender-card-info">
                    <span className="photo-sender-brand">{m.marca}</span>
                    <span className="photo-sender-model">{m.modelo}</span>
                    <span className="photo-sender-price">
                      ${m.precio_real.toLocaleString('es-AR')}
                    </span>
                    <div className="photo-sender-sizes">
                      {m.talles_disponibles.map(t => (
                        <span
                          key={t.talle_arg}
                          className={`photo-sender-size ${talleFiltro && t.talle_arg === talleFiltro ? 'photo-sender-size--match' : ''}`}
                        >
                          {t.talle_arg}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
        </div>

        {selectedItems.length > 0 && (
          <div className="photo-sender-preview">
            <h3>Vista previa ({selectedItems.length} modelo{selectedItems.length > 1 ? 's' : ''})</h3>
            <div className="photo-sender-preview-list">
              {selectedItems.map(m => (
                <div key={m.modelo_id} className="photo-sender-preview-item">
                  <img src={m.fotos[0]?.foto_url} alt={m.modelo} />
                  <div>
                    <strong>{m.marca} {m.modelo}</strong>
                    <span>${m.precio_real.toLocaleString('es-AR')}</span>
                    <span className="photo-sender-preview-sizes">
                      Talles: {m.talles_disponibles.map(t => t.talle_arg).join(', ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="photo-sender-footer">
          <button className="photo-sender-btn photo-sender-btn--cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="photo-sender-btn photo-sender-btn--send"
            disabled={selected.size === 0 || sending}
            onClick={handleSend}
          >
            {sending ? (
              <><Loader2 className="photo-sender-spin" size={16} /> Enviando...</>
            ) : (
              <><Send size={16} /> Enviar fotos</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
