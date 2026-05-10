import { useState, useRef, useEffect } from 'react'
import type { Modelo, PhotoSlot, TalleRow } from '../../types'
import { Modal } from '../Modal/Modal'
import { buildCodigoBase } from '../../utils/codigos'
import './ModelForm.css'

interface ModelFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    data: Omit<Modelo, 'id' | 'created_at' | 'modelo_talles' | 'modelo_fotos'>,
    photos: PhotoSlot[],
    toDeleteFotoIds: string[],
    talleRows: TalleRow[]
  ) => Promise<void>
  initial?: Modelo | null
}

const MARCAS = ['Nike', 'Adidas', 'Puma', 'New Balance', 'Mizuno', 'Umbro', 'Under Armour', 'Joma', 'Otra']
const CATEGORIAS = ['F5', 'F11', 'Futsal', 'Hockey']
const GAMAS = ['Económica', 'Mixto', 'Media', 'Alta']
const ARG_TO_US: Record<number, number> = {
  34: 5, 35: 5.5, 36: 6, 37: 7, 38: 7.5,
  39: 8, 40: 9, 41: 9.5, 42: 10, 43: 11, 44: 11.5,
}

const EMPTY_TALLE: TalleRow = { talle_us: '', talle_arg: '', cantidad: '1', stock_minimo: '1', toDelete: false }

