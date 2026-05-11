import { useState, useMemo } from 'react'
import { FolderOpen, Folder, ChevronLeft, Search, Share2, CheckSquare, Square, X } from 'lucide-react'
import type { Modelo } from '../../types'
import './Carpetas.css'

async function compartirFotos(urls: string[], nombres: string[]) {
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
      return
    }
  } catch (err) {
    console.error(err)
  }
  urls.forEach(url => window.open(url, '_blank'))
}

interface CarpetasProps {
  modelos: Modelo[]
}

const GAMA_ORDER = ['Alta', 'Media', 'Mixto', 'Económica']
const CAT_ORDER = ['F11', 'F5', 'Futsal', 'Hockey']

export function Carpetas({ modelos }: CarpetasProps) {
  const [carpetaAbierta, setCarpetaAbierta] = useState<{ categoria: string; gama: string } | null>(null)
  const [talleAbierto, setTalleAbierto] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [compartiendo, setCompartiendo] = useState(false)

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

  async function handleCompartir() {
    if (seleccion.size === 0 || compartiendo) return
    setCompartiendo(true)
    try {
      const urls = [...seleccion]
      const nombres = urls.map(url => {
        const m = modelosEnTalle.find(mo => mo.modelo_fotos.some(f => f.foto_url === url))
        return m ? `${m.marca}-${m.modelo}` : 'botines'
      })
      await compartirFotos(urls, nombres)
    } finally {
      setCompartiendo(false)
    }
  }

  // ── Vista nivel 3: fotos del talle ──
  if (carpetaAbierta && talleAbierto !== null) {
    const todasUrls = modelosEnTalle.flatMap(m => m.modelo_fotos.map(f => f.foto_url))
    const todoSeleccionado = todasUrls.length > 0 && todasUrls.every(url => seleccion.has(url))

    return (
      <div className="carpetas-page">
        <div className="carpeta-header">
          <button
            className="btn-back"
            onClick={() => { setTalleAbierto(null); setSeleccion(new Set()); setSearch('') }}
          >
            <ChevronLeft size={16} />
            {carpetaAbierta.categoria} · {carpetaAbierta.gama}
          </button>
          <div className="carpeta-title-row">
            <FolderOpen size={20} className="folder-icon-open" />
            <h2 className="carpeta-title">Talle {talleAbierto}</h2>
          </div>
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
            <button
              className={`btn-seleccionar-todo ${todoSeleccionado ? 'activo' : ''}`}
              onClick={() => todoSeleccionado ? setSeleccion(new Set()) : seleccionarTodo()}
            >
              {todoSeleccionado ? <CheckSquare size={14} /> : <Square size={14} />}
              {todoSeleccionado ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </button>
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
              </div>
              <div className="fotos-row">
                {m.modelo_fotos.length === 0
                  ? <div className="foto-vacia"><span>⚽</span></div>
                  : m.modelo_fotos.map(f => {
                      const sel = seleccion.has(f.foto_url)
                      return (
                        <button
                          key={f.id}
                          className={`foto-seleccionable ${sel ? 'seleccionada' : ''}`}
                          onClick={() => toggleFoto(f.foto_url)}
                          title={sel ? 'Quitar selección' : 'Seleccionar'}
                        >
                          <img src={f.foto_url} alt={m.modelo} />
                          <div className="foto-check">
                            {sel ? <CheckSquare size={16} /> : <Square size={16} />}
                          </div>
                        </button>
                      )
                    })
                }
              </div>
            </div>
          ))}
        </div>

        {seleccion.size > 0 && (
          <div className="barra-compartir">
            <span className="barra-cant">
              {seleccion.size} foto{seleccion.size !== 1 ? 's' : ''} seleccionada{seleccion.size !== 1 ? 's' : ''}
            </span>
            <button className="btn-limpiar" onClick={() => setSeleccion(new Set())} title="Limpiar selección">
              <X size={14} />
            </button>
            <button className="btn-compartir" onClick={handleCompartir} disabled={compartiendo}>
              <Share2 size={16} />
              {compartiendo ? 'Cargando...' : 'Compartir'}
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
            <h2 className="carpeta-title">{carpetaAbierta.categoria} · {carpetaAbierta.gama}</h2>
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
              <span className="carpeta-cat">{c.categoria}</span>
              <span className="carpeta-gama">{c.gama}</span>
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
