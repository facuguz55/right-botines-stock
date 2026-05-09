// @ts-nocheck
import { useState, useRef } from 'react'
import type { ImportRow } from '../../types'
import { Modal } from '../Modal/Modal'
import { buildCodigoRef } from '../../utils/codigos'
import { createProducto, getUniqueCodigoRef } from '../../services/productos'
import './ExcelImport.css'

interface ExcelImportProps {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

const CATEGORIAS = ['F5', 'F11', 'Futsal', 'Hockey']
const GAMAS = ['Económica', 'Media', 'Alta']
const MARCAS = ['Nike', 'Adidas', 'Puma', 'New Balance', 'Mizuno', 'Umbro', 'Under Armour', 'Joma', 'Otra']

const TEMPLATE_HEADERS = [
  'marca', 'modelo', 'categoria', 'gama', 'talle_us', 'talle_arg',
  'cantidad', 'stock_minimo', 'precio_costo', 'precio_venta', 'notas',
]

const TEMPLATE_EXAMPLE = [
  'Adidas', 'Predator Elite', 'F11', 'Alta', '10', '43', '2', '1', '25000', '45000', 'Incluye caja',
  'Nike', 'Mercurial Vapor', 'F5', 'Media', '9', '42', '1', '1', '18000', '32000', '',
]

function downloadTemplate() {
  const header = TEMPLATE_HEADERS.join(',')
  const ex1 = TEMPLATE_EXAMPLE.slice(0, 11).map(v => v.includes(',') ? `"${v}"` : v).join(',')
  const ex2 = TEMPLATE_EXAMPLE.slice(11).map(v => v.includes(',') ? `"${v}"` : v).join(',')
  const content = [header, ex1, ex2].join('\r\n')
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'plantilla-right-botines.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const cols: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        cols.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    cols.push(cur.trim())
    rows.push(cols)
  }
  return rows
}

function validateRow(row: ImportRow): string[] {
  const errors: string[] = []
  if (!row.marca.trim()) errors.push('marca requerida')
  else if (!MARCAS.includes(row.marca.trim()) && row.marca.trim() !== 'Otra') {
    // Allow any marca, just warn if unknown
  }
  if (!row.modelo.trim()) errors.push('modelo requerido')
  if (!CATEGORIAS.includes(row.categoria)) errors.push(`categoría inválida (${CATEGORIAS.join('/')})`)
  if (!GAMAS.includes(row.gama)) errors.push(`gama inválida (${GAMAS.join('/')})`)
  if (!row.talle_us || isNaN(parseFloat(row.talle_us))) errors.push('talle_us inválido')
  if (row.precio_venta === '' || isNaN(parseFloat(row.precio_venta)) || parseFloat(row.precio_venta) <= 0)
    errors.push('precio_venta requerido')
  return errors
}

