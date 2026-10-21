import { useState } from 'react'
import { MessageCircle, Plus, X, Loader2, RefreshCw } from 'lucide-react'
import type { WspConversacion, CrmCategoria, CrmEtiqueta } from '../../../types/crm'
import { CRM_CATEGORIAS } from '../../../types/crm'
import CategoryChip from '../CategoryChip/CategoryChip'
import EtiquetaChip from '../Etiquetas/EtiquetaChip'
import './ConversationList.css'

interface ConversationListProps {
  conversaciones: WspConversacion[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  categoriaFilter: CrmCategoria | undefined
  onCategoriaFilter: (cat: CrmCategoria | undefined) => void
  search: string
  onSearch: (term: string) => void
  onStartConversacion: (numero: string, nombre: string | null) => Promise<void>
  etiquetas: CrmEtiqueta[]
  etiquetasPorConv: Record<string, CrmEtiqueta[]>
  etiquetaFilter: string | undefined
  onEtiquetaFilter: (id: string | undefined) => void
  onActualizar: () => void
  actualizando: boolean
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function getInitial(name: string | null): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}

export default function ConversationList({
  conversaciones,
  loading,
  selectedId,
  onSelect,
  categoriaFilter,
  onCategoriaFilter,
  search,
  onSearch,
  onStartConversacion,
  etiquetas,
  etiquetasPorConv,
  etiquetaFilter,
  onEtiquetaFilter,
  onActualizar,
  actualizando,
}: ConversationListProps) {
  const [showNueva, setShowNueva] = useState(false)
  const [nuevoNumero, setNuevoNumero] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [creando, setCreando] = useState(false)

  const handleCrearConversacion = async () => {
    const numero = nuevoNumero.trim()
    if (!numero || creando) return
    setCreando(true)
    try {
      await onStartConversacion(numero, nuevoNombre.trim() || null)
      setShowNueva(false)
      setNuevoNumero('')
      setNuevoNombre('')
    } catch (err) {
      console.error('Error creando conversación:', err)
      alert('No se pudo crear la conversación. Revisá el número.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="conv-list">
      <div className="conv-list-header">
        <h2 className="conv-list-title">
          <span className="conv-list-title-icon">
            <MessageCircle size={16} />
          </span>
          WhatsApp
        </h2>
        <div className="conv-list-header-right">
          {conversaciones.length > 0 && (
            <span className="conv-list-count">{conversaciones.length}</span>
          )}
          <button
            className="conv-list-new-btn"
            title="Actualizar chats"
            onClick={onActualizar}
            disabled={actualizando}
          >
            <RefreshCw size={14} className={actualizando ? 'conv-list-spin' : undefined} />
          </button>
          <button
            className="conv-list-new-btn"
            title="Escribirle a un número nuevo"
            onClick={() => setShowNueva(v => !v)}
          >
            {showNueva ? <X size={15} /> : <Plus size={15} />}
          </button>
        </div>
      </div>

      {showNueva && (
        <div className="conv-list-new-form">
          <input
            type="text"
            placeholder="Nombre (opcional)"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
          />
          <input
            type="tel"
            placeholder="Número de WhatsApp (ej: 3424633285)"
            value={nuevoNumero}
            onChange={(e) => setNuevoNumero(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCrearConversacion() }}
          />
          <button
            className="conv-list-new-form-btn"
            disabled={!nuevoNumero.trim() || creando}
            onClick={handleCrearConversacion}
          >
            {creando ? <Loader2 size={14} className="conv-list-spin" /> : 'Escribirle'}
          </button>
        </div>
      )}

      <div className="conv-list-search">
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="conv-list-filters">
        <button
          className={`conv-list-filter-btn${!categoriaFilter ? ' conv-list-filter-btn--active' : ''}`}
          onClick={() => onCategoriaFilter(undefined)}
        >
          Todas
        </button>
        {CRM_CATEGORIAS.map((cat) => (
          <button
            key={cat}
            className={`conv-list-filter-btn${categoriaFilter === cat ? ' conv-list-filter-btn--active' : ''}`}
            onClick={() => onCategoriaFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {etiquetas.length > 0 && (
        <div className="conv-list-label-filters">
          {etiquetas.map((e) => (
            <button
              key={e.id}
              className={`conv-list-label-filter${etiquetaFilter === e.id ? ' conv-list-label-filter--active' : ''}`}
              style={{ color: e.color, borderColor: `${e.color}66`, background: etiquetaFilter === e.id ? `${e.color}22` : 'transparent' }}
              onClick={() => onEtiquetaFilter(etiquetaFilter === e.id ? undefined : e.id)}
              title={etiquetaFilter === e.id ? 'Quitar el filtro' : `Ver solo los chats con "${e.nombre}"`}
            >
              {e.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="conv-list-divider" />

      <div className="conv-list-items">
        {loading ? (
          <div className="conv-list-loading">Cargando...</div>
        ) : conversaciones.length === 0 ? (
          <div className="conv-list-empty">
            <div className="conv-list-empty-icon">
              <MessageCircle size={24} />
            </div>
            <p className="conv-list-empty-text">Sin conversaciones</p>
            <p className="conv-list-empty-hint">Cuando un cliente escriba por WhatsApp, su conversación va a aparecer acá</p>
          </div>
        ) : (
          conversaciones.map((conv) => (
            <div
              key={conv.id}
              className={`conv-list-item${selectedId === conv.id ? ' conv-list-item--selected' : ''}${conv.no_leidos > 0 ? ' conv-list-item--unread' : ''}`}
              onClick={() => onSelect(conv.id)}
            >
              <div className="conv-list-avatar">
                {getInitial(conv.nombre_personalizado || conv.nombre)}
              </div>
              <div className="conv-list-info">
                <div className="conv-list-top">
                  <span className="conv-list-name">{conv.nombre_personalizado || conv.nombre || conv.telefono || 'Sin nombre'}</span>
                  <span className="conv-list-time">{timeAgo(conv.ultimo_mensaje_at)}</span>
                </div>
                <div className="conv-list-bottom">
                  <span className="conv-list-preview">{conv.ultimo_mensaje || 'Sin mensajes'}</span>
                  <div className="conv-list-meta">
                    <CategoryChip categoria={conv.categoria} size="sm" />
                    {conv.no_leidos > 0 && (
                      <span className="conv-list-badge">{conv.no_leidos}</span>
                    )}
                  </div>
                </div>
                {(etiquetasPorConv[conv.id]?.length ?? 0) > 0 && (
                  <div className="conv-list-labels">
                    {etiquetasPorConv[conv.id].slice(0, 3).map(e => <EtiquetaChip key={e.id} etiqueta={e} />)}
                    {etiquetasPorConv[conv.id].length > 3 && (
                      <span className="conv-list-labels-more">+{etiquetasPorConv[conv.id].length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
