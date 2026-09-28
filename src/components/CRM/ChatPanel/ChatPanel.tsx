import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Camera, Plus, DollarSign, Bot, X, ChevronDown, MessageSquare, Trash2, MoreVertical, Footprints, Pencil, MessageCircleQuestion, Loader2, Package } from 'lucide-react'
import type { WspConversacion, WspMensaje, WspIaSugerencia, CrmCategoria, CrmEstado } from '../../../types/crm'
import { CRM_CATEGORIAS, CRM_ESTADOS } from '../../../types/crm'
import { TIPO_LABEL, busquedaVigente, etiquetaModelo, normalizeTipo, textoPreguntarTalle, textoPreguntarTipo } from '../../../lib/crmBusqueda'
import { AudioMessage } from './AudioMessage'
import { OrdersPanel } from '../OrdersPanel/OrdersPanel'
import './ChatPanel.css'

interface ChatPanelProps {
  conversacion: WspConversacion | null
  mensajes: WspMensaje[]
  loading: boolean
  sugerencia: WspIaSugerencia | null
  onSend: (text: string) => Promise<void>
  onChangeCategoria: (cat: CrmCategoria) => void
  onChangeEstado: (estado: CrmEstado) => void
  onOpenPhotos: (tipo?: string | null, talle?: number | null, modelo?: string | null) => void
  onCreateVenta: () => void
  onSendMpLink: () => void
  onUseSugerencia: () => void
  onDismissSugerencia: () => void
  onDeleteMensaje: (mensajeId: string) => void
  onRename: (nombre: string) => void
  onTranscribed: (mensajeId: string, texto: string) => void
  onClearBusqueda: () => void
  sugerenciasPorMensaje: Record<string, WspIaSugerencia>
  undoDelete: { mensajeId: string } | null
  onUndoDelete: () => void
  sending: boolean
  onBack?: () => void
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatPanel({
  conversacion,
  mensajes,
  loading,
  sugerencia,
  onSend,
  onChangeCategoria,
  onChangeEstado,
  onOpenPhotos,
  onCreateVenta,
  onSendMpLink,
  onUseSugerencia,
  onDismissSugerencia,
  onDeleteMensaje,
  onRename,
  onTranscribed,
  onClearBusqueda,
  sugerenciasPorMensaje,
  undoDelete,
  onUndoDelete,
  sending,
  onBack,
}: ChatPanelProps) {
  const [text, setText] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  // Respuestas rápidas ya tocadas: el botón se oculta al toque, sin esperar a
  // que llegue el mensaje enviado (evita mandarla dos veces con doble click).
  const [quickRepliesUsadas, setQuickRepliesUsadas] = useState<Set<string>>(new Set())
  const [pedidosOpen, setPedidosOpen] = useState(false)

  // Mensajes del cliente que llegan con el chat abierto: la IA tarda unos
  // segundos en leerlos (el webhook espera hasta 8 s), y en ese rato se
  // muestra un circulito de carga donde van a aparecer los botones. Lo que
  // ya estaba al abrir el chat no cuenta como recién llegado; y si en
  // IA_ESPERA_MS no llegó nada (mensaje sin nada que sugerir, o la IA
  // falló), el circulito se va solo.
  const IA_ESPERA_MS = 12000
  const llegadaRef = useRef<Map<string, number>>(new Map())
  const baseRef = useRef<{ convId: string | null; vioCarga: boolean; listo: boolean }>({ convId: null, vioCarga: false, listo: false })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const convId = conversacion?.id ?? null
    if (baseRef.current.convId !== convId) {
      baseRef.current = { convId, vioCarga: false, listo: false }
      llegadaRef.current = new Map()
    }
    // Hasta que no se vio cargar esta conversación, los mensajes en pantalla
    // pueden ser todavía los del chat anterior.
    if (loading) { baseRef.current.vioCarga = true; return }
    if (!baseRef.current.vioCarga) return
    const ahora = Date.now()
    let hayNuevos = false
    for (const m of mensajes) {
      if (m.direccion !== 'in' || m.conversacion_id !== convId || llegadaRef.current.has(m.id)) continue
      llegadaRef.current.set(m.id, baseRef.current.listo ? ahora : 0)
      if (baseRef.current.listo) hayNuevos = true
    }
    baseRef.current.listo = true
    if (hayNuevos) setTick(t => t + 1)
  }, [mensajes, loading, conversacion?.id])

  useEffect(() => {
    let proximo = Infinity
    const ahora = Date.now()
    for (const [id, llegada] of llegadaRef.current) {
      if (!llegada || sugerenciasPorMensaje[id]) continue
      const resta = llegada + IA_ESPERA_MS - ahora
      if (resta > 0) proximo = Math.min(proximo, resta)
    }
    if (proximo === Infinity) return
    const timer = setTimeout(() => setTick(t => t + 1), proximo + 50)
    return () => clearTimeout(timer)
  }, [mensajes, sugerenciasPorMensaje, tick])
  const [renaming, setRenaming] = useState(false)
  const [nombreDraft, setNombreDraft] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!openMenuId) return
    const closeMenu = () => setOpenMenuId(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openMenuId])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  // Al abrir una conversación el scroll tiene que caer directo abajo — antes
  // hacía la animación "smooth" desde arriba atravesando toda la charla, que
  // en un chat largo (y más en mobile) se veía como un viaje raro. Solo los
  // mensajes nuevos que llegan con el chat ya abierto se animan.
  const wasLoadingRef = useRef(true)
  useEffect(() => {
    const justLoaded = wasLoadingRef.current && !loading
    wasLoadingRef.current = loading
    scrollToBottom(justLoaded ? 'auto' : 'smooth')
  }, [mensajes, loading, scrollToBottom])

  useEffect(() => {
    setRenaming(false)
    setPedidosOpen(false)
  }, [conversacion?.id])

  // "Usar en el mensaje" del panel de pedidos: el texto queda en el campo
  // para revisarlo/editarlo antes de mandarlo (no se manda solo).
  const usarTexto = (texto: string) => {
    setText(texto)
    setPedidosOpen(false)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
      el.focus()
    })
  }

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await onSend(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Ctrl+Enter (o Shift+Enter) inserta un salto de línea — el comportamiento
    // por default del textarea ya hace eso, no hace falta código extra acá.
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const handleUseSugerencia = () => {
    if (sugerencia?.respuesta_sugerida) {
      setText(sugerencia.respuesta_sugerida)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
      }
    }
    onUseSugerencia()
  }

  const handleQuickReply = (mensajeId: string, texto: string) => {
    setQuickRepliesUsadas(prev => new Set(prev).add(mensajeId))
    // Si el cartel de "respuesta sugerida" de abajo es de este mismo mensaje,
    // se cierra: ya se respondió, y así no se manda dos veces lo mismo.
    if (sugerencia?.mensaje_id === mensajeId) onDismissSugerencia()
    onSend(texto)
  }

  if (!conversacion) {
    return (
      <div className="chat-panel">
        <div className="chat-panel-empty">
          <div className="chat-panel-empty-icon">
            <MessageSquare size={32} />
          </div>
          <p className="chat-panel-empty-title">Seleccioná una conversación</p>
          <p className="chat-panel-empty-hint">Elegí un chat de la lista para ver los mensajes y responder</p>
        </div>
      </div>
    )
  }

  const busquedaActual = busquedaVigente(conversacion)
  const busqueda = busquedaActual.talle || busquedaActual.tipo || busquedaActual.modelo ? busquedaActual : null

  const visibles = mensajes.filter(m => !m._hidden)
  // Si ya se le contestó algo al cliente después de un mensaje, la respuesta
  // rápida de ese mensaje deja de tener sentido y se oculta.
  let ultimoOutIdx = -1
  visibles.forEach((m, i) => { if (m.direccion === 'out') ultimoOutIdx = i })

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <div className="chat-panel-header-info">
          {onBack && (
            <button className="chat-panel-back" onClick={onBack}>
              <ChevronDown size={20} style={{ transform: 'rotate(90deg)' }} />
            </button>
          )}
          <div>
            {renaming ? (
              <input
                className="chat-panel-header-rename-input"
                autoFocus
                value={nombreDraft}
                onChange={(e) => setNombreDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onRename(nombreDraft); setRenaming(false) }
                  if (e.key === 'Escape') setRenaming(false)
                }}
                onBlur={() => { onRename(nombreDraft); setRenaming(false) }}
              />
            ) : (
              <div
                className="chat-panel-header-name chat-panel-header-name--editable"
                title="Click para renombrar (solo en el CRM)"
                onClick={() => {
                  setNombreDraft(conversacion.nombre_personalizado || conversacion.nombre || '')
                  setRenaming(true)
                }}
              >
                {conversacion.nombre_personalizado || conversacion.nombre || conversacion.telefono || 'Sin nombre'}
                <Pencil size={11} className="chat-panel-header-rename-icon" />
              </div>
            )}
            {conversacion.telefono && (
              <div className="chat-panel-header-phone">{conversacion.telefono}</div>
            )}
            {busqueda && (
              <div className="chat-panel-busqueda">
                <button
                  className="chat-panel-busqueda-main"
                  title="Lo que busca el cliente según la charla (lo detecta la IA). Click para mandar las fotos con este filtro."
                  onClick={() => onOpenPhotos(busqueda.tipo, busqueda.talle, busqueda.modelo)}
                >
                  <Footprints size={12} />
                  Busca: {[busqueda.modelo && etiquetaModelo(busqueda.modelo), busqueda.talle && `talle ${busqueda.talle}`, busqueda.tipo && TIPO_LABEL[busqueda.tipo]].filter(Boolean).join(' · ')}
                </button>
                <button
                  className="chat-panel-busqueda-clear"
                  title="Borrar lo que busca (si la IA entendió mal o arranca otra consulta)"
                  onClick={onClearBusqueda}
                >
                  <X size={11} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="chat-panel-header-selects">
          <select
            className="chat-panel-select"
            value={conversacion.categoria}
            onChange={(e) => onChangeCategoria(e.target.value as CrmCategoria)}
          >
            {CRM_CATEGORIAS.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            className="chat-panel-select"
            value={conversacion.estado}
            onChange={(e) => onChangeEstado(e.target.value as CrmEstado)}
          >
            {CRM_ESTADOS.map((est) => (
              <option key={est} value={est}>{est}</option>
            ))}
          </select>
        </div>

        <div className="chat-panel-header-actions">
          <button
            className={`chat-panel-action-btn${pedidosOpen ? ' chat-panel-action-btn--active' : ''}`}
            onClick={() => setPedidosOpen(o => !o)}
            title="Pedidos de la tienda web de este cliente (estado, seguimiento, cuándo llega)"
          >
            <Package size={16} />
          </button>
          <button className="chat-panel-action-btn" onClick={() => onOpenPhotos()} title="Enviar fotos">
            <Camera size={16} />
          </button>
          <button className="chat-panel-action-btn" onClick={onCreateVenta} title="Crear venta">
            <Plus size={16} />
          </button>
          <button className="chat-panel-action-btn" onClick={onSendMpLink} title="Link de Mercado Pago">
            <DollarSign size={16} />
          </button>
        </div>
      </div>

      <div className="chat-panel-messages">
        {loading ? (
          <div className="chat-panel-loading">Cargando mensajes...</div>
        ) : visibles.length === 0 ? (
          <div className="chat-panel-messages-empty">
            No se mandó ningún mensaje todavía.<br />Iniciá la conversación.
          </div>
        ) : (
          <>
            {visibles.map((msg, idx) => {
              const sug = msg.direccion === 'in' ? sugerenciasPorMensaje[msg.id] : undefined
              const talleSug = sug?.talle_detectado ?? null
              const tipoSug = normalizeTipo(sug?.tipo_detectado)
              const modeloSug = sug?.modelo_buscado || null
              // Respuesta rápida: la que calculó el webhook según lo que falta
              // y el stock real ("¿para qué cancha?", "¿qué talle usás?", "te
              // paso los F50 que tenemos en 40", "no nos queda en 47").
              // Consulta por un pedido ya hecho: el webhook armó la respuesta con
              // los datos reales del pedido (o pide el número si no lo encontró).
              const esConsultaPedido = sug?.intencion === 'estado_pedido' || sug?.intencion === 'garantia' || sug?.intencion === 'reclamo'
              const quickReply = talleSug || tipoSug || modeloSug
                ? (sug?.respuesta_sugerida || (talleSug ? textoPreguntarTipo(talleSug) : textoPreguntarTalle(tipoSug)))
                : sug?.intencion === 'estado_pedido' ? sug.respuesta_sugerida : null
              const mostrarQuickReply = !!quickReply && idx > ultimoOutIdx && !quickRepliesUsadas.has(msg.id)
              const llegada = llegadaRef.current.get(msg.id)
              const esperandoIA = msg.direccion === 'in' && !!msg.contenido && !sug && !!llegada && Date.now() - llegada < IA_ESPERA_MS
              const detalleFotos = [
                modeloSug && etiquetaModelo(modeloSug),
                talleSug && `talle ${talleSug}`,
                tipoSug ? TIPO_LABEL[tipoSug] : 'todos los tipos (conviene preguntar el tipo antes)',
              ].filter(Boolean).join(' · ')
              return (
              <div
                key={msg.id}
                className={`chat-panel-msg chat-panel-msg--${msg.direccion}${msg._pending ? ' chat-panel-msg--pending' : ''}${msg._failed ? ' chat-panel-msg--failed' : ''}`}
              >
                <div className="chat-panel-msg-row">
                <div className="chat-panel-msg-bubble">
                  <div className="chat-panel-msg-menu">
                    <button
                      className="chat-panel-msg-menu-btn"
                      title="Opciones"
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(prev => prev === msg.id ? null : msg.id) }}
                    >
                      <MoreVertical size={13} />
                    </button>
                    {openMenuId === msg.id && (
                      <div className="chat-panel-msg-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="chat-panel-msg-menu-item chat-panel-msg-menu-item--danger"
                          onClick={() => { setOpenMenuId(null); onDeleteMensaje(msg.id) }}
                        >
                          <Trash2 size={13} /> Borrar
                        </button>
                      </div>
                    )}
                  </div>
                  {msg.tipo === 'image' && msg.media_url && (
                    <img
                      src={msg.media_url}
                      alt="Imagen"
                      className="chat-panel-msg-image"
                      loading="lazy"
                    />
                  )}
                  {msg.tipo === 'audio' && msg.media_url && (
                    <AudioMessage
                      mensajeId={msg.id}
                      mediaUrl={msg.media_url}
                      transcripcion={msg.transcripcion}
                      onTranscribed={onTranscribed}
                    />
                  )}
                  {msg.tipo === 'audio' && !msg.media_url && (
                    <div className="chat-panel-msg-audio">
                      {msg.transcripcion || '(audio sin transcripción)'}
                    </div>
                  )}
                  {msg.contenido && <span>{msg.contenido}</span>}
                </div>
                {esperandoIA && (
                  <span className="chat-panel-msg-ia-loading" title="La IA está leyendo el mensaje…">
                    <Loader2 size={15} />
                  </span>
                )}
                {(mostrarQuickReply || talleSug != null || esConsultaPedido) && (
                  <div className="chat-panel-msg-actions">
                    {mostrarQuickReply && quickReply && (
                      <button
                        className="chat-panel-msg-talle-btn chat-panel-msg-quick-btn"
                        title={`Responder con: "${quickReply}"`}
                        onClick={() => handleQuickReply(msg.id, quickReply)}
                      >
                        <MessageCircleQuestion size={15} />
                      </button>
                    )}
                    {esConsultaPedido && (
                      <button
                        className="chat-panel-msg-talle-btn chat-panel-msg-orders-btn"
                        title="Ver los pedidos de la tienda web de este cliente"
                        onClick={() => setPedidosOpen(true)}
                      >
                        <Package size={15} />
                      </button>
                    )}
                    {talleSug != null && (
                      <button
                        className="chat-panel-msg-talle-btn"
                        title={`Mandar fotos de los modelos con stock: ${detalleFotos}`}
                        onClick={() => onOpenPhotos(tipoSug, talleSug, modeloSug)}
                      >
                        <Footprints size={15} />
                      </button>
                    )}
                  </div>
                )}
                </div>
                <span className="chat-panel-msg-time">
                  {msg._pending ? 'Enviando...' : msg._failed ? 'No se pudo enviar' : formatTime(msg.timestamp)}
                </span>
              </div>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {undoDelete && (
        <div className="chat-panel-undo-snackbar">
          <span>Mensaje borrado del historial.</span>
          <button onClick={onUndoDelete}>Deshacer</button>
        </div>
      )}

      {sugerencia && sugerencia.respuesta_sugerida && (
        <div className="chat-panel-suggestion">
          <Bot size={16} className="chat-panel-suggestion-icon" />
          <span className="chat-panel-suggestion-text">{sugerencia.respuesta_sugerida}</span>
          <button
            className="chat-panel-suggestion-btn chat-panel-suggestion-btn--use"
            onClick={handleUseSugerencia}
          >
            Usar
          </button>
          <button className="chat-panel-suggestion-btn" onClick={onDismissSugerencia}>
            <X size={12} />
          </button>
        </div>
      )}

      <div className="chat-panel-input">
        <textarea
          ref={textareaRef}
          className="chat-panel-textarea"
          placeholder="Escribir mensaje... (Enter para enviar, Ctrl+Enter para saltar de línea)"
          value={text}
          onChange={handleTextareaInput}
          onKeyDown={handleKeyDown}
          // Cuando se abre el teclado el viewport se achica: esperar a que
          // termine de animarse y dejar visible el último mensaje.
          onFocus={() => setTimeout(() => scrollToBottom('smooth'), 300)}
          rows={1}
        />
        <button
          className="chat-panel-send-btn"
          onClick={handleSend}
          disabled={!text.trim() || sending}
        >
          <Send size={18} />
        </button>
      </div>

      {pedidosOpen && (
        <OrdersPanel
          conversacion={conversacion}
          onUsarTexto={usarTexto}
          onClose={() => setPedidosOpen(false)}
        />
      )}
    </div>
  )
}
