import { useState, useMemo } from 'react'
import { FolderOpen, Folder, ChevronLeft, Search, Download } from 'lucide-react'
import type { Modelo } from '../../types'
import './Carpetas.css'

async function descargarFoto(url: string, nombre: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${nombre}.jpg`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank')
  }
}

interface CarpetasProps {
  modelos: Modelo[]
}

interface Carpeta {
  categoria: string
  gama: string
  modelos: Modelo[]
}

const GAMA_ORDER = ['Alta', 'Media', 'Mixto', 'Económica']
const CAT_ORDER = ['F11', 'F5', 'Futsal', 'Hockey']

export function Carpetas({ modelos }: CarpetasProps) {
  const [carpetaAbierta, setCarpetaAbierta] = useState<{ categoria: string; gama: string } | null>(null)
  const [search, setSearch] = useState('')

  const carpetas: Carpeta[] = useMemo(() => {
    const map = new Map<string, Carpeta>()
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

  const modelosEnCarpeta = useMemo(() => {
    if (!carpetaAbierta) return []
    const base = modelos.filter(
      m => m.categoria === carpetaAbierta.categoria && m.gama === carpetaAbierta.gama
    )
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter(m =>
      m.modelo.toLowerCase().includes(q) || m.marca.toLowerCase().includes(q)
    )
  }, [carpetaAbierta, modelos, search])

  if (carpetaAbierta) {
    return (
      <div className="carpetas-page">
        <div className="carpeta-header">
          <button className="btn-back" onClick={() => { setCarpetaAbierta(null); setSearch('') }}>
            <ChevronLeft size={16} />
            Carpetas
          </button>
          <div className="carpeta-title-row">
            <FolderOpen size={20} className="folder-icon-open" />
            <h2 className="carpeta-title">{carpetaAbierta.categoria} · {carpetaAbierta.gama}</h2>
          </div>
          <div className="carpeta-search-wrap">
            <Search size={14} />
            <input
              type="text"
              placeholder="Buscar modelo o marca..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="carpeta-search"
              autoFocus
            />
          </div>
        </div>

        <div className="modelos-grid">
          {modelosEnCarpeta.length === 0 && (
            <p className="lista-empty">No hay modelos que coincidan.</p>
          )}
          {modelosEnCarpeta.map(m => {
            const foto = m.modelo_fotos[0]?.foto_url ?? null
            return (
              <div key={m.id} className="modelo-card">
                <div className="modelo-card-foto">
                  {foto ? (
                    <>
                      <img src={foto} alt={m.modelo} />
                      <button
                        className="btn-descargar"
                        title="Descargar foto"
                        onClick={() => descargarFoto(foto, `${m.marca}-${m.modelo}`)}
                      >
                        <Download size={14} />
                        <span>Descargar</span>
                      </button>
                    </>
                  ) : (
                    <span className="foto-placeholder">⚽</span>
                  )}
                </div>
                <div className="modelo-card-info">
                  <span className="row-marca">{m.marca}</span>
                  <span className="row-nombre">{m.modelo}</span>
                  <div className="row-talles">
                    {m.modelo_talles.length === 0
                      ? <span className="sin-talles">Sin talles</span>
                      : m.modelo_talles.map(t => (
                          <span key={t.id} className="talle-pill">
                            <span className="talle-arg">{t.talle_arg}</span>
                            <span className="talle-us">{t.talle_us} US</span>
                          </span>
                        ))
                    }
                  </div>
                  <span className="row-precio">${m.precio_venta.toLocaleString('es-AR')}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

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
