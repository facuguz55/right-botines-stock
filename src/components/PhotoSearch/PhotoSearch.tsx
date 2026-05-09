import { useState, useRef } from 'react'
import type { Modelo } from '../../types'
import { Modal } from '../Modal/Modal'
import './PhotoSearch.css'

async function computeHash(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 8; canvas.height = 8
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, 8, 8)
        const { data } = ctx.getImageData(0, 0, 8, 8)
        const gray: number[] = []
        for (let i = 0; i < data.length; i += 4) gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
        const avg = gray.reduce((a, b) => a + b, 0) / gray.length
        resolve(gray.map(v => (v >= avg ? '1' : '0')).join(''))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function hammingDistance(a: string, b: string): number {
  let d = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++; return d
}

interface Result { modelo: Modelo; score: number; isExact: boolean }

interface PhotoSearchProps {
  isOpen: boolean
  onClose: () => void
  modelos: Modelo[]
  onSelectModelo: (modelo: Modelo) => void
}

export function PhotoSearch({ isOpen, onClose, modelos, onSelectModelo }: PhotoSearchProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => { setPreview(null); setResults([]); setSearched(false); setProgress(0) }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const url = URL.createObjectURL(file)
    setPreview(url); setSearching(true); setResults([]); setSearched(false); setProgress(0)
    try {
      const queryHash = await computeHash(url)
      if (!queryHash) throw new Error()
      const conFotos = modelos.filter(m => m.modelo_fotos.length > 0)
      const scored: Result[] = []
      for (let i = 0; i < conFotos.length; i++) {
        const m = conFotos[i]
        const hash = await computeHash(m.modelo_fotos[0].foto_url)
        if (hash) { const dist = hammingDistance(queryHash, hash); scored.push({ modelo: m, score: dist, isExact: dist <= 8 }) }
        setProgress(Math.round(((i + 1) / conFotos.length) * 100))
      }
      scored.sort((a, b) => a.score - b.score)
      setResults(scored.slice(0, 12))
    } catch { setResults([]) }
    finally { setSearching(false); setSearched(true) }
  }

  const exactResults = results.filter(r => r.isExact)
  const similarResults = results.filter(r => !r.isExact)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Buscar por foto" maxWidth="560px">
      <div className="photo-search">
        <div className="ps-upload-area" onClick={() => !searching && fileRef.current?.click()}>
          {preview ? <img src={preview} alt="foto subida" className="ps-preview" /> : (
            <div className="ps-placeholder"><span>🔍</span><p>Tocá para subir una foto</p><small>Compara con todas las fotos del stock</small></div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </div>

        {searching && (
          <div className="ps-progress">
            <div className="ps-progress-bar"><div className="ps-progress-fill" style={{ width: `${progress}%` }} /></div>
            <p>Analizando fotos... {progress}%</p>
          </div>
        )}

        {searched && !searching && (
          <>
            {preview && <button className="btn btn-secondary btn-sm ps-reset" onClick={reset}>Nueva búsqueda</button>}
            {results.length === 0 ? (
              <p className="ps-no-results">No se encontraron productos con foto.</p>
            ) : (
              <>
                {exactResults.length > 0 && (
                  <div className="ps-section">
                    <p className="ps-section-title">✅ Coincidencias exactas</p>
                    <div className="ps-results-grid">
                      {exactResults.map(({ modelo }) => (
                        <button key={modelo.id} className="ps-result-card" onClick={() => { onSelectModelo(modelo); onClose() }}>
                          <div className="ps-result-img">{modelo.modelo_fotos[0] ? <img src={modelo.modelo_fotos[0].foto_url} alt={modelo.modelo} /> : <span>⚽</span>}</div>
                          <div className="ps-result-info">
                            <p className="ps-result-marca">{modelo.marca}</p>
                            <p className="ps-result-modelo">{modelo.modelo}</p>
                            <p className="ps-result-talle">{modelo.categoria} · {modelo.gama}</p>
                            <p className={`ps-result-stock${modelo.modelo_talles.reduce((s, t) => s + t.cantidad, 0) === 0 ? ' zero' : ''}`}>
                              {modelo.modelo_talles.reduce((s, t) => s + t.cantidad, 0)} pares
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {exactResults.length === 0 && <p className="ps-hint">No se encontró coincidencia exacta. Mostrando los más similares:</p>}
                {similarResults.length > 0 && (
                  <div className="ps-section">
                    {exactResults.length > 0 && <p className="ps-section-title">Similares</p>}
                    <div className="ps-results-grid">
                      {similarResults.slice(0, 6).map(({ modelo }) => (
                        <button key={modelo.id} className="ps-result-card" onClick={() => { onSelectModelo(modelo); onClose() }}>
                          <div className="ps-result-img">{modelo.modelo_fotos[0] ? <img src={modelo.modelo_fotos[0].foto_url} alt={modelo.modelo} /> : <span>⚽</span>}</div>
                          <div className="ps-result-info">
                            <p className="ps-result-marca">{modelo.marca}</p>
                            <p className="ps-result-modelo">{modelo.modelo}</p>
                            <p className="ps-result-talle">{modelo.categoria}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
