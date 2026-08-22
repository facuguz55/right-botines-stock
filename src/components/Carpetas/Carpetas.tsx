import { useState, useMemo, type MouseEvent } from 'react'
import { FolderOpen, Folder, ChevronLeft, Search, Share2, CheckSquare, Square, X } from 'lucide-react'
import type { Modelo } from '../../types'
import './Carpetas.css'

// Descarga directa (sin abrir pestañas, que en mobile suelen bloquearse
// después de la primera): crea un <a download> temporal por foto.
function descargarFotos(urls: string[], nombres: string[]) {
  urls.forEach((url, i) => {
    const a = document.createElement('a')
    a.href = url
    a.download = nombres[i] || 'botin'
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  })
}

async function compartirFotos(urls: string[], nombres: string[]): Promise<'shared' | 'downloaded' | 'error'> {
  try {
    const files = await Promise.all(
      urls.map(async (url, i) => {
        const res = await fetch(url)
        const blob = await res.blob()
        const ext = blob.type.includes('png') ? 'png' : 'jpg'
        return new File([blob], `${nombres[i]}.${ext}`, { type: blob.type })
      })
    )
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files })
      return 'shared'
    }
    // Sin soporte para compartir archivos: si el navegador al menos sabe
    // compartir un link, lo usamos para el caso de una sola foto.
    if (urls.length === 1 && navigator.share) {
      await navigator.share({ url: urls[0] })
      return 'shared'
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'error' // el usuario canceló el share nativo
    console.error(err)
  }
  descargarFotos(urls, nombres)
  return 'downloaded'
}

interface CarpetasProps {
  modelos: Modelo[]
}

const GAMA_ORDER = ['Alta', 'Media', 'Mixto', 'Económica']
const CAT_ORDER  = ['F11', 'F5', 'Futsal', 'Hockey']

// Labels de display legibles para el usuario
const CAT_LABELS: Record<string, string> = {
  F11:    'Fútbol 11',
  F5:     'Fútbol 5',
  Futsal: 'Futsal',
  Hockey: 'Hockey',
}
const GAMA_LABELS: Record<string, string> = {
  Alta:      'Gama Alta',
  Media:     'Gama Media',
  Mixto:     'Mixto',
  Económica: 'Gama Económica',
}
const catLabel  = (c: string) => CAT_LABELS[c]  ?? c
const gamaLabel = (g: string) => GAMA_LABELS[g] ?? g

