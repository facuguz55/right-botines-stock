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
      {/* ── Banner sincronización TN ── */}
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
          <span
            className={`sync-result${hasErrors ? ' sync-result--error' : ''}`}
            title={hasErrors ? tnLastResult.errors.join('\n') : undefined}
          >
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

        <span className="sync-auto-badge">↺ resync de respaldo cada 1h</span>
      </div>

      <div className="stock-page-header">
        <div className="stock-title-block">
          <h1 className="page-title">Stock</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${filtered.length} modelo${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="stock-actions">
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
        <div className="model-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="model-card skeleton-card">
              <div className="card-image-wrap skeleton" style={{ aspectRatio: '4/3' }} />
              <div className="card-body" style={{ gap: '0.625rem' }}>
                <div className="skeleton" style={{ height: 10, width: '40%' }} />
                <div className="skeleton" style={{ height: 18, width: '75%' }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  <div className="skeleton" style={{ height: 16, width: 52 }} />
                  <div className="skeleton" style={{ height: 16, width: 40 }} />
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="skeleton" style={{ height: 22, width: 36 }} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="skeleton" style={{ height: 24, width: 80 }} />
                  <div className="skeleton" style={{ height: 14, width: 50 }} />
                </div>
                <div style={{ display: 'flex', gap: 4, paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <div className="skeleton" style={{ height: 28, flex: 1 }} />
                  <div className="skeleton" style={{ height: 28, flex: 1 }} />
                  <div className="skeleton" style={{ height: 28, width: 30 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
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
