import { useRef, useState } from 'react'
import { Upload, CheckCircle, XCircle, Loader } from 'lucide-react'
import { Modal } from '../Modal/Modal'
import { supabase } from '../../lib/supabase'
import { uploadFoto } from '../../services/storage'
import type { Modelo } from '../../types'
import './ImportFotos.css'

interface ImportFotosProps {
  isOpen: boolean
  onClose: () => void
  modelos: Modelo[]
  onDone: () => void
}

type ResultItem = {
  archivo: string
  modelo: string
  status: 'ok' | 'error' | 'no_match'
  msg?: string
}

export function ImportFotos({ isOpen, onClose, modelos, onDone }: ImportFotosProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ResultItem[]>([])
  const [done, setDone] = useState(false)

  const normalize = (s: string) =>
    s.toLowerCase().replace(/\.(png|jpg|jpeg|webp)$/i, '').trim()

  const handleFiles = async (files: FileList) => {
    setRunning(true)
    setDone(false)
    setResults([])
    const items: ResultItem[] = []

    for (const file of Array.from(files)) {
      const nombreArchivo = normalize(file.name)
      const match = modelos.find(m =>
        normalize(m.modelo) === nombreArchivo ||
        normalize(m.marca + ' ' + m.modelo) === nombreArchivo
      )

      if (!match) {
        items.push({ archivo: file.name, modelo: '-', status: 'no_match', msg: 'Sin modelo coincidente' })
        setResults([...items])
        continue
      }

      try {
        const url = await uploadFoto(file, match.codigo_base)
        const nextOrden = (match.modelo_fotos?.length ?? 0)
        const { error } = await supabase.from('modelo_fotos').insert({
          modelo_id: match.id,
          foto_url: url,
          orden: nextOrden,
        })
        if (error) throw error
        items.push({ archivo: file.name, modelo: match.modelo, status: 'ok' })
      } catch (e) {
        items.push({ archivo: file.name, modelo: match.modelo, status: 'error', msg: (e as Error).message })
      }

      setResults([...items])
    }

    setRunning(false)
    setDone(true)
    onDone()
  }

  const okCount = results.filter(r => r.status === 'ok').length
  const errCount = results.filter(r => r.status === 'error').length
  const noMatchCount = results.filter(r => r.status === 'no_match').length

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!running) { setResults([]); setDone(false); onClose() } }} title="Importar fotos por nombre">
      <div className="import-fotos">
        {!running && !done && (
          <div className="import-fotos-intro">
            <p>Seleccioná las fotos. El nombre de cada archivo tiene que coincidir exactamente con el nombre del modelo en el stock.</p>
            <p className="import-fotos-example">Ejemplo: <code>Nike Air Zoom Dorado Mixto.png</code></p>
            <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
              <Upload size={15} /> Elegir fotos
            </button>
            <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => e.target.files && handleFiles(e.target.files)} />
          </div>
        )}

        {running && (
          <div className="import-fotos-running">
            <Loader size={20} className="spin" />
            <p>Subiendo fotos... {results.length} procesadas</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="import-fotos-results">
            {done && (
              <div className="import-fotos-summary">
                <span className="ok">✅ {okCount} subidas</span>
                {errCount > 0 && <span className="err">❌ {errCount} errores</span>}
                {noMatchCount > 0 && <span className="warn">⚠️ {noMatchCount} sin coincidencia</span>}
              </div>
            )}
            <div className="import-fotos-list">
              {results.map((r, i) => (
                <div key={i} className={`import-fotos-item ${r.status}`}>
                  <span className="import-fotos-icon">
                    {r.status === 'ok' && <CheckCircle size={14} />}
                    {(r.status === 'error' || r.status === 'no_match') && <XCircle size={14} />}
                  </span>
                  <span className="import-fotos-name">{r.archivo}</span>
                  {r.msg && <span className="import-fotos-msg">{r.msg}</span>}
                </div>
              ))}
            </div>
            {done && (
              <div className="import-fotos-actions">
                <button className="btn btn-secondary" onClick={() => { setResults([]); setDone(false) }}>Importar más</button>
                <button className="btn btn-primary" onClick={() => { setResults([]); setDone(false); onClose() }}>Cerrar</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
