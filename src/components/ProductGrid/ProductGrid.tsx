// @ts-nocheck
import { useState } from 'react'
import type { Producto, ProductoFilters } from '../../types'
import { ProductCard } from '../ProductCard/ProductCard'
import { Filters } from '../Filters/Filters'
import { filterProductos } from '../../hooks/useProductos'
import './ProductGrid.css'

interface ProductGridProps {
  productos: Producto[]
  loading: boolean
  onSell: (producto: Producto) => void
  onEdit: (producto: Producto) => void
  onDelete: (producto: Producto) => void
  onIngreso: (producto: Producto) => void
  onPriceHistory: (producto: Producto) => void
  onAdd: () => void
  onPhotoSearch: () => void
}

const DEFAULT_FILTERS: ProductoFilters = {
  talle: '', marca: '', categoria: '', gama: '',
  disponibilidad: 'todos', search: '',
}

export function ProductGrid({
  productos, loading, onSell, onEdit, onDelete, onIngreso,
  onPriceHistory, onAdd, onPhotoSearch,
}: ProductGridProps) {
  const [filters, setFilters] = useState<ProductoFilters>(DEFAULT_FILTERS)
  const filtered = filterProductos(productos, filters)

  return (
    <div className="product-grid-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={onPhotoSearch}>
            🔍 Buscar por foto
          </button>
          <button className="btn btn-primary" onClick={onAdd}>
            + Agregar botín
          </button>
        </div>
      </div>

      <Filters filters={filters} onChange={setFilters} productos={productos} />

      {loading ? (
        <div className="grid-loading">
          <div className="spinner" />
          <p>Cargando stock...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="grid-empty">
          <span className="empty-icon">📦</span>
          <p>{productos.length === 0 ? 'No tenés productos cargados todavía.' : 'No hay productos con esos filtros.'}</p>
          {productos.length === 0 && (
            <button className="btn btn-primary" onClick={onAdd}>Agregar el primer botín</button>
          )}
        </div>
      ) : (
        <div className="product-grid">
          {filtered.map(p => (
            <ProductCard
              key={p.id}
              producto={p}
              onSell={onSell}
              onEdit={onEdit}
              onDelete={onDelete}
              onIngreso={onIngreso}
              onPriceHistory={onPriceHistory}
            />
          ))}
        </div>
      )}
    </div>
  )
}
