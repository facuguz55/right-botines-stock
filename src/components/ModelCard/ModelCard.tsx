import { Pencil, Trash2 } from 'lucide-react'
import type { Modelo } from '../../types'
import './ModelCard.css'

interface ModelCardProps {
  modelo: Modelo
  onSell: (modelo: Modelo) => void
  onEdit: (modelo: Modelo) => void
  onDelete: (modelo: Modelo) => void
  onIngreso: (modelo: Modelo) => void
  onPriceHistory: (modelo: Modelo) => void
}

export function ModelCard({ modelo, onSell, onEdit, onDelete, onIngreso, onPriceHistory }: ModelCardProps) {
  const totalPares = modelo.modelo_talles.reduce((s, t) => s + t.cantidad, 0)
  const agotado = totalPares === 0
  const ultimoPar = !agotado && totalPares === 1
  const mainFoto = modelo.modelo_fotos[0]?.foto_url ?? null
  const extraFotos = modelo.modelo_fotos.length - 1

  return (
    <div className="model-card">
      <div className="card-image-wrap">
        {mainFoto ? (
          <img src={mainFoto} alt={modelo.modelo} className="card-image" loading="lazy" />
        ) : (
          <div className="card-image-placeholder"><span>⚽</span></div>
        )}
        {agotado && <div className="badge badge-agotado">Agotado</div>}
        {ultimoPar && <div className="badge badge-ultimo">¡Último par!</div>}
        {extraFotos > 0 && <div className="foto-count">+{extraFotos}</div>}
      </div>

      <div className="card-body">
        <div className="card-header">
          <p className="card-marca">{modelo.marca}</p>
          <p className="card-modelo">{modelo.modelo}</p>
        </div>

        <div className="card-tags">
          <span className="tag tag-cat">{modelo.categoria}</span>
          <span className="tag">{modelo.gama}</span>
        </div>

        <div className="card-talles">
          {modelo.modelo_talles.length === 0 ? (
            <span className="talles-empty">Sin talles cargados</span>
          ) : (
            modelo.modelo_talles.map(t => (
              <span
                key={t.id}
                className={`talle-chip ${t.cantidad === 0 ? 'agotado' : t.cantidad === 1 ? 'ultimo' : t.cantidad <= t.stock_minimo ? 'bajo' : ''}`}
                title={`Talle ${t.talle_arg} arg / ${t.talle_us} us`}
              >
                {t.talle_arg}×{t.cantidad}
              </span>
            ))
          )}
        </div>

        <div className="card-meta">
          <span className="card-precio">${modelo.precio_venta.toLocaleString('es-AR')}</span>
          <span className={`card-total-pares${agotado ? ' zero' : ''}`}>
            {totalPares} par{totalPares !== 1 ? 'es' : ''}
          </span>
        </div>

        <div className="card-ref-row">
          <p className="card-ref">{modelo.codigo_base}</p>
          <button className="btn-price-history" onClick={() => onPriceHistory(modelo)} title="Historial de precios">📈</button>
        </div>

        {modelo.notas && (
          <p className="card-notas" title={modelo.notas}>{modelo.notas}</p>
        )}

        <div className="card-actions">
          <button className="btn btn-primary btn-sm" onClick={() => onSell(modelo)}>
            Vender
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onIngreso(modelo)}>
            + Stock
          </button>
          <button className="btn btn-secondary btn-sm icon-btn" onClick={() => onEdit(modelo)}><Pencil size={14} /></button>
          <button className="btn btn-danger btn-sm icon-btn" onClick={() => onDelete(modelo)}><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  )
}
