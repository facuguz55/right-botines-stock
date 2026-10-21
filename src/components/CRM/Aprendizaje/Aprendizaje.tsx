import { useCallback, useEffect, useState } from 'react'
import { Check, FlaskConical, Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  aprobarAprendizaje, descartarAprendizaje, fetchAprendizajes, probarBot,
  mensajesAprobadosDe, mensajesBotDe, mensajesHumanoDe,
  type CrmAprendizaje, type EstadoAprendizaje, type OrigenAprendizaje, type PruebaBot,
} from '../../../services/crmAprendizajes'
import './Aprendizaje.css'

const ORIGEN: Record<OrigenAprendizaje, string> = {
  distinta: 'Se mandó algo distinto al bot',
  usada: 'Se mandó tal cual lo del bot',
  sin_sugerencia: 'El bot no tenía sugerencia',
}

function nombreDe(a: CrmAprendizaje) {
  const c = a.wsp_conversaciones
  return c?.nombre_personalizado || c?.nombre || c?.telefono || 'Cliente'
}

// Lo que ya mandó Right (o lo que aprobó), o si no lo que sugería el bot, para
// arrancar a editar desde ahí.
function borradorInicial(a: CrmAprendizaje, tab: EstadoAprendizaje): string[] {
  const aprobados = tab === 'aprobado' ? mensajesAprobadosDe(a) : []
  if (aprobados.length) return aprobados
  const humano = mensajesHumanoDe(a)
  if (humano.length) return humano
  return mensajesBotDe(a)
}

function Burbujas({ mensajes, vacio }: { mensajes: string[]; vacio?: string }) {
  if (mensajes.length === 0) return <p className="aprendizaje-bot">{vacio}</p>
  return (
    <div className="aprendizaje-burbujas">
      {mensajes.map((m, i) => <p key={i} className="aprendizaje-burbuja">{m}</p>)}
    </div>
  )
}

