import { MessageCircle } from 'lucide-react'
import type { WspConversacion, CrmCategoria } from '../../../types/crm'
import { CRM_CATEGORIAS } from '../../../types/crm'
import CategoryChip from '../CategoryChip/CategoryChip'
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
}: ConversationListProps) {
  return (
    <div className="conv-list">
      <div className="conv-list-header">
        <h2 className="conv-list-title">WhatsApp</h2>
      </div>

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
              className={`conv-list-item${selectedId === conv.id ? ' conv-list-item--selected' : ''}`}
              onClick={() => onSelect(conv.id)}
            >
              <div className="conv-list-avatar">
                {getInitial(conv.nombre)}
              </div>
              <div className="conv-list-info">
                <div className="conv-list-top">
                  <span className="conv-list-name">{conv.nombre || conv.telefono || 'Sin nombre'}</span>
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
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
