// @ts-nocheck
import { useState, useRef, useEffect } from 'react'
import type { Producto, PhotoSlot } from '../../types'
import { Modal } from '../Modal/Modal'
import { buildCodigoRef } from '../../utils/codigos'
import './ProductForm.css'

interface ProductFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    data: Omit<Producto, 'id' | 'created_at' | 'producto_fotos'>,
    photos: PhotoSlot[],
    toDeleteFotoIds: string[]
  ) => Promise<void>
  initial?: Producto | null
}

const MARCAS = ['Nike', 'Adidas', 'Puma', 'New Balance', 'Mizuno', 'Umbro', 'Under Armour', 'Joma', 'Otra']
const CATEGORIAS = ['F5', 'F11', 'Futsal', 'Hockey']
const GAMAS = ['Económica', 'Media', 'Alta']

export function ProductForm({ isOpen, onClose, onSave, initial }: ProductFormProps) {
  const isEdit = !!initial

  const [form, setForm] = useState({
    marca: 'Nike', modelo: '', categoria: 'F11', gama: 'Media',
    talle_us: '', talle_arg: '', cantidad: '1', stock_minimo: '1',
    precio_costo: '', precio_venta: '', notas: '',
  })
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
        talle_us: String(initial.talle_us), talle_arg: String(initial.talle_arg),
        cantidad: String(initial.cantidad), stock_minimo: String(initial.stock_minimo),
        precio_costo: String(initial.precio_costo), precio_venta: String(initial.precio_venta),
        notas: initial.notas ?? '',
      })
      setPhotos(initial.producto_fotos.map(f => ({ id: f.id, url: f.foto_url, orden: f.orden })))
    } else {
      setForm({ marca: 'Nike', modelo: '', categoria: 'F11', gama: 'Media', talle_us: '', talle_arg: '', cantidad: '1', stock_minimo: '1', precio_costo: '', precio_venta: '', notas: '' })
      setPhotos([])
    }
    setToDeleteFotoIds([])
    setError(null)
  }, [isOpen, initial])

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  const previewRef = buildCodigoRef(
    form.marca, form.modelo, form.talle_arg || form.talle_us, form.categoria, form.gama
  )

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const newSlots: PhotoSlot[] = files.map((file, i) => ({
      url: URL.createObjectURL(file), file, orden: photos.length + i,
    }))
    setPhotos(prev => [...prev, ...newSlots])
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    const slot = photos[index]
    if (slot.id) setToDeleteFotoIds(prev => [...prev, slot.id!])
    setPhotos(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, orden: i })))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.modelo.trim()) return setError('El modelo es obligatorio')
    if (!form.talle_us) return setError('El talle US es obligatorio')
    if (!form.precio_venta) return setError('El precio de venta es obligatorio')
    if (!isEdit && photos.length === 0) return setError('Necesitás subir al menos 1 foto')

    setSaving(true)
    try {
      await onSave(
        {
          marca: form.marca, modelo: form.modelo.trim(),
          categoria: form.categoria, gama: form.gama,
          talle_us: parseFloat(form.talle_us),
          talle_arg: parseFloat(form.talle_arg) || parseFloat(form.talle_us),
          cantidad: parseInt(form.cantidad) || 0,
          stock_minimo: parseInt(form.stock_minimo) || 1,
          precio_costo: parseFloat(form.precio_costo) || 0,
          precio_venta: parseFloat(form.precio_venta),
          codigo_ref: isEdit ? initial!.codigo_ref : previewRef,
          notas: form.notas.trim() || null,
        },
        photos, toDeleteFotoIds
      )
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Editar botín' : 'Agregar botín'} maxWidth="620px">
      <form className="product-form" onSubmit={handleSubmit}>

        <div className="form-section">
          <label className="section-label">
            Fotos {!isEdit && <span className="required">* mínimo 1</span>}
          </label>
          <div className="photos-grid">
            {photos.map((slot, i) => (
              <div key={i} className="photo-slot">
                <img src={slot.url} alt={`foto ${i + 1}`} />
                {i === 0 && <span className="photo-main-badge">Principal</span>}
                <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="photo-add-slot" onClick={() => fileRef.current?.click()}>
              <span>+</span><small>Agregar foto</small>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFilesChange} style={{ display: 'none' }} />
        </div>

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
            <label>Categoría *</label>
            <select value={form.categoria} onChange={e => update('categoria', e.target.value)}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Gama *</label>
            <select value={form.gama} onChange={e => update('gama', e.target.value)}>
              {GAMAS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Talle US *</label>
            <input type="number" step="0.5" placeholder="Ej: 10.5" value={form.talle_us} onChange={e => update('talle_us', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Talle ARG</label>
            <input type="number" step="0.5" placeholder="Ej: 43" value={form.talle_arg} onChange={e => update('talle_arg', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Cantidad de pares</label>
            <input type="number" min="0" value={form.cantidad} onChange={e => update('cantidad', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Alertar cuando queden menos de (pares)</label>
            <input type="number" min="0" value={form.stock_minimo} onChange={e => update('stock_minimo', e.target.value)} />
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
          <textarea placeholder="Ej: tiene rayón en la puntera, caja abierta..." value={form.notas} onChange={e => update('notas', e.target.value)} rows={2} />
        </div>

        <div className="form-group">
          <label>Código de referencia</label>
          {isEdit ? (
            <div className="codigo-ref-readonly">
              <span>{initial?.codigo_ref}</span>
              <small>El código no se puede modificar</small>
            </div>
          ) : (
            <div className="codigo-ref-preview">
              <span>{previewRef || '—'}</span>
              <small>Generado automáticamente · puede tener sufijo si ya existe</small>
            </div>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Agregar botín'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
