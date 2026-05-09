import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import type { TiendaNubeModelo } from '../../types'
import { Modal } from '../Modal/Modal'
import { createModelo, getUniqueCodigoBase, upsertTalle } from '../../services/modelos'
import { buildCodigoBase } from '../../utils/codigos'
import { detectColumns, groupByModelo } from '../../utils/tiendanube'
import './TiendaNubeImport.css'

interface TiendaNubeImportProps {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

type Step = 'upload' | 'preview' | 'importing' | 'done'

function parseFile(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  if (!raw.length) return { headers: [], rows: [] }
  const headers = (raw[0] as unknown[]).map(c => String(c ?? '').trim())
  const rows = (raw.slice(1) as unknown[][])
    .map(r => (r as unknown[]).map(c => String(c ?? '').trim()))
    .filter(r => r.some(c => c))
  return { headers, rows }
}

function parseCSVText(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (!lines.length) return { headers: [], rows: [] }
  const parseLine = (line: string): string[] => {
    const cols: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cols.push(cur.trim())
    return cols
  }
  const [first, ...rest] = lines
  return { headers: parseLine(first), rows: rest.map(parseLine).filter(r => r.some(c => c)) }
}

export function TiendaNubeImport({ isOpen, onClose, onImported }: TiendaNubeImportProps) {
  const [step, setStep] = useState<Step>('upload')
  const [grupos, setGrupos] = useState<TiendaNubeModelo[]>([])
  const [detectedInfo, setDetectedInfo] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState({ ok: 0, errors: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => { setStep('upload'); setGrupos([]); setDetectedInfo({}); setProgress(0) }
  const handleClose = () => { reset(); onClose() }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const isCSV = file.name.toLowerCase().endsWith('.csv')
        let headers: string[], rawRows: string[][]
        if (isCSV) {
          ;({ headers, rows: rawRows } = parseCSVText(ev.target?.result as string))
        } else {
          ;({ headers, rows: rawRows } = parseFile(ev.target?.result as ArrayBuffer))
        }
        if (!headers.length) return

        const cols = detectColumns(headers)
        const colName = (i: number) => i !== -1 ? `"${headers[i]}"` : 'No detectado'
        setDetectedInfo({
          'Nombre (marca + modelo)': colName(cols.nombre),
          'Precio de venta': colName(cols.precio),
          'Precio de costo': colName(cols.costo),
          'Stock': colName(cols.stock),
          'Categorías': colName(cols.categorias),
          'SKU → Notas': colName(cols.sku),
          'Talle': cols.talleDirecto !== -1 ? colName(cols.talleDirecto) : cols.talleVarianteNombre !== -1 ? `variantes (${colName(cols.talleVarianteNombre)})` : 'No detectado',
        })

        const grouped = groupByModelo(rawRows, cols, headers)
        setGrupos(grouped)
        setStep('preview')
      } catch (err) {
        console.error(err)
        alert('No se pudo leer el archivo. Verificá que sea un Excel o CSV de TiendaNube.')
      }
    }
    file.name.toLowerCase().endsWith('.csv') ? reader.readAsText(file, 'UTF-8') : reader.readAsArrayBuffer(file)
  }

  const validGrupos = grupos.filter(g => !g.errors.length)
  const invalidGrupos = grupos.filter(g => g.errors.length > 0)

