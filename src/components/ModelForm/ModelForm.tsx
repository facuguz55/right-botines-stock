import { useState, useRef, useEffect } from 'react'
import { usDeGuia } from '../../lib/talles'
import type { Modelo, PhotoSlot, TalleRow } from '../../types'
import { Modal } from '../Modal/Modal'
import { buildCodigoBase } from '../../utils/codigos'
import { fetchTNCategories, getTNCredentials, type TNCategory } from '../../services/tiendanubeService'
import './ModelForm.css'

interface ModelFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    data: Omit<Modelo, 'id' | 'created_at' | 'modelo_talles' | 'modelo_fotos'>,
    photos: PhotoSlot[],
    toDeleteFotoIds: string[],
    talleRows: TalleRow[],
    tnCategoryId: number | null
  ) => Promise<void>
  initial?: Modelo | null
}

function categoriaLabel(cat: TNCategory, all: TNCategory[]): string {
  const nombre = (cat.name.es ?? cat.name.en ?? Object.values(cat.name)[0] ?? '').trim()
  if (!cat.parent) return nombre
  const padre = all.find(c => c.id === cat.parent)
  const nombrePadre = padre ? (padre.name.es ?? padre.name.en ?? Object.values(padre.name)[0] ?? '').trim() : ''
  return nombrePadre ? `${nombrePadre} › ${nombre}` : nombre
}

const MARCAS = ['Nike', 'Adidas', 'Puma', 'New Balance', 'Mizuno', 'Umbro', 'Under Armour', 'Joma', 'Otra']
const CATEGORIAS = ['F5', 'F11', 'Futsal', 'Hockey']
const GAMAS = ['Mixto', 'Media', 'Alta']

const EMPTY_TALLE: TalleRow = { talle_us: '', talle_arg: '', cantidad: '1', stock_minimo: '1', toDelete: false }

