import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Send, X, Check } from 'lucide-react'
import { searchModelosByTalleDisponible, logEnvioFotos } from '../../../services/crmPhotos'
import type { PhotoMatch } from '../../../types/crm'
import { TIPOS_BOTIN, TIPO_LABEL, TALLE_ARG_MIN, TALLE_ARG_MAX, coincidenciaModelo, normalizeTipo, parseModeloQuery, type TipoBotin } from '../../../lib/crmBusqueda'
import './PhotoSender.css'

const TALLES_ARG = Array.from({ length: TALLE_ARG_MAX - TALLE_ARG_MIN + 1 }, (_, i) => TALLE_ARG_MIN + i)

interface PhotoSenderProps {
  isOpen: boolean
  onClose: () => void
  tipo: string | null
  talle: number | null
  // Modelo puntual que nombró el cliente ("f50 negro blanco sc") — filtra por
  // la línea y ordena/preselecciona por colores.
  modelo?: string | null
  conversacionId: string
  empleadoId: string | null
  onSendPhotos: (items: PhotoMatch[], conversacionId: string) => Promise<void>
}

export function PhotoSender({
  isOpen, onClose, tipo, talle, modelo = null, conversacionId, empleadoId, onSendPhotos,
}: PhotoSenderProps) {
  const [resultados, setResultados] = useState<PhotoMatch[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  // Arrancan con lo que detectó la IA, pero se pueden cambiar acá mismo: si
  // entendió mal el talle o el tipo, se corrige antes de mandar nada.
  const [tipoFiltro, setTipoFiltro] = useState<TipoBotin | null>(normalizeTipo(tipo))
  const [talleFiltro, setTalleFiltro] = useState<number | null>(talle)
  const [modeloFiltro, setModeloFiltro] = useState(modelo ?? '')
  // La preselección automática ("los F50 negro/blanco" ya tildados) se hace
  // una sola vez, con la primera búsqueda al abrir — no cada vez que se
  // cambia un filtro a mano.
  const preseleccionPendiente = useRef(!!modelo)

  useEffect(() => {
    if (!isOpen) return
    setTipoFiltro(normalizeTipo(tipo))
    setTalleFiltro(talle)
    setModeloFiltro(modelo ?? '')
    preseleccionPendiente.current = !!modelo
  }, [isOpen, tipo, talle, modelo])

  const search = useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const data = await searchModelosByTalleDisponible(tipoFiltro, talleFiltro)
      setResultados(data)
    } catch (err) {
      console.error('Error buscando modelos:', err)
      setResultados([])
    } finally {
      setLoading(false)
    }
  }, [tipoFiltro, talleFiltro])

  useEffect(() => {
    if (isOpen) search()
  }, [isOpen, search])

  // Filtro por modelo (en el cliente, sobre lo que ya trajo la búsqueda por
  // tipo/talle): las palabras "duras" (f50, predator, nike) tienen que estar
  // en el nombre; los colores y "sc" no descartan pero ordenan — primero los
  // que más se parecen a lo que pidió.
  const modeloQuery = useMemo(() => parseModeloQuery(modeloFiltro), [modeloFiltro])
  const puntaje = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of resultados) map.set(r.modelo_id, coincidenciaModelo(r, modeloQuery).blandas)
    return map
  }, [resultados, modeloQuery])
  const matches = useMemo(() => {
    const filtrados = modeloQuery.duras.length
      ? resultados.filter(r => coincidenciaModelo(r, modeloQuery).pasa)
      : resultados
    if (!modeloQuery.blandas.length) return filtrados
    return [...filtrados].sort((a, b) => (puntaje.get(b.modelo_id) ?? 0) - (puntaje.get(a.modelo_id) ?? 0))
  }, [resultados, modeloQuery, puntaje])
  const mejorPuntaje = matches.length ? Math.max(...matches.map(m => puntaje.get(m.modelo_id) ?? 0)) : 0

  useEffect(() => {
    if (loading || !preseleccionPendiente.current) return
    preseleccionPendiente.current = false
    if (mejorPuntaje > 0) {
      setSelected(new Set(matches.filter(m => puntaje.get(m.modelo_id) === mejorPuntaje).map(m => m.modelo_id)))
    }
  }, [loading, matches, puntaje, mejorPuntaje])

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

  const todosSeleccionados = matches.length > 0 && matches.every(m => selected.has(m.modelo_id))
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
              {modeloQuery.duras.length > 0 && `${modeloFiltro.trim()} · `}
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
          <div className="photo-sender-modelo-input">
            <input
              type="text"
              value={modeloFiltro}
              onChange={e => setModeloFiltro(e.target.value)}
              placeholder="Modelo (ej: f50 negro)"
              title="Filtrar por modelo: la línea/marca tiene que coincidir, los colores ordenan los resultados"
            />
            {modeloFiltro && (
              <button type="button" onClick={() => setModeloFiltro('')} title="Quitar el filtro de modelo" aria-label="Quitar el filtro de modelo">
                <X size={12} />
              </button>
            )}
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
              {resultados.length > 0 ? (
                <>
                  No hay "{modeloFiltro.trim()}" con stock para este talle/tipo.
                  <button type="button" className="photo-sender-empty-link" onClick={() => setModeloFiltro('')}>
                    Ver los otros {resultados.length} modelos
                  </button>
                </>
              ) : 'No se encontraron modelos con stock para esta consulta.'}
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