function EditorMensajes({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const cambiar = (i: number, t: string) => onChange(valor.map((m, j) => (j === i ? t : m)))
  const quitar = (i: number) => onChange(valor.filter((_, j) => j !== i))
  return (
    <div className="aprendizaje-editor">
      {valor.map((m, i) => (
        <div key={i} className="aprendizaje-editor-fila">
          <textarea value={m} rows={Math.min(5, Math.max(1, Math.ceil(m.length / 38)))} onChange={e => cambiar(i, e.target.value)} />
          <button className="aprendizaje-quitar" onClick={() => quitar(i)} aria-label="Quitar este mensaje" title="Quitar este mensaje"><X size={14} /></button>
        </div>
      ))}
      <button className="aprendizaje-agregar" onClick={() => onChange([...valor, ''])}><Plus size={13} /> Agregar mensaje</button>
    </div>
  )
}

function ResultadoPrueba({ r, titulo }: { r: PruebaBot; titulo: string }) {
  return (
    <div className="aprendizaje-prueba">
      <label>{titulo}</label>
      <Burbujas mensajes={r.mensajes} />
      <p className="aprendizaje-prueba-nota">
        {r.usadas.length > 0
          ? <>Se basó en lo que ya aprobaron para: {r.usadas.map((u, i) => <em key={i}>«{u}»</em>)}</>
          : 'No usó ninguna respuesta aprobada para esto (todavía no hay una parecida).'}
        {r.nota && <><br />{r.nota}</>}
      </p>
    </div>
  )
}

export function Aprendizaje() {
  const [tab, setTab] = useState<EstadoAprendizaje>('pendiente')
  const [items, setItems] = useState<CrmAprendizaje[]>([])
  const [loading, setLoading] = useState(true)
  const [borradores, setBorradores] = useState<Record<string, string[]>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [soloCambios, setSoloCambios] = useState(true)
  const [error, setError] = useState('')
  const [pruebas, setPruebas] = useState<Record<string, { cargando: boolean; r?: PruebaBot; error?: string }>>({})

  // Caja para probar al bot con cualquier pregunta.
  const [textoPrueba, setTextoPrueba] = useState('')
  const [pruebaLibre, setPruebaLibre] = useState<{ cargando: boolean; r?: PruebaBot; error?: string }>({ cargando: false })

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await fetchAprendizajes(tab)
      setItems(data)
      setBorradores(Object.fromEntries(data.map(a => [a.id, borradorInicial(a, tab)])))
      setPruebas({})
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

  const probarTarjeta = async (a: CrmAprendizaje) => {
    const respuesta = (borradores[a.id] ?? []).map(m => m.trim()).filter(Boolean)
    setPruebas(prev => ({ ...prev, [a.id]: { cargando: true } }))
    try {
      const r = await probarBot(a.pregunta.split('\n'), respuesta)
      setPruebas(prev => ({ ...prev, [a.id]: { cargando: false, r } }))
    } catch (e) {
      setPruebas(prev => ({ ...prev, [a.id]: { cargando: false, error: e instanceof Error ? e.message : 'No se pudo probar.' } }))
    }
  }

  const probarLibre = async () => {
    const t = textoPrueba.trim()
    if (!t) return
    setPruebaLibre({ cargando: true })
    try {
      setPruebaLibre({ cargando: false, r: await probarBot(t.split('\n').filter(Boolean)) })
    } catch (e) {
      setPruebaLibre({ cargando: false, error: e instanceof Error ? e.message : 'No se pudo probar.' })
    }
  }

  const visibles = items.filter(a => tab !== 'aprobado' || !soloCambios || a.origen !== 'usada')

  return (
    <div className="aprendizaje">
      <header className="aprendizaje-head">
        <h2>Aprendizaje del bot</h2>
        <p>
          Cuando Right contesta algo distinto a lo que sugirió el bot, queda acá. Corregilo si hace falta y aprobalo:
          el bot lo usa la próxima vez que le pregunten algo parecido. Lo que se manda tal cual lo que sugiere el bot ya cuenta como aprobado.
        </p>
      </header>

      <section className="aprendizaje-probar">
        <div className="aprendizaje-probar-top">
          <FlaskConical size={16} />
          <strong>Probá el bot</strong>
          <span>Escribí lo que diría un cliente y mirá cómo contesta ahora, con lo que ya aprobaron. No manda nada.</span>
        </div>
        <div className="aprendizaje-probar-fila">
          <input
            value={textoPrueba}
            onChange={e => setTextoPrueba(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') probarLibre() }}
            placeholder="Ej: tienen catálogo de botines?"
            maxLength={300}
          />
          <button className="aprendizaje-btn aprendizaje-btn--ok" disabled={pruebaLibre.cargando || !textoPrueba.trim()} onClick={probarLibre}>
            {pruebaLibre.cargando ? <Loader2 size={15} className="spin" /> : <FlaskConical size={15} />} Probar
          </button>
        </div>
        {pruebaLibre.error && <p className="aprendizaje-error">{pruebaLibre.error}</p>}
        {pruebaLibre.r && <ResultadoPrueba r={pruebaLibre.r} titulo="Así contestaría el bot" />}
      </section>

      <div className="aprendizaje-tabs">
        <button className={tab === 'pendiente' ? 'on' : ''} onClick={() => setTab('pendiente')}>Para revisar</button>
        <button className={tab === 'aprobado' ? 'on' : ''} onClick={() => setTab('aprobado')}>Aprobadas</button>
        {tab === 'aprobado' && (
          <label className="aprendizaje-filtro">
            <input type="checkbox" checked={soloCambios} onChange={e => setSoloCambios(e.target.checked)} /> Solo las que corrigió Right
          </label>
        )}
      </div>

      {error && <p className="aprendizaje-error">{error}</p>}
      {loading ? (
        <p className="aprendizaje-vacio"><Loader2 size={16} className="spin" /> Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="aprendizaje-vacio">{tab === 'pendiente' ? 'No hay nada para revisar por ahora.' : 'Todavía no hay respuestas aprobadas.'}</p>
      ) : (
        <div className="aprendizaje-lista">
          {visibles.map(a => {
            const borrador = borradores[a.id] ?? []
            const hayTexto = borrador.some(m => m.trim())
            const prueba = pruebas[a.id]
            return (
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
                    <Burbujas mensajes={mensajesBotDe(a)} vacio="El bot no tenía una sugerencia para este mensaje." />
                  </div>
                  <div className="aprendizaje-bloque">
                    <label>{tab === 'pendiente' ? 'Lo que respondería Right (se puede cambiar)' : 'Respuesta aprobada'}</label>
                    <EditorMensajes valor={borrador} onChange={v => setBorradores(prev => ({ ...prev, [a.id]: v }))} />
                  </div>
                </div>

                <div className="aprendizaje-acciones">
                  <button
                    className="aprendizaje-btn aprendizaje-btn--ok"
                    disabled={ocupado === a.id || !hayTexto}
                    onClick={() => accion(a.id, () => aprobarAprendizaje(a.id, borrador))}
                  >
                    <Check size={15} /> {tab === 'pendiente' ? 'Aprobar' : 'Guardar cambios'}
                  </button>
                  <button className="aprendizaje-btn" disabled={prueba?.cargando || !hayTexto} onClick={() => probarTarjeta(a)}>
                    {prueba?.cargando ? <Loader2 size={15} className="spin" /> : <FlaskConical size={15} />} Probar
                  </button>
                  <button
                    className="aprendizaje-btn aprendizaje-btn--no"
                    disabled={ocupado === a.id}
                    onClick={() => accion(a.id, () => descartarAprendizaje(a.id))}
                  >
                    <Trash2 size={15} /> {tab === 'pendiente' ? 'Descartar' : 'Quitar'}
                  </button>
                </div>

                {prueba?.error && <p className="aprendizaje-error">{prueba.error}</p>}
                {prueba?.r && <ResultadoPrueba r={prueba.r} titulo="Así contestaría el bot si aprobás esto" />}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
