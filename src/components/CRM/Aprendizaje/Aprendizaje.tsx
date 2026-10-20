import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Trash2 } from 'lucide-react'
import {
  aprobarAprendizaje, descartarAprendizaje, fetchAprendizajes,
  type CrmAprendizaje, type EstadoAprendizaje, type OrigenAprendizaje,
} from '../../../services/crmAprendizajes'
import './Aprendizaje.css'

const ORIGEN: Record<OrigenAprendizaje, string> = {
  distinta: 'Se mandó algo distinto al bot',
  usada: 'Se mandó lo que sugirió el bot',
  sin_sugerencia: 'El bot no tenía sugerencia',
}

function nombreDe(a: CrmAprendizaje) {
  const c = a.wsp_conversaciones
  return c?.nombre_personalizado || c?.nombre || c?.telefono || 'Cliente'
}

export function Aprendizaje() {
  const [tab, setTab] = useState<EstadoAprendizaje>('pendiente')
  const [items, setItems] = useState<CrmAprendizaje[]>([])
  const [loading, setLoading] = useState(true)
  const [textos, setTextos] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [soloCambios, setSoloCambios] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await fetchAprendizajes(tab)
      setItems(data)
      setTextos(Object.fromEntries(data.map(a => [a.id, a.respuesta_aprobada ?? a.respuesta_humano ?? a.respuesta_bot ?? ''])))
    } catch {
      setError('No se pudo cargar. Probá de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { cargar() }, [cargar])

  const accion = async (id: string, fn: () => Promise<void>) => {
    setOcupado(id)
    try { await fn(); setItems(prev => prev.filter(i => i.id !== id)) }
    catch { setError('No se pudo guardar. Probá de nuevo.') }
    finally { setOcupado(null) }
  }

  const visibles = items.filter(a => !soloCambios || a.origen !== 'usada')

  return (
    <div className="aprendizaje">
      <header className="aprendizaje-head">
        <div>
          <h2>Aprendizaje del bot</h2>
          <p>Cada respuesta que se manda queda acá. Revisá qué sugirió el bot, corregila si hace falta y aprobala: así aprende cómo contestan ustedes.</p>
        </div>
      </header>

      <div className="aprendizaje-tabs">
        <button className={tab === 'pendiente' ? 'on' : ''} onClick={() => setTab('pendiente')}>Para revisar</button>
        <button className={tab === 'aprobado' ? 'on' : ''} onClick={() => setTab('aprobado')}>Aprobadas</button>
        {tab === 'pendiente' && (
          <label className="aprendizaje-filtro">
            <input type="checkbox" checked={soloCambios} onChange={e => setSoloCambios(e.target.checked)} /> Solo las que cambiaron
          </label>
        )}
      </div>

      {error && <p className="aprendizaje-error">{error}</p>}
      {loading ? (
        <p className="aprendizaje-vacio"><Loader2 size={16} className="spin" /> Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="aprendizaje-vacio">{tab === 'pendiente' ? 'No hay nada para revisar por ahora.' : 'Todavía no aprobaste respuestas.'}</p>
      ) : (
        <div className="aprendizaje-lista">
          {visibles.map(a => (
            <article key={a.id} className="aprendizaje-card">
              <div className="aprendizaje-card-top">
                <strong>{nombreDe(a)}</strong>
                <span className={`aprendizaje-origen aprendizaje-origen--${a.origen}`}>{ORIGEN[a.origen]}</span>
                <time>{new Date(a.created_at).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
              </div>

              <div className="aprendizaje-bloque">
                <label>El cliente dijo</label>
                <p className="aprendizaje-cliente">{a.pregunta}</p>
              </div>

              <div className="aprendizaje-cols">
                <div className="aprendizaje-bloque">
                  <label>Lo que sugirió el bot</label>
                  <p className="aprendizaje-bot">{a.respuesta_bot ?? 'El bot no tenía una sugerencia para este mensaje.'}</p>
                </div>
                <div className="aprendizaje-bloque">
                  <label>{tab === 'pendiente' ? 'Lo que respondería Right (se puede cambiar)' : 'Respuesta aprobada'}</label>
                  <textarea
                    value={textos[a.id] ?? ''}
                    onChange={e => setTextos(prev => ({ ...prev, [a.id]: e.target.value }))}
                    rows={4}
                  />
                </div>
              </div>

              <div className="aprendizaje-acciones">
                <button
                  className="aprendizaje-btn aprendizaje-btn--ok"
                  disabled={ocupado === a.id || !(textos[a.id] ?? '').trim()}
                  onClick={() => accion(a.id, async () => { await aprobarAprendizaje(a.id, textos[a.id] ?? '') })}
                >
                  <Check size={15} /> {tab === 'pendiente' ? 'Aprobar' : 'Guardar cambios'}
                </button>
                <button
                  className="aprendizaje-btn aprendizaje-btn--no"
                  disabled={ocupado === a.id}
                  onClick={() => accion(a.id, () => descartarAprendizaje(a.id))}
                >
                  <Trash2 size={15} /> {tab === 'pendiente' ? 'Descartar' : 'Quitar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
