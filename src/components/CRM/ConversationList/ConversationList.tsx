import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Plus, X, Loader2, RefreshCw, Sun, Moon, BellOff } from 'lucide-react'
import type { CrmTema } from '../../../lib/crmTema'
import type { WspConversacion, CrmCategoria, CrmEtiqueta } from '../../../types/crm'
import { CRM_CATEGORIAS } from '../../../types/crm'
import CategoryChip from '../CategoryChip/CategoryChip'
import EtiquetaChip from '../Etiquetas/EtiquetaChip'
import ChatMenu, { type AccionesChat } from './ChatMenu'
import { estaSilenciada } from '../../../lib/crmSilencio'
import { vibrar } from '../../../lib/haptico'
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
  // Menú de cada chat (mantener apretado / clic derecho).
  acciones: AccionesChat
  // Qué chats se ven: los de siempre, los archivados o los bloqueados.
  vista: VistaChats
  onVista: (v: VistaChats) => void
  cantArchivados: number
  cantBloqueados: number
}

export type VistaChats = 'activos' | 'archivados' | 'bloqueados'

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
  acciones,
  vista,
  onVista,
  cantArchivados,
  cantBloqueados,
}: ConversationListProps) {
  // Menú de un chat (mantener apretado en el celular, clic derecho en la compu).
  const [menu, setMenu] = useState<{ conv: WspConversacion; x: number; y: number } | null>(null)
  // El chat que se está apretando (se "hunde" un poquito mientras se espera el menú).
  const [apretandoId, setApretandoId] = useState<string | null>(null)
  const pulsacion = useRef<{ timer: number; aviso: number; x: number; y: number } | null>(null)
  const ignorarClick = useRef(false)

  const cancelarPulsacion = () => {
    if (pulsacion.current) {
      window.clearTimeout(pulsacion.current.timer)
      window.clearTimeout(pulsacion.current.aviso)
    }
    pulsacion.current = null
    setApretandoId(null)
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
      aviso: window.setTimeout(() => setApretandoId(conv.id), 140),
      timer: window.setTimeout(() => {
        pulsacion.current = null
        setApretandoId(null)
        ignorarClick.current = true
        vibrar()
        setMenu({ conv, x, y })
      }, 450),
    }
  }

  const moverPulsacion = (e: React.PointerEvent) => {
    const p = pulsacion.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelarPulsacion()
  }

  useEffect(() => cancelarPulsacion, [])

  // Si el chat del menú desaparece (se eliminó, o se archivó estando en otra vista), se cierra.
  const menuConv = menu ? conversaciones.find(c => c.id === menu.conv.id) ?? menu.conv : null

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
        {(cantArchivados > 0 || vista === 'archivados') && (
          <button
            className={`conv-list-filter-btn${vista === 'archivados' ? ' conv-list-filter-btn--active' : ''}`}
            onClick={() => onVista(vista === 'archivados' ? 'activos' : 'archivados')}
          >
            Archivados · {cantArchivados}
          </button>
        )}
        {(cantBloqueados > 0 || vista === 'bloqueados') && (
          <button
            className={`conv-list-filter-btn${vista === 'bloqueados' ? ' conv-list-filter-btn--active' : ''}`}
            onClick={() => onVista(vista === 'bloqueados' ? 'activos' : 'bloqueados')}
          >
            Bloqueados · {cantBloqueados}
          </button>
        )}
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
            <p className="conv-list-empty-text">{vista === 'activos' ? 'Sin conversaciones' : vista === 'archivados' ? 'No hay chats archivados' : 'No hay chats bloqueados'}</p>
            <p className="conv-list-empty-hint">{vista === 'activos' ? 'Cuando un cliente escriba por WhatsApp, su conversación va a aparecer acá' : 'Mantené apretado un chat para archivarlo o bloquearlo'}</p>
          </div>
        ) : (
          conversaciones.map((conv) => (
            <div
              key={conv.id}
              className={`conv-list-item${selectedId === conv.id ? ' conv-list-item--selected' : ''}${conv.no_leidos > 0 ? ' conv-list-item--unread' : ''}${apretandoId === conv.id ? ' conv-list-item--apretando' : ''}${menu?.conv.id === conv.id ? ' conv-list-item--menu' : ''}`}
              onClick={() => {
                // Después de mantener apretado, el "soltar" no tiene que abrir el chat.
                if (ignorarClick.current) { ignorarClick.current = false; return }
                onSelect(conv.id)
              }}
              onContextMenu={e => { e.preventDefault(); cancelarPulsacion(); setMenu({ conv, x: e.clientX, y: e.clientY }) }}
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
                  {estaSilenciada(conv) && <BellOff size={12} className="conv-list-mute" aria-label="Silenciado" />}
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

      {menu && menuConv && (
        <ChatMenu
          conv={menuConv}
          x={menu.x}
          y={menu.y}
          etiquetas={etiquetas}
          etiquetasDelChat={etiquetasPorConv[menuConv.id] ?? []}
          acciones={acciones}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
