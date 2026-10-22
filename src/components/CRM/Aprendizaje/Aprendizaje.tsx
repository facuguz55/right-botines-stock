import { useCallback, useEffect, useState } from 'react'
import { Check, FlaskConical, Loader2, Plus, X } from 'lucide-react'
import {
  aprobarAprendizaje, contarPendientes, descartarAprendizaje, fetchAprendizajes, probarBot,
  mensajesAprobadosDe, mensajesBotDe, mensajesHumanoDe,
  type CrmAprendizaje, type PruebaBot,
} from '../../../services/crmAprendizajes'
import './Aprendizaje.css'

type Pestana = 'pendiente' | 'aprobado' | 'probar'

const EJEMPLOS_PRUEBA = ['Tienen catálogo de botines?', 'Cuánto sale el envío?', 'Hacen envíos a Córdoba?', 'Son originales?']

function nombreDe(a: CrmAprendizaje) {
  const c = a.wsp_conversaciones
  return c?.nombre_personalizado || c?.nombre || c?.telefono || 'Cliente'
}

function fechaDe(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Lo que se muestra como "lo que contestó Right": lo que mandó, o lo ya aprobado.
function respuestaInicial(a: CrmAprendizaje, aprendida: boolean): string[] {
  const aprobados = aprendida ? mensajesAprobadosDe(a) : []
  if (aprobados.length) return aprobados
  const humano = mensajesHumanoDe(a)
  return humano.length ? humano : mensajesBotDe(a)
}

function Burbujas({ mensajes, tipo }: { mensajes: string[]; tipo: 'cliente' | 'bot' | 'prueba' }) {
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
            aria-label={`Mensaje ${i + 1} de Right`}
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
          ? <>Contestó parecido a lo que le enseñaron para: {r.usadas.map((u, i) => <em key={i}>«{u.replace(/\n/g, ' ')}»</em>)}</>
          : 'Todavía no le enseñaron nada parecido a esto: contestó solo con lo que sabe del negocio.'}
        {r.nota && <><br />{r.nota}</>}
      </p>
    </div>
  )
}