export function ExcelImport({ isOpen, onClose, onImported }: ExcelImportProps) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [progress, setProgress] = useState(0)
  const [importResult, setImportResult] = useState({ ok: 0, errors: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setRows([]); setStep('upload'); setProgress(0); setImportResult({ ok: 0, errors: 0 })
  }

  const handleClose = () => { reset(); onClose() }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const all = parseCSV(text)
      if (all.length < 2) return

      // Detect if first row is header
      const firstRow = all[0].map(h => h.toLowerCase().replace(/\s/g, '_'))
      const isHeader = firstRow.includes('marca') || firstRow.includes('modelo')
      const dataRows = isHeader ? all.slice(1) : all

      const parsed: ImportRow[] = dataRows
        .filter(r => r.some(c => c.trim()))
        .map(r => {
          const row: ImportRow = {
            marca: r[0] ?? '',
            modelo: r[1] ?? '',
            categoria: r[2] ?? 'F11',
            gama: r[3] ?? 'Media',
            talle_us: r[4] ?? '',
            talle_arg: r[5] ?? r[4] ?? '',
            cantidad: r[6] ?? '0',
            stock_minimo: r[7] ?? '1',
            precio_costo: r[8] ?? '0',
            precio_venta: r[9] ?? '',
            notas: r[10] ?? '',
          }
          row.errors = validateRow(row)
          row.codigo_ref_preview = row.errors!.length === 0
            ? buildCodigoRef(row.marca, row.modelo, row.talle_arg || row.talle_us, row.categoria, row.gama)
            : ''
          return row
        })

      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  const validRows = rows.filter(r => !r.errors?.length)
  const invalidRows = rows.filter(r => r.errors?.length)

  const handleConfirm = async () => {
    setStep('importing')
    let ok = 0, errors = 0

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      try {
        const base = buildCodigoRef(row.marca, row.modelo, row.talle_arg || row.talle_us, row.categoria, row.gama)
        const codigoRef = await getUniqueCodigoRef(base)
        await createProducto({
          marca: row.marca.trim(),
          modelo: row.modelo.trim(),
          categoria: row.categoria,
          gama: row.gama,
          talle_us: parseFloat(row.talle_us),
          talle_arg: parseFloat(row.talle_arg) || parseFloat(row.talle_us),
          cantidad: parseInt(row.cantidad) || 0,
          stock_minimo: parseInt(row.stock_minimo) || 1,
          precio_costo: parseFloat(row.precio_costo) || 0,
          precio_venta: parseFloat(row.precio_venta),
          codigo_ref: codigoRef,
          notas: row.notas.trim() || null,
        })
        ok++
      } catch {
        errors++
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100))
    }

    setImportResult({ ok, errors })
    setStep('done')
    if (ok > 0) onImported()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar productos desde CSV" maxWidth="700px">
      <div className="excel-import">

        {step === 'upload' && (
          <div className="ei-upload-step">
            <p className="ei-desc">
              Descargá la plantilla, completá los datos en Excel y subí el archivo CSV.
              Los códigos de referencia se generan automáticamente.
            </p>

            <div className="ei-actions-row">
              <button className="btn btn-secondary" onClick={downloadTemplate}>
                ⬇ Descargar plantilla CSV
              </button>
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                ↑ Subir CSV completado
              </button>
            </div>

            <div className="ei-columns-info">
              <p className="ei-columns-title">Columnas de la plantilla:</p>
              <div className="ei-columns-list">
                {TEMPLATE_HEADERS.map(h => (
                  <span key={h} className="ei-col-badge">{h}</span>
                ))}
              </div>
              <p className="ei-note">
                Valores válidos — <strong>categoria:</strong> {CATEGORIAS.join(' / ')} · <strong>gama:</strong> {GAMAS.join(' / ')}
              </p>
            </div>

            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
          </div>
        )}

        {step === 'preview' && (
          <div className="ei-preview-step">
            <div className="ei-preview-summary">
              <div className="ei-stat ei-stat--ok">
                <span className="ei-stat-num">{validRows.length}</span>
                <span>filas válidas</span>
              </div>
              {invalidRows.length > 0 && (
                <div className="ei-stat ei-stat--error">
                  <span className="ei-stat-num">{invalidRows.length}</span>
                  <span>con errores (no se importan)</span>
                </div>
              )}
            </div>

            <div className="ei-table-wrap">
              <table className="ei-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Cat./Gama</th>
                    <th>Talle</th>
                    <th>Cant.</th>
                    <th>Precio venta</th>
                    <th>Código (preview)</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isValid = !row.errors?.length
                    return (
                      <tr key={i} className={isValid ? 'row-ok' : 'row-error'}>
                        <td>{i + 1}</td>
                        <td>{row.marca}</td>
                        <td>{row.modelo}</td>
                        <td>{row.categoria} / {row.gama}</td>
                        <td>{row.talle_us}us</td>
                        <td>{row.cantidad}</td>
                        <td>${row.precio_venta}</td>
                        <td className="ei-code">{row.codigo_ref_preview || '—'}</td>
                        <td>
                          {isValid ? (
                            <span className="ei-badge-ok">✓ Ok</span>
                          ) : (
                            <span className="ei-badge-error" title={row.errors?.join(', ')}>
                              ✗ {row.errors?.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="ei-preview-actions">
              <button className="btn btn-secondary" onClick={reset}>Volver</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={validRows.length === 0}
              >
                Importar {validRows.length} producto{validRows.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="ei-importing">
            <div className="ei-progress-bar">
              <div className="ei-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p>Importando... {progress}%</p>
          </div>
        )}

        {step === 'done' && (
          <div className="ei-done">
            <div className="ei-done-icon">✅</div>
            <p className="ei-done-title">Importación completada</p>
            <div className="ei-done-stats">
              <span className="ei-stat-ok">{importResult.ok} producto{importResult.ok !== 1 ? 's' : ''} importado{importResult.ok !== 1 ? 's' : ''}</span>
              {importResult.errors > 0 && (
                <span className="ei-stat-err">{importResult.errors} con error</span>
              )}
            </div>
            <p className="ei-done-note">Las fotos se agregan después desde cada ficha de producto.</p>
            <button className="btn btn-primary" onClick={handleClose}>Cerrar</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