// Medidas del paquete: las cajas de botines suelen ser iguales, así que en un
// modelo nuevo se precargan las últimas usadas (por dispositivo).
const PAQUETE_KEY = 'rb_ultimo_paquete'
type Paquete = { peso_kg: string; alto_cm: string; ancho_cm: string; profundidad_cm: string }
const PAQUETE_VACIO: Paquete = { peso_kg: '', alto_cm: '', ancho_cm: '', profundidad_cm: '' }
function ultimoPaquete(): Paquete {
  try {
    const raw = localStorage.getItem(PAQUETE_KEY)
    return raw ? { ...PAQUETE_VACIO, ...JSON.parse(raw) } : PAQUETE_VACIO
  } catch { return PAQUETE_VACIO }
}
const numStr = (n: number | null | undefined) => (n != null && n > 0 ? String(n) : '')
const numONull = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function ModelForm({ isOpen, onClose, onSave, initial }: ModelFormProps) {
  const isEdit = !!initial

  const [form, setForm] = useState({
    marca: 'Nike', modelo: '', categoria: 'F11', gama: 'Media',
    precio_costo: '', precio_venta: '', notas: '',
  })
  const [precioPromo, setPrecioPromo] = useState('')
  const [paquete, setPaquete] = useState<Paquete>(PAQUETE_VACIO)
  const [talleRows, setTalleRows] = useState<TalleRow[]>([])
  const [newTalle, setNewTalle] = useState<TalleRow>(EMPTY_TALLE)
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [toDeleteFotoIds, setToDeleteFotoIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)

  const [tnCategorias, setTnCategorias] = useState<TNCategory[]>([])
  const [tnCategoryId, setTnCategoryId] = useState<string>('')

  useEffect(() => {
    if (!isOpen) return
    const { storeId, token } = getTNCredentials()
    fetchTNCategories(storeId, token).then(setTnCategorias).catch(() => setTnCategorias([]))
  }, [isOpen])

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
      setPrecioPromo(numStr(initial.precio_promocional))
      setPaquete({
        peso_kg: numStr(initial.peso_kg), alto_cm: numStr(initial.alto_cm),
        ancho_cm: numStr(initial.ancho_cm), profundidad_cm: numStr(initial.profundidad_cm),
      })
      setTalleRows(initial.modelo_talles.map(t => ({
        id: t.id,
        talle_us: t.talle_us > 0 ? String(t.talle_us) : '',
        talle_arg: String(t.talle_arg),
        cantidad: String(t.cantidad),
        stock_minimo: String(t.stock_minimo),
        toDelete: false,
      })))
      setPhotos(initial.modelo_fotos.map(f => ({ id: f.id, url: f.foto_url, orden: f.orden })))
    } else {
      setForm({ marca: 'Nike', modelo: '', categoria: 'F11', gama: 'Media', precio_costo: '', precio_venta: '', notas: '' })
      setPrecioPromo('')
      setPaquete(ultimoPaquete())
      setTalleRows([])
      setPhotos([])
    }
    setNewTalle(EMPTY_TALLE)
    setToDeleteFotoIds([])
    setTnCategoryId(initial?.tn_category_id ? String(initial.tn_category_id) : '')
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

    const empty = files.filter(f => f.size === 0)
    const valid = files.filter(f => f.size > 0)
    if (empty.length > 0) {
      setError(
        'Una o más fotos llegaron vacías (pasa seguido con fotos guardadas solo en iCloud y mala señal). ' +
        'Esperá a que termine de descargarlas en el teléfono y volvé a intentar.'
      )
    }
    if (!valid.length) return

    setPhotos(prev => [...prev, ...valid.map((file, i) => ({
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
    // Guarda contra doble-submit: dos invocaciones muy seguidas (doble click,
    // doble evento de submit) alcanzan a pasar antes de que React aplique
    // `disabled={saving}` al botón — sin esto, cada una dispara su propio
    // push a TiendaNube (variantes/productos duplicados).
    if (submittingRef.current) return
    submittingRef.current = true
    setError(null)
    if (!form.modelo.trim()) { submittingRef.current = false; return setError('El modelo es obligatorio') }
    if (!form.precio_venta) { submittingRef.current = false; return setError('El precio de venta es obligatorio') }
    if (!isEdit && photos.length === 0) { submittingRef.current = false; return setError('Necesitás subir al menos 1 foto') }
    if (!isEdit && activeTalles.length === 0) { submittingRef.current = false; return setError('Agregá al menos 1 talle') }
    const promo = numONull(precioPromo)
    if (promo != null && promo >= parseFloat(form.precio_venta)) {
      submittingRef.current = false
      return setError('El precio promocional tiene que ser menor al precio de venta (en la web el de venta sale tachado)')
    }
    const paqueteNum = {
      peso_kg: numONull(paquete.peso_kg), alto_cm: numONull(paquete.alto_cm),
      ancho_cm: numONull(paquete.ancho_cm), profundidad_cm: numONull(paquete.profundidad_cm),
    }
    const paqueteCompleto = Object.values(paqueteNum).every(v => v != null)
    if (!isEdit && !paqueteCompleto) {
      submittingRef.current = false
      return setError('Completá las medidas del paquete (peso, alto, ancho y profundidad): sin eso la web no puede calcular el envío')
    }

    setSaving(true)
    try {
      await onSave(
        {
          marca: form.marca, modelo: form.modelo.trim(),
          categoria: form.categoria, gama: form.gama,
          precio_costo: parseFloat(form.precio_costo) || 0,
          precio_venta: parseFloat(form.precio_venta),
          // Precio promocional = el "Promocional" de TiendaNube (precio con
          // tarjeta en oferta); antes solo llegaba sincronizado desde TN y al
          // dar de alta desde acá el producto quedaba en la web sin él.
          precio_promocional: promo,
          // El de efectivo/transferencia se recalcula desde TN en el próximo
          // sync (precio_tiers_tarjeta) — no se edita a mano.
          precio_efectivo: isEdit ? initial!.precio_efectivo : null,
          ...paqueteNum,
          codigo_base: isEdit ? initial!.codigo_base : previewCodigo,
          notas: form.notas.trim() || null,
        },
        photos, toDeleteFotoIds, talleRows,
        tnCategoryId ? parseInt(tnCategoryId, 10) : null
      )
      if (paqueteCompleto) {
        try { localStorage.setItem(PAQUETE_KEY, JSON.stringify(paquete)) } catch { /* sin storage */ }
      }
      onClose()
    } catch (e) {
      const msg = (e as Error).message
      setError(
        /no content provided/i.test(msg)
          ? 'Una de las fotos se subió vacía (falla común con fotos de iCloud sin descargar del todo). Volvé a seleccionarla y probá de nuevo.'
          : msg
      )
    } finally {
      submittingRef.current = false
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

        <div className="form-row">
          <div className="form-group">
            <label>Precio promocional (ARS)</label>
            <input
              type="number" min="0" step="0.01" placeholder="Opcional"
              title="El precio en oferta que muestra la web (el de venta sale tachado). Vacío = sin oferta."
              value={precioPromo} onChange={e => setPrecioPromo(e.target.value)}
            />
          </div>
          <div className="form-group" />
        </div>

        <div className="form-section">
          <label className="section-label">
            Paquete para el envío {!isEdit && <span className="required">*</span>}
          </label>
          <p className="form-hint">Sin estas medidas la web no puede calcular el costo del envío. Se precargan las últimas que usaste.</p>
          <div className="form-row form-row-4">
            <div className="form-group">
              <label>Peso (kg)</label>
              <input type="number" min="0" step="0.01" placeholder="1" value={paquete.peso_kg} onChange={e => setPaquete(p => ({ ...p, peso_kg: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Alto (cm)</label>
              <input type="number" min="0" step="0.1" placeholder="12" value={paquete.alto_cm} onChange={e => setPaquete(p => ({ ...p, alto_cm: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Ancho (cm)</label>
              <input type="number" min="0" step="0.1" placeholder="20" value={paquete.ancho_cm} onChange={e => setPaquete(p => ({ ...p, ancho_cm: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Profundidad (cm)</label>
              <input type="number" min="0" step="0.1" placeholder="33" value={paquete.profundidad_cm} onChange={e => setPaquete(p => ({ ...p, profundidad_cm: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Notas internas</label>
          <textarea placeholder="Aclaraciones..." value={form.notas} onChange={e => update('notas', e.target.value)} rows={2} />
        </div>

        <div className="form-group">
          <label>Categoría en TiendaNube</label>
          <select value={tnCategoryId} onChange={e => setTnCategoryId(e.target.value)}>
            <option value="">Sin categoría (asignar después)</option>
            {tnCategorias.map(c => (
              <option key={c.id} value={c.id}>{categoriaLabel(c, tnCategorias)}</option>
            ))}
          </select>
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
                    <input type="number" step="0.5" min="0" value={row.talle_us} onChange={e => updateTalleRow(idx, 'talle_us', e.target.value)} placeholder="—" title="Talle US (vacío = sin US)" />
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
                // US de la guía de talles de la web; editable igual (ver abajo).
                const us = arg ? String(usDeGuia(parseFloat(arg)) ?? '') : ''
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
              type="number"
              step="0.5"
              min="0"
              placeholder="US"
              title="Talle US según la guía de la web. Se puede cambiar; vacío = sin US (en la web sale solo el talle ARG)."
              value={newTalle.talle_us}
              onChange={e => setNewTalle(t => ({ ...t, talle_us: e.target.value }))}
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
