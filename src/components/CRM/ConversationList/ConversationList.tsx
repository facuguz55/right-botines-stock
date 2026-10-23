import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Plus, X, Loader2, RefreshCw, Sun, Moon, Mail, MailOpen } from 'lucide-react'
import type { CrmTema } from '../../../lib/crmTema'
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
  tema: CrmTema
  onToggleTema: () => void
  onActualizar: () => void
  actualizando: boolean
  // Marca el chat como no leído (si estaba leído) o como leído (si tenía mensajes sin leer).
  onToggleLeido: (conv: WspConversacion) => void
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
  tema,
  onToggleTema,
  onActualizar,
  actualizando,
  onToggleLeido,
}: ConversationListProps) {
  // Menú de un chat (mantener apretado en el celular, clic derecho en la compu).
  const [menu, setMenu] = useState<{ conv: WspConversacion; x: number; y: number } | null>(null)
  const pulsacion = useRef<{ timer: number; x: number; y: number } | null>(null)
  const ignorarClick = useRef(false)

  const abrirMenu = useCallback((conv: WspConversacion, x: number, y: number) => {
    // Que el menú no se salga de la pantalla.
    const ancho = 230, alto = 56
    setMenu({
      conv,
      x: Math.max(8, Math.min(x, window.innerWidth - ancho - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - alto - 8)),
    })
  }, [])

  const cancelarPulsacion = () => {
    if (pulsacion.current) window.clearTimeout(pulsacion.current.timer)
    pulsacion.current = null
  }

  const empezarPulsacion = (e: React.PointerEvent, conv: WspConversacion) => {
    if (e.pointerType === 'mouse') return // en la compu es clic derecho
    cancelarPulsacion()
    // Un toque nuevo siempre abre el chat: si el anterior fue una pulsación larga y el
    // navegador no mandó el click al soltar, no queda "pendiente" de ignorar.
    ignorarClick.current = false
    const { clientX: x, clientY: y } = e
    pulsacion.current = {
      x, y,
      timer: window.setTimeout(() => {
        pulsacion.current = null
        ignorarClick.current = true
        navigator.vibrate?.(15)
        abrirMenu(conv, x, y)
      }, 450),
    }
  }

  const moverPulsacion = (e: React.PointerEvent) => {
    const p = pulsacion.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelarPulsacion()
  }

  useEffect(() => {
    if (!menu) return
    const cerrar = () => setMenu(null)
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('pointerdown', cerrar)
    document.addEventListener('keydown', alTecla)
    window.addEventListener('resize', cerrar)
    window.addEventListener('blur', cerrar)
    return () => {
      document.removeEventListener('pointerdown', cerrar)
      document.removeEventListener('keydown', alTecla)
      window.removeEventListener('resize', cerrar)
      window.removeEventListener('blur', cerrar)
    }
  }, [menu])

  useEffect(() => cancelarPulsacion, [])

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
            title={tema === 'claro' ? 'Cambiar al tema oscuro' : 'Cambiar al tema claro (para ver mejor con sol)'}
            onClick={onToggleTema}
          >
            {tema === 'claro' ? <Moon size={15} /> : <Sun size={15} />}
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
              style={{ color: e.color, ['--chip-color' as string]: e.color, borderColor: `${e.color}66`, background: etiquetaFilter === e.id ? `${e.color}22` : 'transparent' }}
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
              onClick={() => {
                // Después de mantener apretado, el "soltar" no tiene que abrir el chat.
                if (ignorarClick.current) { ignorarClick.current = false; return }
                onSelect(conv.id)
              }}
              onContextMenu={e => { e.preventDefault(); cancelarPulsacion(); abrirMenu(conv, e.clientX, e.clientY) }}
              onPointerDown={e => empezarPulsacion(e, conv)}
              onPointerMove={moverPulsacion}
              onPointerUp={cancelarPulsacion}
              onPointerCancel={cancelarPulsacion}
              onPointerLeave={cancelarPulsacion}
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

      {menu && (
        <div className="conv-menu" style={{ left: menu.x, top: menu.y }} role="menu" onPointerDown={e => e.stopPropagation()}>
          <button
            role="menuitem"
            onClick={() => { onToggleLeido(menu.conv); setMenu(null) }}
          >
            {menu.conv.no_leidos > 0
              ? <><MailOpen size={16} /> Marcar como leído</>
              : <><Mail size={16} /> Marcar como no leído</>}
          </button>
        </div>
      )}
    </div>
  )
}
