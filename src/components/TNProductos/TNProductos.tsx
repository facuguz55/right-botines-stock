import { useState, useEffect } from 'react'
import { RefreshCw, Edit2, Check, X, AlertTriangle, Search } from 'lucide-react'
import {
  fetchTNVariants, updateTNVariant, getTNCredentials,
  formatARS, type TNVariantItem,
} from '../../services/tiendanubeService'
import './TNProductos.css'

interface EditingState {
  variantId: number
  productId: number
  field: 'stock' | 'price'
  value: string
}

export function TNProductos() {
  const [variants, setVariants]   = useState<TNVariantItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [editing, setEditing]     = useState<EditingState | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')
  const [search, setSearch]       = useState('')
  const [lowStockOnly, setLow]    = useState(false)

  const load = async () => {
    const { storeId, token } = getTNCredentials()
    setLoading(true)
    setError('')
    try {
      const data = await fetchTNVariants(storeId, token)
      setVariants(data.sort((a, b) => a.nombre.localeCompare(b.nombre)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const startEdit = (v: TNVariantItem, field: 'stock' | 'price') => {
    setEditing({
      productId: v.productId,
      variantId: v.variantId,
      field,
      value: field === 'stock' ? String(v.stock) : String(v.precio),
    })
  }

  const cancelEdit = () => setEditing(null)

  const saveEdit = async () => {
    if (!editing) return
    const { storeId, token } = getTNCredentials()
    setSaving(true)
    setSaveMsg('')
    try {
      const payload = editing.field === 'stock'
        ? { stock: parseInt(editing.value, 10) }
        : { price: editing.value }
      await updateTNVariant(storeId, token, editing.productId, editing.variantId, payload)
      setSaveMsg('✓ Guardado')
      setEditing(null)
      await load()
      setTimeout(() => setSaveMsg(''), 2000)
    } catch (e: unknown) {
      setSaveMsg('⚠ Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="tn-loading"><div className="spinner" /><p>Cargando productos TiendaNube...</p></div>
  if (error) return <div className="tn-error"><p>⚠ {error}</p><button className="btn btn-secondary btn-sm" onClick={load}>Reintentar</button></div>

  const filtered = variants.filter(v => {
    if (lowStockOnly && v.stock > 3) return false
    if (search) {
      const q = search.toLowerCase()
      if (!v.nombre.toLowerCase().includes(q) && !v.sku.toLowerCase().includes(q) && !v.variantLabel.toLowerCase().includes(q)) return false
    }
    return true
  })

  const lowStockCount = variants.filter(v => v.stock <= 3 && v.stock > 0).length
  const outOfStockCount = variants.filter(v => v.stock === 0).length

  return (
    <div className="tn-productos">
      <div className="page-header">
        <div>
          <h1 className="page-title">Productos TN</h1>
          <p className="page-subtitle">{variants.length} variantes · {outOfStockCount} sin stock</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {saveMsg && <span className="tn-save-msg">{saveMsg}</span>}
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* Alertas rápidas */}
      {(lowStockCount > 0 || outOfStockCount > 0) && (
        <div className="tn-stock-alerts">
          {outOfStockCount > 0 && (
            <div className="tn-alert-chip danger">
              <AlertTriangle size={12} /> {outOfStockCount} sin stock
            </div>
          )}
          {lowStockCount > 0 && (
            <div className="tn-alert-chip warning">
              <AlertTriangle size={12} /> {lowStockCount} con stock bajo (≤3)
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="tn-productos-filters">
        <div className="tn-search-wrap">
          <Search size={14} />
          <input
            type="text"
            placeholder="Buscar producto, SKU o variante..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          className={`btn btn-secondary btn-sm${lowStockOnly ? ' active-filter' : ''}`}
          onClick={() => setLow(v => !v)}
        >
          {lowStockOnly ? '✓ ' : ''}Stock bajo (≤3)
        </button>
      </div>

      {/* Grid de variantes */}
      <div className="tn-variants-table-wrap">
        <table className="tn-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Variante</th>
              <th>Stock</th>
              <th>Precio</th>
              <th>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => {
              const isEditingStock = editing?.variantId === v.variantId && editing.field === 'stock'
              const isEditingPrice = editing?.variantId === v.variantId && editing.field === 'price'
              const isLow = v.stock <= 3 && v.stock > 0
              const isOut = v.stock === 0

              return (
                <tr key={`${v.productId}-${v.variantId}`} className={isOut ? 'row-out' : isLow ? 'row-low' : ''}>
                  <td className="tn-prod-name">
                    {v.imagen && <img src={v.imagen} alt={v.nombre} className="tn-prod-img" />}
                    <span>{v.nombre}</span>
                  </td>
                  <td className="tn-prod-sku">{v.sku}</td>
                  <td className="tn-prod-variant">{v.variantLabel || '—'}</td>

                  {/* Stock editable */}
                  <td className="tn-prod-stock">
                    {isEditingStock ? (
                      <div className="tn-inline-edit">
                        <input
                          type="number"
                          value={editing!.value}
                          onChange={e => setEditing(s => s ? { ...s, value: e.target.value } : null)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                          autoFocus
                          min={0}
                        />
                        <button className="tn-inline-ok" onClick={saveEdit} disabled={saving}><Check size={13} /></button>
                        <button className="tn-inline-cancel" onClick={cancelEdit}><X size={13} /></button>
                      </div>
                    ) : (
                      <button
                        className={`tn-stock-badge${isOut ? ' out' : isLow ? ' low' : ''}`}
                        onClick={() => startEdit(v, 'stock')}
                        title="Clic para editar"
                      >
                        {isOut ? 'Sin stock' : v.stock}
                        <Edit2 size={10} className="tn-edit-icon" />
                      </button>
                    )}
                  </td>

                  {/* Precio editable */}
                  <td className="tn-prod-price">
                    {isEditingPrice ? (
                      <div className="tn-inline-edit">
                        <input
                          type="number"
                          value={editing!.value}
                          onChange={e => setEditing(s => s ? { ...s, value: e.target.value } : null)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                          autoFocus
                          min={0}
                        />
                        <button className="tn-inline-ok" onClick={saveEdit} disabled={saving}><Check size={13} /></button>
                        <button className="tn-inline-cancel" onClick={cancelEdit}><X size={13} /></button>
                      </div>
                    ) : (
                      <button
                        className="tn-price-badge"
                        onClick={() => startEdit(v, 'price')}
                        title="Clic para editar"
                      >
                        ${formatARS(v.precio)}
                        <Edit2 size={10} className="tn-edit-icon" />
                      </button>
                    )}
                  </td>

                  <td className="tn-prod-date">
                    {v.updatedAt
                      ? new Date(v.updatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="tn-empty">No se encontraron variantes.</div>}
      </div>
    </div>
  )
}