export function ModelForm({ isOpen, onClose, onSave, initial }: ModelFormProps) {
  const isEdit = !!initial

  const [form, setForm] = useState({
    marca: 'Nike', modelo: '', categoria: 'F11', gama: 'Media',
    precio_costo: '', precio_venta: '', notas: '',
  })
  const [talleRows, setTalleRows] = useState<TalleRow[]>([])
  const [newTalle, setNewTalle] = useState<TalleRow>(EMPTY_TALLE)
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [toDeleteFotoIds, setToDeleteFotoIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    if (initial) {
      setForm({
        marca: initial.marca, modelo: initial.modelo,
        categoria: initial.categoria, gama: initial.gama,
        precio_costo: String(initial.precio_costo),
        precio_venta: String(initial.precio_venta),
        notas: initial.notas ?? '',
      })
      setTalleRows(initial.modelo_talles.map(t => ({
        id: t.id,
        talle_us: String(t.talle_us),
        talle_arg: String(t.talle_arg),
        cantidad: String(t.cantidad),
        stock_minimo: String(t.stock_minimo),
        toDelete: false,
      })))
      setPhotos(initial.modelo_fotos.map(f => ({ id: f.id, url: f.foto_url, orden: f.orden })))
    } else {
      setForm({ marca: 'Nike', modelo: '', categoria: 'F11', gama: 'Media', precio_costo: '', precio_venta: '', notas: '' })
      setTalleRows([])
      setPhotos([])
    }
    setNewTalle(EMPTY_TALLE)
    setToDeleteFotoIds([])
    setError(null)
  }, [isOpen, initial])

  const update = (key: string, value: string) => setForm(f => {
    const next = { ...f, [key]: value }
    if (key === 'modelo' && value.toLowerCase().includes('mixto')) {
      next.gama = 'Mixto'
    }
    return next
  })

  const previewCodigo = buildCodigoBase(form.marca, form.modelo, form.categoria, form.gama)

  const addTalle = () => {
    if (!newTalle.talle_arg) return
    setTalleRows(prev => [...prev, { ...newTalle, toDelete: false }])
    setNewTalle(EMPTY_TALLE)
  }

  const removeTalle = (idx: number) => {
    const row = talleRows[idx]
    if (row.id) {
      setTalleRows(prev => prev.map((r, i) => i === idx ? { ...r, toDelete: true } : r))
    } else {
      setTalleRows(prev => prev.filter((_, i) => i !== idx))
    }
  }

  const updateTalleRow = (idx: number, key: keyof TalleRow, value: string) => {
    setTalleRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r))
  }

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setPhotos(prev => [...prev, ...files.map((file, i) => ({
      url: URL.createObjectURL(file), file, orden: prev.length + i,
    }))])
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    const slot = photos[index]
    if (slot.id) setToDeleteFotoIds(prev => [...prev, slot.id!])
    setPhotos(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, orden: i })))
  }

  const activeTalles = talleRows.filter(r => !r.toDelete)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.modelo.trim()) return setError('El modelo es obligatorio')
    if (!form.precio_venta) return setError('El precio de venta es obligatorio')
    if (!isEdit && photos.length === 0) return setError('Necesitás subir al menos 1 foto')
    if (!isEdit && activeTalles.length === 0) return setError('Agregá al menos 1 talle')

    setSaving(true)
    try {
      await onSave(
        {
          marca: form.marca, modelo: form.modelo.trim(),
          categoria: form.categoria, gama: form.gama,
          precio_costo: parseFloat(form.precio_costo) || 0,
          precio_venta: parseFloat(form.precio_venta),
          codigo_base: isEdit ? initial!.codigo_base : previewCodigo,
          notas: form.notas.trim() || null,
        },
        photos, toDeleteFotoIds, talleRows
      )
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Editar modelo' : 'Agregar modelo'} maxWidth="640px">
      <form className="model-form" onSubmit={handleSubmit}>

        {/* Fotos */}
        <div className="form-section">
          <label className="section-label">Fotos {!isEdit && <span className="required">* mínimo 1</span>}</label>
          <div className="photos-grid">
            {photos.map((slot, i) => (
              <div key={i} className="photo-slot">
                <img src={slot.url} alt="" />
                {i === 0 && <span className="photo-main-badge">Principal</span>}
                <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="photo-add-slot" onClick={() => fileRef.current?.click()}>
              <span>+</span><small>Foto</small>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFilesChange} style={{ display: 'none' }} />
        </div>

        {/* Marca y Modelo */}
        <div className="form-row">
          <div className="form-group">
            <label>Marca *</label>
            <select value={form.marca} onChange={e => update('marca', e.target.value)}>
              {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Modelo *</label>
            <input type="text" placeholder="Ej: Predator Elite" value={form.modelo} onChange={e => update('modelo', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Categoría</label>
            <select value={form.categoria} onChange={e => update('categoria', e.target.value)}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Gama</label>
            <select value={form.gama} onChange={e => update('gama', e.target.value)}>
              {GAMAS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Precio de costo (ARS)</label>
            <input type="number" min="0" step="0.01" placeholder="0" value={form.precio_costo} onChange={e => update('precio_costo', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Precio de venta (ARS) *</label>
            <input type="number" min="0" step="0.01" placeholder="0" value={form.precio_venta} onChange={e => update('precio_venta', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Notas internas</label>
          <textarea placeholder="Aclaraciones..." value={form.notas} onChange={e => update('notas', e.target.value)} rows={2} />
        </div>

        {/* Talles */}
        <div className="form-section">
          <label className="section-label">
            Talles {!isEdit && <span className="required">* mínimo 1</span>}
          </label>

          {activeTalles.length > 0 && (
            <div className="talles-table">
              <div className="talles-header">
                <span>Talle ARG</span>
                <span>Talle US</span>
                <span>Cant.</span>
                <span>Stock mín.</span>
                <span></span>
              </div>
              {talleRows.map((row, idx) =>
                row.toDelete ? null : (
                  <div key={idx} className="talles-row">
                    <input type="number" step="0.5" value={row.talle_arg} onChange={e => updateTalleRow(idx, 'talle_arg', e.target.value)} placeholder="42" />
                    <input type="number" step="0.5" value={row.talle_us} onChange={e => updateTalleRow(idx, 'talle_us', e.target.value)} placeholder="9" />
                    <input type="number" min="0" value={row.cantidad} onChange={e => updateTalleRow(idx, 'cantidad', e.target.value)} />
                    <input type="number" min="0" value={row.stock_minimo} onChange={e => updateTalleRow(idx, 'stock_minimo', e.target.value)} />
                    <button type="button" className="talle-remove" onClick={() => removeTalle(idx)}>✕</button>
                  </div>
                )
              )}
            </div>
          )}

          <div className="talles-add-row">
            <select
              value={newTalle.talle_arg}
              onChange={e => {
                const arg = e.target.value
                const us = arg ? String(ARG_TO_US[parseInt(arg)] ?? '') : ''
                setNewTalle(t => ({ ...t, talle_arg: arg, talle_us: us }))
              }}
            >
              <option value="">Seleccionar talle</option>
              <option value="35">35</option>
              <option value="36">36</option>
              <option value="37">37</option>
              <option value="38">38</option>
              <option value="39">39</option>
              <option value="40">40</option>
              <option value="41">41</option>
              <option value="42">42</option>
              <option value="43">43</option>
              <option value="44">44</option>
              <option value="45">45</option>
              <option value="46">46</option>
            </select>
            <input
              type="text"
              readOnly
              placeholder="US"
              value={newTalle.talle_us ? `${newTalle.talle_us} US` : ''}
              className="talle-us-add-readonly"
            />
            <input type="number" min="0" placeholder="Cant." value={newTalle.cantidad} onChange={e => setNewTalle(t => ({ ...t, cantidad: e.target.value }))} />
            <input type="number" min="0" placeholder="Mín." value={newTalle.stock_minimo} onChange={e => setNewTalle(t => ({ ...t, stock_minimo: e.target.value }))} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addTalle} disabled={!newTalle.talle_arg}>+ Agregar</button>
          </div>
        </div>

        {/* Código base */}
        <div className="form-group">
          <label>Código base</label>
          {isEdit ? (
            <div className="codigo-readonly"><span>{initial?.codigo_base}</span><small>Inmutable</small></div>
          ) : (
            <div className="codigo-preview"><span>{previewCodigo || '—'}</span><small>Generado automáticamente</small></div>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Agregar modelo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