export function Aprendizaje() {
  const [tab, setTab] = useState<Pestana>('pendiente')
  const [items, setItems] = useState<CrmAprendizaje[]>([])
  const [pendientes, setPendientes] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [respuestas, setRespuestas] = useState<Record<string, string[]>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [ocultarAcertadas, setOcultarAcertadas] = useState(true)
  const [error, setError] = useState('')
  // Después de aprobar una: aviso con atajo para probarla.
  const [aviso, setAviso] = useState<{ pregunta: string } | null>(null)

  const [textoPrueba, setTextoPrueba] = useState('')
  const [prueba, setPrueba] = useState<{ cargando: boolean; r?: PruebaBot; error?: string }>({ cargando: false })

  const cargar = useCallback(async () => {
    if (tab === 'probar') return
    setLoading(true); setError('')
    try {
      const data = await fetchAprendizajes(tab)
      setItems(data)
      setRespuestas(Object.fromEntries(data.map(a => [a.id, respuestaInicial(a, tab === 'aprobado')])))
    } catch {
      setError('No se pudo cargar. Probá de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { contarPendientes().then(setPendientes).catch(() => setPendientes(null)) }, [])

  const resolver = async (a: CrmAprendizaje, fn: () => Promise<void>, eraPendiente: boolean, aprendio: boolean) => {
    setOcupado(a.id)
    try {
      await fn()
      setItems(prev => prev.filter(i => i.id !== a.id))
      if (eraPendiente) setPendientes(n => (n == null ? n : Math.max(0, n - 1)))
      setAviso(aprendio ? { pregunta: a.pregunta } : null)
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setOcupado(null)
    }
  }

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
    setAviso(null)
    setTab('probar')
    setTextoPrueba(pregunta.replace(/\n/g, ' '))
    void probar(pregunta.split('\n'))
  }

  const visibles = tab === 'aprobado' && ocultarAcertadas ? items.filter(a => a.origen !== 'usada') : items

  return (
    <div className="ap">
      <header className="ap-head">
        <h2>Enseñarle al bot</h2>
        <ol className="ap-pasos">
          <li><b>1</b> El cliente escribe</li>
          <li><b>2</b> Right contesta</li>
          <li><b>3</b> Vos decís si estuvo bien y el bot aprende</li>
        </ol>
      </header>

      <div className="ap-tabs">
        <button className={tab === 'pendiente' ? 'on' : ''} onClick={() => setTab('pendiente')}>
          Para revisar{pendientes ? <span className="ap-contador">{pendientes}</span> : null}
        </button>
        <button className={tab === 'aprobado' ? 'on' : ''} onClick={() => setTab('aprobado')}>Ya aprendió</button>
        <button className={tab === 'probar' ? 'on' : ''} onClick={() => setTab('probar')}><FlaskConical size={14} /> Probar el bot</button>
      </div>

      {aviso && tab !== 'probar' && (
        <div className="ap-aviso">
          <span><Check size={15} /> Listo, el bot aprendió esto.</span>
          <button onClick={() => irAProbar(aviso.pregunta)}>Ver cómo contestaría ahora</button>
          <button className="ap-aviso-x" onClick={() => setAviso(null)} aria-label="Cerrar"><X size={14} /></button>
        </div>
      )}

      {tab === 'probar' ? (
        <section className="ap-probar">
          <p className="ap-explica">Escribí lo que mandaría un cliente y mirá cómo contestaría el bot hoy, con todo lo que ya le enseñaron. No se manda nada a nadie.</p>
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
          {error && <p className="ap-error">{error}</p>}
          {tab === 'aprobado' && (
            <label className="ap-filtro">
              <input type="checkbox" checked={ocultarAcertadas} onChange={e => setOcultarAcertadas(e.target.checked)} />
              Ocultar las que el bot ya había acertado
            </label>
          )}
          {loading ? (
            <p className="ap-vacio"><Loader2 size={16} className="spin" /> Cargando…</p>
          ) : visibles.length === 0 ? (
            <p className="ap-vacio">
              {tab === 'pendiente'
                ? 'No hay nada para revisar. Cuando Right conteste algo distinto a lo que sugiere el bot, aparece acá.'
                : 'Todavía no aprendió nada.'}
            </p>
          ) : (
            <div className="ap-lista">
              {visibles.map(a => {
                const aprendida = tab === 'aprobado'
                const resp = respuestas[a.id] ?? []
                const hayTexto = resp.some(m => m.trim())
                const bot = mensajesBotDe(a)
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
                      <span className="ap-etiqueta ap-etiqueta--right">{aprendida ? 'El bot contesta así' : 'Right contestó'}</span>
                      <EditorMensajes valor={resp} onChange={v => setRespuestas(prev => ({ ...prev, [a.id]: v }))} />
                    </div>

                    <details className="ap-bot">
                      <summary>Ver qué hubiera dicho el bot</summary>
                      {bot.length > 0 ? <Burbujas mensajes={bot} tipo="bot" /> : <p className="ap-nota">El bot no tenía nada para sugerir.</p>}
                    </details>

                    {aprendida ? (
                      <>
                        {a.origen === 'usada' && <p className="ap-nota">Right mandó lo mismo que había sugerido el bot.</p>}
                        <div className="ap-botones">
                          <button className="ap-btn ap-btn--ok" disabled={ocupado === a.id || !hayTexto}
                            onClick={() => resolver(a, () => aprobarAprendizaje(a.id, resp), false, true)}>
                            <Check size={15} /> Guardar cambios
                          </button>
                          <button className="ap-btn ap-btn--no" disabled={ocupado === a.id}
                            onClick={() => resolver(a, () => descartarAprendizaje(a.id), false, false)}>
                            Que el bot lo olvide
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="ap-pregunta">¿Estuvo bien cómo contestó Right?</p>
                        <div className="ap-botones">
                          <button className="ap-btn ap-btn--ok" disabled={ocupado === a.id || !hayTexto}
                            onClick={() => resolver(a, () => aprobarAprendizaje(a.id, resp), true, true)}>
                            <Check size={15} /> Sí, que el bot conteste así
                          </button>
                          <button className="ap-btn ap-btn--no" disabled={ocupado === a.id}
                            onClick={() => resolver(a, () => descartarAprendizaje(a.id), true, false)}>
                            No, no enseñarle esto
                          </button>
                        </div>
                        <p className="ap-nota">Si hay algo para corregir, editá los mensajes verdes antes de aprobar.</p>
                      </>
                    )}
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
