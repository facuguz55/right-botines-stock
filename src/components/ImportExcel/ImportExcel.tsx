import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import type { Modelo, TiendaNubeModelo } from '../../types'
import { Modal } from '../Modal/Modal'
import { createModelo, getUniqueCodigoBase, upsertTalle, bulkDeleteModelos } from '../../services/modelos'
import { buildCodigoBase } from '../../utils/codigos'
import { detectColumns, groupByModelo } from '../../utils/tiendanube'
import './ImportExcel.css'

interface ImportExcelProps {
  isOpen: boolean
  onClose: () => void
  modelos: Modelo[]
  onDone: () => void
}

type Step = 'upload' | 'preview' | 'importing' | 'done' | 'done_sin_borrar'

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

export function ImportExcel({ isOpen, onClose, modelos, onDone }: ImportExcelProps) {
  const [step, setStep] = useState<Step>('upload')
  const [grupos, setGrupos] = useState<TiendaNubeModelo[]>([])
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [result, setResult] = useState<{ ok: number; errors: number; errorDetails: string[] }>({ ok: 0, errors: 0, errorDetails: [] })
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => { setStep('upload'); setGrupos([]); setProgress(0); setProgressLabel('') }
  const handleClose = () => { reset(); onClose() }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const { headers, rows } = parseFile(ev.target?.result as ArrayBuffer)
        if (!headers.length) return
        const cols = detectColumns(headers)
        const grouped = groupByModelo(rows, cols, headers)
        setGrupos(grouped)
        setStep('preview')
      } catch (err) {
        console.error(err)
        alert('No se pudo leer el archivo. Verificá que sea un Excel (.xlsx) de TiendaNube.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const validGrupos = grupos.filter(g => !g.errors.length)
  const invalidCount = grupos.filter(g => g.errors.length > 0).length

  // Antes esto borraba TODO el catálogo actual primero y recién después
  // cargaba el nuevo, uno por uno: si el navegador se cerraba, se cortaba
  // la conexión, o el Excel tenía tantas filas que el proceso tardaba
  // minutos y algo fallaba a mitad, el negocio se quedaba con una fracción
  // del catálogo nuevo y sin ningún respaldo del anterior — sin forma de
  // deshacer. Ahora se carga primero todo lo nuevo, y solo si el proceso
  // de carga llegó al final (con o sin errores puntuales de alguna fila,
  // que ya se toleraban antes) se borran los modelos viejos — nunca se
  // pierde el catálogo anterior mientras el nuevo todavía se está armando.
  const handleConfirm = async () => {
    setStep('importing')
    let ok = 0, errors = 0
    const errorDetails: string[] = []
    const idsViejos = modelos.map(m => m.id)

    for (let i = 0; i < validGrupos.length; i++) {
      const g = validGrupos[i]
      setProgressLabel(`Importando "${g.modelo}"...`)
      try {
        const base = buildCodigoBase(g.marca, g.modelo, g.categoria, g.gama)
        const codigoBase = await getUniqueCodigoBase(base)
        const newModelo = await createModelo({
          marca: g.marca, modelo: g.modelo, categoria: g.categoria, gama: g.gama,
          precio_costo: g.precio_costo, precio_venta: g.precio_venta, precio_promocional: null, precio_efectivo: null,
          codigo_base: codigoBase, notas: g.notas?.trim() || null,
        })
        for (const t of g.talles) {
          await upsertTalle({
            modelo_id: newModelo.id,
            talle_us: t.talle_us,
            talle_arg: t.talle_arg,
            cantidad: t.cantidad > 0 ? t.cantidad : 1,
            stock_minimo: 1,
          })
        }
        ok++
      } catch (e) {
        errors++
        errorDetails.push(`${g.marca} ${g.modelo}: ${e instanceof Error ? e.message : String(e)}`)
      }
      setProgress(Math.round(((i + 1) / validGrupos.length) * 100))
    }

    try {
      setProgressLabel('Borrando el stock anterior...')
      if (idsViejos.length > 0) await bulkDeleteModelos(idsViejos)
      setResult({ ok, errors, errorDetails })
      setStep('done')
    } catch (e) {
      // El catálogo nuevo ya quedó cargado (arriba) — si el borrado del
      // viejo falla acá, no hay que perder ese trabajo ni dejar la pantalla
      // colgada: se avisa que conviven los dos catálogos por ahora.
      setResult({
        ok, errors,
        errorDetails: [...errorDetails, `No se pudo borrar el stock anterior: ${e instanceof Error ? e.message : String(e)}`],
      })
      setStep('done_sin_borrar')
    }
    onDone()
  }

  return (
    <Modal isOpen={isOpen} onClose={step === 'importing' ? () => {} : handleClose} title="Reemplazar stock desde Excel" maxWidth="740px">
      <div className="import-excel">

        {step === 'upload' && (
          <div className="ix-upload">
            <p className="ix-desc">
              Seleccioná el Excel exportado de TiendaNube. <strong>Se va a borrar todo el stock actual</strong> y reemplazarlo con los productos del archivo.
            </p>
            <div className="ix-drop" onClick={() => fileRef.current?.click()}>
              <span className="ix-drop-icon">📂</span>
              <p>Hacé clic para seleccionar el archivo <strong>.xlsx</strong></p>
              <small>Exportación de TiendaNube · Productos → Exportar → Excel</small>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          </div>
        )}

        {step === 'preview' && (
          <div className="ix-preview">
            <div className="ix-warning">
              ⚠️ Se van a <strong>borrar los {modelos.length} modelo{modelos.length !== 1 ? 's' : ''} actuales</strong> y reemplazar con <strong>{validGrupos.length} modelos del Excel</strong>.
            </div>

            <div className="ix-stats">
              <div className="ix-stat ok">
                <span>{validGrupos.length}</span><small>listos</small>
              </div>
              {invalidCount > 0 && (
                <div className="ix-stat err">
                  <span>{invalidCount}</span><small>con errores</small>
                </div>
              )}
              <div className="ix-stat neutral">
                <span>{validGrupos.reduce((s, g) => s + g.talles.length, 0)}</span><small>talles</small>
              </div>
            </div>

            <div className="ix-table-wrap">
              <table className="ix-table">
                <thead>
                  <tr><th>#</th><th>Modelo</th><th>Cat / Gama</th><th>Talles</th><th>Precio</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {grupos.map((g, i) => (
                    <tr key={i} className={g.errors.length ? 'tr-err' : 'tr-ok'}>
                      <td>{i + 1}</td>
                      <td>{g.marca} {g.modelo}</td>
                      <td>{g.categoria} / {g.gama}</td>
                      <td className="ix-talles">
                        {g.talles.map(t => (
                          <span key={t.talle_arg} className="ix-talle-chip">{t.talle_arg}</span>
                        ))}
                        {g.talles.length === 0 && <span className="ix-no-talles">—</span>}
                      </td>
                      <td>{g.precio_venta ? `$${g.precio_venta.toLocaleString('es-AR')}` : '—'}</td>
                      <td>
                        {!g.errors.length
                          ? <span className="ix-badge-ok">✓</span>
                          : <span className="ix-badge-err" title={g.errors.join(', ')}>✗ {g.errors.join(' · ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ix-actions">
              <button className="btn btn-secondary" onClick={reset}>Volver</button>
              <button className="btn btn-danger" onClick={handleConfirm} disabled={validGrupos.length === 0}>
                Borrar todo y cargar {validGrupos.length} modelo{validGrupos.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="ix-loading">
            <div className="ix-progress-bar">
              <div className="ix-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="ix-progress-label">{progressLabel}</p>
            <small>{progress}% · No cerrés esta ventana</small>
          </div>
        )}

        {step === 'done' && (
          <div className="ix-done">
            <div className="ix-done-icon">✅</div>
            <p className="ix-done-title">Stock reemplazado</p>
            <p className="ix-done-detail">
              {result.ok} modelo{result.ok !== 1 ? 's' : ''} importado{result.ok !== 1 ? 's' : ''}
              {result.errors > 0 && <> · <span className="ix-err-inline">{result.errors} con error</span></>}.
            </p>
            {result.errorDetails.length > 0 && (
              <ul className="ix-error-list">
                {result.errorDetails.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            )}
            <button className="btn btn-primary" onClick={handleClose}>Cerrar</button>
          </div>
        )}

        {step === 'done_sin_borrar' && (
          <div className="ix-done">
            <div className="ix-done-icon">⚠️</div>
            <p className="ix-done-title">Se cargó el catálogo nuevo, pero falta borrar el anterior</p>
            <p className="ix-done-detail">
              {result.ok} modelo{result.ok !== 1 ? 's' : ''} nuevo{result.ok !== 1 ? 's' : ''} ya están cargados. El stock
              anterior <strong>no se pudo borrar</strong> — por ahora conviven los dos catálogos. Volvé a intentar el
              borrado desde Stock Avanzado, o probá importar de nuevo en un rato.
            </p>
            {result.errorDetails.length > 0 && (
              <ul className="ix-error-list">
                {result.errorDetails.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            )}
            <button className="btn btn-primary" onClick={handleClose}>Cerrar</button>
          </div>
        )}

      </div>
    </Modal>
  )
}
