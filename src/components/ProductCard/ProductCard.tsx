// @ts-nocheck
import type { Producto } from '../../types'
import './ProductCard.css'

interface ProductCardProps {
  producto: Producto
  onSell: (producto: Producto) => void
  onEdit: (producto: Producto) => void
  onDelete: (producto: Producto) => void
  onIngreso: (producto: Producto) => void
  onPriceHistory: (producto: Producto) => void
}

export function ProductCard({ producto, onSell, onEdit, onDelete, onIngreso, onPriceHistory }: ProductCardProps) {
  const agotado = producto.cantidad === 0
  const ultimoPar = producto.cantidad === 1
  const stockMinimo = !agotado && !ultimoPar && producto.cantidad <= producto.stock_minimo
  const mainFoto = producto.producto_fotos[0]?.foto_url ?? null
  const extraFotos = producto.producto_fotos.length - 1

  return (
    <div className={`product-card${agotado ? ' agotado' : ''}`}>
      <div className="card-image-wrap">
        {mainFoto ? (
          <img src={mainFoto} alt={producto.modelo} className="card-image" loading="lazy" />
        ) : (
          <div className="card-image-placeholder"><span>⚽</span></div>
        )}
        {agotado && <div className="badge badge-agotado">Agotado</div>}
        {ultimoPar && <div className="badge badge-ultimo">¡Último par!</div>}
        {stockMinimo && <div className="badge badge-minimo">Stock mínimo</div>}
        {extraFotos > 0 && <div className="foto-count">+{extraFotos}</div>}
      </div>

      <div className="card-body">
        <div className="card-header">
          <p className="card-marca">{producto.marca}</p>
          <p className="card-modelo">{producto.modelo}</p>
        </div>

        <div className="card-details">
          <span className="card-talle">{producto.talle_us}us / {producto.talle_arg}arg</span>
          <span className="card-cat">{producto.categoria}</span>
          <span className="card-gama">{producto.gama}</span>
        </div>

        <div className="card-meta">
          <span className="card-precio">${producto.precio_venta.toLocaleString('es-AR')}</span>
          <span className={`card-stock${agotado ? ' zero' : ultimoPar || stockMinimo ? ' warning' : ''}`}>
            {producto.cantidad} par{producto.cantidad !== 1 ? 'es' : ''}
          </span>
        </div>

        <div className="card-ref-row">
          <p className="card-ref">{producto.codigo_ref}</p>
          <button className="btn-price-history" onClick={() => onPriceHistory(producto)} title="Historial de precios">
            📈
          </button>
        </div>

        {producto.notas && (
          <p className="card-notas" title={producto.notas}>{producto.notas}</p>
        )}

        <div className="card-actions">
          <button className="btn btn-primary btn-sm" onClick={() => onSell(producto)} disabled={agotado}>
            Vender
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onIngreso(producto)}>
            + Stock
          </button>
          <button className="btn btn-secondary btn-sm icon-btn" onClick={() => onEdit(producto)}>✏️</button>
          <button className="btn btn-danger btn-sm icon-btn" onClick={() => onDelete(producto)}>🗑️</button>
        </div>
      </div>
    </div>
  )
}
