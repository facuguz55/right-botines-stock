import { useState } from 'react'
import { Camera, Upload, Trash2, Plus, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import type { Modelo, ModeloFilters } from '../../types'
import type { SyncResult } from '../../services/tnSync'
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
  onImportFotos: () => void
  onImportExcel: () => void
  onClearAll: () => void
  // Sync TN
  onSyncTN: () => void
  syncingTN: boolean
  tnProgress: string
  tnLastResult: SyncResult | null
  tnLastSyncAt: Date | null
}

const DEFAULT_FILTERS: ModeloFilters = {
  marca: '', categoria: '', gama: '', talle: '', disponibilidad: 'todos', search: '',
}

export function ModelGrid({
  modelos, loading,
  onSell, onEdit, onDelete, onIngreso, onPriceHistory,
  onAdd, onPhotoSearch, onImport, onImportFotos, onImportExcel, onClearAll,
  onSyncTN, syncingTN, tnProgress, tnLastResult, tnLastSyncAt,
}: ModelGridProps) {
  const [filters, setFilters] = useState<ModeloFilters>(DEFAULT_FILTERS)
  const filtered = filterModelos(modelos, filters)

  const hasErrors = (tnLastResult?.errors.length ?? 0) > 0
  const syncLabel = syncingTN
    ? (tnProgress || 'Sincronizando...')
    : 'Actualizar desde TiendaNube'

  const lastSyncStr = tnLastSyncAt
    ? tnLastSyncAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="model-grid-page">
      {/* ── Banner de sincronización TN ── */}
      <div className="tn-sync-bar">
        <button
          className={`btn-sync-tn${syncingTN ? ' syncing' : ''}`}
          onClick={onSyncTN}
          disabled={syncingTN}
        >
          <RefreshCw size={14} className={syncingTN ? 'spin' : ''} />
          {syncLabel}
        </button>

        {!syncingTN && tnLastResult && (
          <span className={`sync-result${hasErrors ? ' sync-result--error' : ''}`}>
            {hasErrors ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
            {tnLastResult.created > 0 && `${tnLastResult.created} creados`}
            {tnLastResult.created > 0 && tnLastResult.updated > 0 && ' · '}
            {tnLastResult.updated > 0 && `${tnLastResult.updated} actualizados`}
            {tnLastResult.imagesAdded > 0 && ` · ${tnLastResult.imagesAdded} imágenes`}
            {hasErrors && ` · ${tnLastResult.errors.length} errores`}
            {lastSyncStr && <span className="sync-time">última sync: {lastSyncStr}</span>}
          </span>
        )}

        {!syncingTN && !tnLastResult && lastSyncStr && (
          <span className="sync-result">
            <CheckCircle size={12} /> última sync: {lastSyncStr}
          </span>
        )}

        <span className="sync-auto-badge">↺ auto cada 5 min</span>
      </div>

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
            <button className="btn btn-secondary btn-sm" onClick={onImportFotos}>
              <Camera size={13} /> Importar fotos
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onImportExcel}>
              <Upload size={13} /> Cargar Excel
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
