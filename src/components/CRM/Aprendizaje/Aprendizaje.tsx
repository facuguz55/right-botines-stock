import { useCallback, useEffect, useState } from 'react'
import { Check, FlaskConical, Loader2, Pencil, Plus, X } from 'lucide-react'
import {
  aprobarAprendizaje, descartarAprendizaje, fetchAprendizajes, probarBot,
  mensajesAprobadosDe, mensajesBotDe,
  type CrmAprendizaje, type PruebaBot,
} from '../../../services/crmAprendizajes'
import './Aprendizaje.css'

type Pestana = 'aprendio' | 'probar'

const EJEMPLOS_PRUEBA = ['Tienen catálogo de botines?', 'Cuánto sale el envío?', 'Hacen envíos a Córdoba?', 'Son originales?']

function nombreDe(a: CrmAprendizaje) {
  const c = a.wsp_conversaciones
  return c?.nombre_personalizado || c?.nombre || c?.telefono || 'Cliente'
}

function fechaDe(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Burbujas({ mensajes, tipo }: { mensajes: string[]; tipo: 'cliente' | 'right' | 'bot' | 'prueba' }) {
  return (
    <div className={`ap-burbujas ap-burbujas--${tipo}`}>
      {mensajes.map((m, i) => <p key={i} className="ap-burbuja">{m}</p>)}
    </div>
  )
}

function EditorMensajes({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const cambiar = (i: number, t: string) => onChange(valor.map((m, j) => (j === i ? t : m)))
  const quitar = (i: number) => onChange(valor.filter((_, j) => j !== i))
  return (
    <div className="ap-editor">
      {valor.map((m, i) => (
        <div key={i} className="ap-editor-fila">
          <textarea
            value={m}
            rows={Math.min(6, Math.max(1, Math.ceil(m.length / 46)))}
            onChange={e => cambiar(i, e.target.value)}
            aria-label={`Mensaje ${i + 1}`}
          />
          {valor.length > 1 && (
            <button className="ap-quitar" onClick={() => quitar(i)} aria-label="Quitar este mensaje" title="Quitar este mensaje"><X size={14} /></button>
          )}
        </div>
      ))}
      <button className="ap-agregar" onClick={() => onChange([...valor, ''])}><Plus size={13} /> Agregar otro mensaje</button>
    </div>
  )
}

function ResultadoPrueba({ r }: { r: PruebaBot }) {
  return (
    <div className="ap-resultado">
      <span className="ap-etiqueta">Así contestaría el bot hoy</span>
      <Burbujas mensajes={r.mensajes} tipo="prueba" />
      <p className="ap-nota">
        {r.usadas.length > 0
          ? <>Contestó parecido a lo que contestó Right en: {r.usadas.map((u, i) => <em key={i}>«{u.replace(/\n/g, ' ')}»</em>)}</>
          : 'Todavía no hay una respuesta de Right parecida a esto: contestó solo con lo que sabe del negocio.'}
        {r.nota && <><br />{r.nota}</>}
      </p>
    </div>
  )
}

export function Aprendizaje() {
  const [tab, setTab] = useState<Pestana>('aprendio')
  const [items, setItems] = useState<CrmAprendizaje[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [soloDistintas, setSoloDistintas] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<string[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)

  const [textoPrueba, setTextoPrueba] = useState('')
  const [prueba, setPrueba] = useState<{ cargando: boolean; r?: PruebaBot; error?: string }>({ cargando: false })

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setItems(await fetchAprendizajes('aprobado'))
    } catch {
      setError('No se pudo cargar. Probá de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const probar = async (lineas: string[]) => {
    const limpias = lineas.map(l => l.trim()).filter(Boolean)
    if (limpias.length === 0) return
    setPrueba({ cargando: true })
    try {
      setPrueba({ cargando: false, r: await probarBot(limpias) })
    } catch (e) {
      setPrueba({ cargando: false, error: e instanceof Error ? e.message : 'No se pudo probar.' })
    }
  }

  const irAProbar = (pregunta: string) => {
    setTab('probar')
    setTextoPrueba(pregunta.replace(/\n/g, ' '))
    void probar(pregunta.split('\n'))
  }

  const guardarCorreccion = async (a: CrmAprendizaje) => {
    const limpios = borrador.map(m => m.trim()).filter(Boolean)
    if (limpios.length === 0) return
    setOcupado(a.id)
    try {
      await aprobarAprendizaje(a.id, limpios)
      setItems(prev => prev.map(i => (i.id === a.id ? { ...i, mensajes_aprobados: limpios, respuesta_aprobada: limpios.join('\n\n') } : i)))
      setEditando(null)
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setOcupado(null)
    }
  }

  const olvidar = async (a: CrmAprendizaje) => {
    setOcupado(a.id)
    try {
      await descartarAprendizaje(a.id)
      setItems(prev => prev.filter(i => i.id !== a.id))
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setOcupado(null)
    }
  }

  const visibles = soloDistintas ? items.filter(a => a.origen !== 'usada') : items

  return (
    <div className="ap">
      <header className="ap-head">
        <h2>Enseñarle al bot</h2>
        <ol className="ap-pasos">
          <li><b>1</b> El cliente escribe</li>
          <li><b>2</b> Right contesta</li>
          <li><b><Check size={12} /></b> El bot aprende solo, sin aprobar nada</li>
        </ol>
      </header>

      <div className="ap-tabs">
        <button className={tab === 'aprendio' ? 'on' : ''} onClick={() => setTab('aprendio')}>
          Lo que aprendió{items.length > 0 ? <span className="ap-contador">{items.length}</span> : null}
        </button>
        <button className={tab === 'probar' ? 'on' : ''} onClick={() => setTab('probar')}><FlaskConical size={14} /> Probar el bot</button>
      </div>

      {tab === 'probar' ? (
        <section className="ap-probar">
          <p className="ap-explica">Escribí lo que mandaría un cliente y mirá cómo contestaría el bot hoy, con todo lo que aprendió de Right. No se manda nada a nadie.</p>
          <div className="ap-probar-fila">
            <input
              value={textoPrueba}
              onChange={e => setTextoPrueba(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void probar([textoPrueba]) }}
              placeholder="Escribí lo que diría un cliente"
              maxLength={300}
            />
            <button className="ap-btn ap-btn--ok" disabled={prueba.cargando || !textoPrueba.trim()} onClick={() => void probar([textoPrueba])}>
              {prueba.cargando ? <Loader2 size={15} className="spin" /> : <FlaskConical size={15} />} Probar
            </button>
          </div>
          <div className="ap-ejemplos">
            {EJEMPLOS_PRUEBA.map(e => (
              <button key={e} onClick={() => { setTextoPrueba(e); void probar([e]) }}>{e}</button>
            ))}
          </div>
          {prueba.error && <p className="ap-error">{prueba.error}</p>}
          {prueba.r && <ResultadoPrueba r={prueba.r} />}
        </section>
      ) : (
        <>
          <p className="ap-explica">
            Cada vez que Right contesta un chat desde el CRM, el bot aprende cómo contestó. Acá lo ves. Si alguna respuesta no sirve, la corregís o hacés que el bot la olvide.
          </p>
          {error && <p className="ap-error">{error}</p>}
          <label className="ap-filtro">
            <input type="checkbox" checked={soloDistintas} onChange={e => setSoloDistintas(e.target.checked)} />
            Mostrar solo donde Right contestó distinto a lo que sugería el bot
          </label>
          {loading ? (
            <p className="ap-vacio"><Loader2 size={16} className="spin" /> Cargando…</p>
          ) : visibles.length === 0 ? (
            <p className="ap-vacio">Todavía no aprendió nada. Cuando Right conteste un chat desde el CRM, aparece acá.</p>
          ) : (
            <div className="ap-lista">
              {visibles.map(a => {
                const resp = mensajesAprobadosDe(a)
                const bot = mensajesBotDe(a)
                const enEdicion = editando === a.id
                return (
                  <article key={a.id} className="ap-card">
                    <div className="ap-card-top">
                      <strong>{nombreDe(a)}</strong>
                      <time>{fechaDe(a.created_at)}</time>
                    </div>

                    <div className="ap-bloque">
                      <span className="ap-etiqueta">El cliente escribió</span>
                      <Burbujas mensajes={a.pregunta.split('\n').filter(Boolean)} tipo="cliente" />
                    </div>

                    <div className="ap-bloque ap-bloque--right">
                      <span className="ap-etiqueta ap-etiqueta--right">Right contestó, el bot contesta parecido</span>
                      {enEdicion
                        ? <EditorMensajes valor={borrador} onChange={setBorrador} />
                        : <Burbujas mensajes={resp} tipo="right" />}
                    </div>

                    <details className="ap-bot">
                      <summary>Ver qué hubiera dicho el bot</summary>
                      {bot.length > 0 ? <Burbujas mensajes={bot} tipo="bot" /> : <p className="ap-nota">El bot no tenía nada para sugerir.</p>}
                    </details>

                    <div className="ap-botones">
                      {enEdicion ? (
                        <>
                          <button className="ap-btn ap-btn--ok" disabled={ocupado === a.id || !borrador.some(m => m.trim())} onClick={() => guardarCorreccion(a)}>
                            <Check size={15} /> Guardar
                          </button>
                          <button className="ap-btn" onClick={() => setEditando(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button className="ap-btn" onClick={() => irAProbar(a.pregunta)}><FlaskConical size={15} /> Probar</button>
                          <button className="ap-btn" onClick={() => { setEditando(a.id); setBorrador(resp) }}><Pencil size={14} /> Corregir</button>
                          <button className="ap-btn ap-btn--no" disabled={ocupado === a.id} onClick={() => olvidar(a)}>Que el bot lo olvide</button>
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
