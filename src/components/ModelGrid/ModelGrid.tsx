import { useState } from 'react'
import { Camera, Upload, Trash2, Plus } from 'lucide-react'
import type { Modelo, ModeloFilters } from '../../types'
import { ModelCard } from '../ModelCard/ModelCard'
import { Filters } from '../Filters/Filters'
import { ExportButton } from '../ExportButton/ExportButton'
import { filterModelos } from '../../hooks/useModelos'
import './ModelGrid.css'

interface ModelGridProps {
  modelos: Modelo[]
  loading: boolean
  onSell: (m: Modelo) => void
  onEdit: (m: Modelo) => void
  onDelete: (m: Modelo) => void
  onIngreso: (m: Modelo) => void
  onPriceHistory: (m: Modelo) => void
  onAdd: () => void
  onPhotoSearch: () => void
  onImport: () => void
  onClearAll: () => void
}

const DEFAULT_FILTERS: ModeloFilters = {
  marca: '', categoria: '', gama: '', disponibilidad: 'todos', search: '',
}

export function ModelGrid({
  modelos, loading,
  onSell, onEdit, onDelete, onIngreso, onPriceHistory,
  onAdd, onPhotoSearch, onImport, onClearAll,
}: ModelGridProps) {
  const [filters, setFilters] = useState<ModeloFilters>(DEFAULT_FILTERS)
  const filtered = filterModelos(modelos, filters)

  return (
    <div className="model-grid-page">
      <div className="stock-page-header">
        <div className="stock-title-block">
          <h1 className="page-title">Stock</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${filtered.length} modelo${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="stock-actions">
          {/* Fila superior — acciones secundarias (más chicas) */}
          <div className="stock-actions-secondary">
            <button className="btn btn-secondary btn-sm" onClick={onImport}>
              <Upload size={13} /> Importar TiendaNube
            </button>
            <ExportButton modelos={modelos} />
            <button className="btn btn-danger btn-sm" onClick={onClearAll} disabled={modelos.length === 0}>
              <Trash2 size={13} /> Borrar todo
            </button>
          </div>

          {/* Fila inferior — acciones principales */}
          <div className="stock-actions-primary">
            <button className="btn btn-secondary" onClick={onPhotoSearch}>
              <Camera size={15} /> Buscar por foto
            </button>
            <button className="btn btn-primary" onClick={onAdd}>
              <Plus size={15} /> Agregar modelo
            </button>
          </div>
        </div>
      </div>

      <Filters filters={filters} onChange={setFilters} modelos={modelos} />

      {loading ? (
        <div className="grid-loading"><div className="spinner" /><p>Cargando stock...</p></div>
      ) : filtered.length === 0 ? (
        <div className="grid-empty">
          <span className="empty-icon">📦</span>
          <p>{modelos.length === 0 ? 'No tenés modelos cargados todavía.' : 'No hay modelos con esos filtros.'}</p>
          {modelos.length === 0 && <button className="btn btn-primary" onClick={onAdd}><Plus size={15} /> Agregar el primer modelo</button>}
        </div>
      ) : (
        <div className="model-grid">
          {filtered.map(m => (
            <ModelCard
              key={m.id}
              modelo={m}
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