export function Carpetas({ modelos }: CarpetasProps) {
  const [carpetaAbierta, setCarpetaAbierta] = useState<{ categoria: string; gama: string } | null>(null)
  const [talleAbierto, setTalleAbierto] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  // Distingue qué acción de compartir está en curso (la de la barra de
  // selección, la de un modelo entero, o la de una foto puntual) para poder
  // deshabilitar solo ese botón y no todos a la vez.
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Nivel 1: carpetas
  const carpetas = useMemo(() => {
    const map = new Map<string, { categoria: string; gama: string; modelos: Modelo[] }>()
    for (const m of modelos) {
      const key = `${m.categoria}||${m.gama}`
      if (!map.has(key)) map.set(key, { categoria: m.categoria, gama: m.gama, modelos: [] })
      map.get(key)!.modelos.push(m)
    }
    return [...map.values()].sort((a, b) => {
      const catA = CAT_ORDER.indexOf(a.categoria)
      const catB = CAT_ORDER.indexOf(b.categoria)
      if (catA !== catB) return (catA === -1 ? 99 : catA) - (catB === -1 ? 99 : catB)
      const gamaA = GAMA_ORDER.indexOf(a.gama)
      const gamaB = GAMA_ORDER.indexOf(b.gama)
      return (gamaA === -1 ? 99 : gamaA) - (gamaB === -1 ? 99 : gamaB)
    })
  }, [modelos])

  // Modelos de la carpeta abierta
  const modelosCarpeta = useMemo(() => {
    if (!carpetaAbierta) return []
    return modelos.filter(m => m.categoria === carpetaAbierta.categoria && m.gama === carpetaAbierta.gama)
  }, [carpetaAbierta, modelos])

  // Nivel 2: talles disponibles dentro de la carpeta
  const tallesDisponibles = useMemo(() => {
    const map = new Map<number, number>()
    for (const m of modelosCarpeta) {
      for (const t of m.modelo_talles) {
        if (t.cantidad > 0) map.set(t.talle_arg, (map.get(t.talle_arg) ?? 0) + t.cantidad)
      }
    }
    return [...map.entries()]
      .map(([talle, pares]) => ({ talle, pares }))
      .sort((a, b) => a.talle - b.talle)
  }, [modelosCarpeta])

  // Nivel 3: modelos del talle abierto
  const modelosEnTalle = useMemo(() => {
    if (talleAbierto === null) return []
    const base = modelosCarpeta.filter(m =>
      m.modelo_talles.some(t => t.talle_arg === talleAbierto && t.cantidad > 0)
    )
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter(m => m.modelo.toLowerCase().includes(q) || m.marca.toLowerCase().includes(q))
  }, [talleAbierto, modelosCarpeta, search])

  function toggleFoto(url: string) {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function seleccionarTodo() {
    const todas = modelosEnTalle.flatMap(m => m.modelo_fotos.map(f => f.foto_url))
    setSeleccion(new Set(todas))
  }

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(t => t === msg ? null : t), 2500)
  }

  async function ejecutarCompartir(urls: string[], nombres: string[], key: string) {
    if (urls.length === 0 || accionEnCurso) return
    setAccionEnCurso(key)
    try {
      const resultado = await compartirFotos(urls, nombres)
      if (resultado === 'downloaded') {
        mostrarToast(urls.length === 1 ? 'Foto descargada' : `${urls.length} fotos descargadas`)
      }
    } finally {
      setAccionEnCurso(null)
    }
  }

  function handleCompartir() {
    const urls = [...seleccion]
    const nombres = urls.map(url => {
      const m = modelosEnTalle.find(mo => mo.modelo_fotos.some(f => f.foto_url === url))
      return m ? `${m.marca}-${m.modelo}` : 'botines'
    })
    return ejecutarCompartir(urls, nombres, 'seleccion')
  }

  function handleCompartirModelo(m: Modelo, e: MouseEvent) {
    e.stopPropagation()
    const urls = m.modelo_fotos.map(f => f.foto_url)
    const nombres = urls.map((_, i) => `${m.marca}-${m.modelo}-${i + 1}`)
    return ejecutarCompartir(urls, nombres, `modelo-${m.id}`)
  }

  function handleCompartirFoto(url: string, m: Modelo, e: MouseEvent) {
    e.stopPropagation()
    return ejecutarCompartir([url], [`${m.marca}-${m.modelo}`], `foto-${url}`)
  }

  // ── Vista nivel 3: fotos del talle ──
  if (carpetaAbierta && talleAbierto !== null) {
    const todasUrls = modelosEnTalle.flatMap(m => m.modelo_fotos.map(f => f.foto_url))
    const seleccionadasEnTalle = todasUrls.filter(url => seleccion.has(url)).length
    const todoSeleccionado = todasUrls.length > 0 && seleccionadasEnTalle === todasUrls.length

    let labelSeleccionarTodo = 'Seleccionar todo'
    if (todoSeleccionado) labelSeleccionarTodo = 'Deseleccionar todo'
    else if (seleccionadasEnTalle > 0) labelSeleccionarTodo = `Seleccionar todo (${seleccionadasEnTalle}/${todasUrls.length})`

    return (
      <div className="carpetas-page">
        <div className="carpeta-header">
          <button
            className="btn-back"
            onClick={() => { setTalleAbierto(null); setSeleccion(new Set()); setSearch('') }}
          >
            <ChevronLeft size={16} />
            {catLabel(carpetaAbierta.categoria)} · {gamaLabel(carpetaAbierta.gama)}
          </button>
          <div className="carpeta-title-row">
            <FolderOpen size={20} className="folder-icon-open" />
            <h2 className="carpeta-title">Talle {talleAbierto}</h2>
          </div>

          <button
            className={`btn-seleccionar-todo ${todoSeleccionado ? 'activo' : ''}`}
            onClick={() => todoSeleccionado ? setSeleccion(new Set()) : seleccionarTodo()}
          >
            {todoSeleccionado ? <CheckSquare size={18} /> : <Square size={18} />}
            {labelSeleccionarTodo}
          </button>
          {seleccion.size === 0 && (
            <p className="carpeta-sub-hint carpeta-select-hint">
              Tocá las fotos que quieras (de uno o varios modelos) para mandarlas juntas
            </p>
          )}

          <div className="carpeta-actions-row">
            <div className="carpeta-search-wrap">
              <Search size={14} />
              <input
                type="text"
                placeholder="Buscar modelo o marca..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="carpeta-search"
              />
            </div>
          </div>
        </div>

        <div className="fotos-grid">
          {modelosEnTalle.length === 0 && (
            <p className="lista-empty">No hay modelos que coincidan.</p>
          )}
          {modelosEnTalle.map(m => (
            <div key={m.id} className="modelo-fotos-grupo">
              <div className="modelo-fotos-label">
                <span className="mfl-marca">{m.marca}</span>
                <span className="mfl-nombre">{m.modelo}</span>
                {m.modelo_fotos.length > 0 && (
                  <button
                    className="btn-compartir-modelo"
                    onClick={e => handleCompartirModelo(m, e)}
                    disabled={accionEnCurso === `modelo-${m.id}`}
                    title="Compartir todas las fotos de este modelo"
                  >
                    <Share2 size={12} />
                    {accionEnCurso === `modelo-${m.id}` ? '...' : 'Compartir'}
                  </button>
                )}
              </div>
              <div className="fotos-row">
                {m.modelo_fotos.length === 0
                  ? <div className="foto-vacia"><span>⚽</span></div>
                  : m.modelo_fotos.map(f => {
                      const sel = seleccion.has(f.foto_url)
                      return (
                        <div
                          key={f.id}
                          className={`foto-seleccionable ${sel ? 'seleccionada' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleFoto(f.foto_url)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFoto(f.foto_url) } }}
                          title={sel ? 'Quitar selección' : 'Seleccionar'}
                        >
                          <img src={f.foto_url} alt={m.modelo} />
                          <div className="foto-check">
                            {sel ? <CheckSquare size={16} /> : <Square size={16} />}
                          </div>
                          <button
                            type="button"
                            className="foto-share-rapido"
                            aria-label="Compartir esta foto"
                            title="Compartir esta foto"
                            onClick={e => handleCompartirFoto(f.foto_url, m, e)}
                          >
                            <Share2 size={14} />
                          </button>
                        </div>
                      )
                    })
                }
              </div>
            </div>
          ))}
        </div>

        {toast && <div className="carpetas-toast">{toast}</div>}

        {seleccion.size > 0 && (
          <div className="barra-compartir">
            <span className="barra-cant">
              {seleccion.size} foto{seleccion.size !== 1 ? 's' : ''} seleccionada{seleccion.size !== 1 ? 's' : ''}
            </span>
            <button className="btn-limpiar" onClick={() => setSeleccion(new Set())} title="Limpiar selección">
              <X size={14} />
            </button>
            <button className="btn-compartir" onClick={handleCompartir} disabled={accionEnCurso === 'seleccion'}>
              <Share2 size={16} />
              {accionEnCurso === 'seleccion' ? 'Cargando...' : 'Compartir'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Vista nivel 2: talles de la carpeta ──
  if (carpetaAbierta) {
    return (
      <div className="carpetas-page">
        <div className="carpeta-header">
          <button className="btn-back" onClick={() => setCarpetaAbierta(null)}>
            <ChevronLeft size={16} />
            Carpetas
          </button>
          <div className="carpeta-title-row">
            <FolderOpen size={20} className="folder-icon-open" />
            <h2 className="carpeta-title">{catLabel(carpetaAbierta.categoria)} · {gamaLabel(carpetaAbierta.gama)}</h2>
          </div>
          <p className="carpeta-sub-hint">Elegí un talle para ver los modelos disponibles</p>
        </div>

        <div className="talles-grid">
          {tallesDisponibles.length === 0 && (
            <p className="lista-empty">No hay talles con stock disponible.</p>
          )}
          {tallesDisponibles.map(({ talle, pares }) => (
            <button
              key={talle}
              className="talle-card"
              onClick={() => { setTalleAbierto(talle); setSeleccion(new Set()) }}
            >
              <span className="talle-card-num">{talle}</span>
              <span className="talle-card-label">ARG</span>
              <span className="talle-card-pares">{pares} par{pares !== 1 ? 'es' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Vista nivel 1: carpetas ──
  return (
    <div className="carpetas-page">
      <div className="carpetas-top">
        <h1 className="carpetas-heading">Carpetas</h1>
        <p className="carpetas-sub">Organizadas por categoría y gama</p>
      </div>
      <div className="carpetas-grid">
        {carpetas.map(c => (
          <button
            key={`${c.categoria}-${c.gama}`}
            className="carpeta-card"
            onClick={() => setCarpetaAbierta({ categoria: c.categoria, gama: c.gama })}
          >
            <Folder size={32} className="folder-icon" />
            <div className="carpeta-card-info">
              <span className="carpeta-cat">{catLabel(c.categoria)}</span>
              <span className="carpeta-gama">{gamaLabel(c.gama)}</span>
            </div>
            <span className="carpeta-cant">{c.modelos.length} modelo{c.modelos.length !== 1 ? 's' : ''}</span>
          </button>
        ))}
        {carpetas.length === 0 && (
          <p className="carpetas-empty">No hay productos cargados aún.</p>
        )}
      </div>
    </div>
  )
}