  const handleConfirm = async () => {
    setStep('importing')
    let ok = 0, errors = 0

    for (let i = 0; i < validGrupos.length; i++) {
      const g = validGrupos[i]
      try {
        const base = buildCodigoBase(g.marca, g.modelo, g.categoria, g.gama)
        const codigoBase = await getUniqueCodigoBase(base)
        const newModelo = await createModelo({
          marca: g.marca, modelo: g.modelo, categoria: g.categoria, gama: g.gama,
          precio_costo: g.precio_costo, precio_venta: g.precio_venta,
          codigo_base: codigoBase, notas: g.notas.trim() || null,
        })
        for (const t of g.talles) {
          await upsertTalle({ modelo_id: newModelo.id, talle_us: t.talle_us, talle_arg: t.talle_arg, cantidad: t.cantidad, stock_minimo: 1 })
        }
        ok++
      } catch { errors++ }
      setProgress(Math.round(((i + 1) / validGrupos.length) * 100))
    }

    setResult({ ok, errors })
    setStep('done')
    if (ok > 0) onImported()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar desde TiendaNube" maxWidth="720px">
      <div className="tn-import">

        {step === 'upload' && (
          <div className="tn-upload">
            <div className="tn-logo-row">
              <div className="tn-logo">TN</div>
              <div>
                <p className="tn-upload-title">Exportá tu catálogo desde TiendaNube</p>
                <p className="tn-upload-desc"><strong>Productos → Exportar → Excel (.xlsx)</strong>. También acepta CSV.</p>
              </div>
            </div>
            <div className="tn-drop-zone" onClick={() => fileRef.current?.click()}>
              <span className="tn-drop-icon">📂</span>
              <p>Hacé clic para seleccionar el archivo</p>
              <small>.xlsx o .csv exportado de TiendaNube · las filas del mismo producto se agrupan automáticamente</small>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
            <div className="tn-mapping-info">
              <p className="tn-mapping-title">Campos mapeados automáticamente:</p>
              <div className="tn-mapping-grid">
                {[['Nombre', 'Marca + Modelo'], ['Categorías', 'Categoría + Gama'], ['Valor de propiedad 1', 'Talle ARG / US'], ['Precio', 'Precio de venta'], ['Costo', 'Precio de costo'], ['SKU', 'Notas']].map(([s, d]) => (
                  <div key={s} className="tn-map-item"><span className="tn-src">{s}</span><span className="tn-arrow">→</span><span className="tn-dst">{d}</span></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="tn-preview">
            <div className="tn-detected-cols">
              <p className="tn-section-label">Columnas detectadas:</p>
              <div className="tn-detected-grid">
                {Object.entries(detectedInfo).map(([label, col]) => (
                  <div key={label} className={`tn-detected-item${col === 'No detectado' ? ' missing' : ''}`}>
                    <span className="tn-det-label">{label}</span>
                    <span className="tn-det-col">{col}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="tn-preview-stats">
              <div className="tn-stat ok"><span className="tn-stat-n">{validGrupos.length}</span><span>modelos listos</span></div>
              {invalidGrupos.length > 0 && <div className="tn-stat error"><span className="tn-stat-n">{invalidGrupos.length}</span><span>con errores</span></div>}
              <div className="tn-stat" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <span className="tn-stat-n">{validGrupos.reduce((s, g) => s + g.talles.length, 0)}</span><span>talles en total</span>
              </div>
            </div>

            <div className="tn-table-wrap">
              <table className="tn-table">
                <thead>
                  <tr><th>#</th><th>Marca</th><th>Modelo</th><th>Cat/Gama</th><th>Talles</th><th>Precio</th><th>Código</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {grupos.map((g, i) => {
                    const ok = !g.errors.length
                    return (
                      <tr key={i} className={ok ? 'tr-ok' : 'tr-err'}>
                        <td>{i + 1}</td>
                        <td>{g.marca}</td>
                        <td>{g.modelo}</td>
                        <td>{g.categoria}/{g.gama}</td>
                        <td className="talles-preview">
                          {g.talles.map(t => <span key={t.talle_arg} className="talle-mini">{t.talle_arg}×{t.cantidad}</span>)}
                          {g.talles.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Sin talles</span>}
                        </td>
                        <td>{g.precio_venta ? `$${g.precio_venta.toLocaleString('es-AR')}` : '—'}</td>
                        <td className="tn-code">{g.codigo_base_preview || '—'}</td>
                        <td>{ok ? <span className="badge-ok">✓</span> : <span className="badge-err" title={g.errors.join(', ')}>✗ {g.errors.join(' · ')}</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="tn-preview-actions">
              <button className="btn btn-secondary" onClick={reset}>Volver</button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={validGrupos.length === 0}>
                Importar {validGrupos.length} modelo{validGrupos.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="tn-loading">
            <div className="tn-progress-bar"><div className="tn-progress-fill" style={{ width: `${progress}%` }} /></div>
            <p>Importando modelos... {progress}%</p>
            <small>No cerrés esta ventana</small>
          </div>
        )}

        {step === 'done' && (
          <div className="tn-done">
            <div className="tn-done-icon">✅</div>
            <p className="tn-done-title">Importación completada</p>
            <div className="tn-done-row">
              <span className="tn-ok-count">{result.ok} modelo{result.ok !== 1 ? 's' : ''} importado{result.ok !== 1 ? 's' : ''}</span>
              {result.errors > 0 && <span className="tn-err-count">{result.errors} con error</span>}
            </div>
            <p className="tn-done-note">Las fotos se agregan después editando cada modelo.</p>
            <button className="btn btn-primary" onClick={handleClose}>Cerrar</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
