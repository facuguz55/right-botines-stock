import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Camera, Plus, DollarSign, Bot, X, ChevronDown, MessageSquare } from 'lucide-react'
import type { WspConversacion, WspMensaje, WspIaSugerencia, CrmCategoria, CrmEstado } from '../../../types/crm'
import { CRM_CATEGORIAS, CRM_ESTADOS } from '../../../types/crm'
import './ChatPanel.css'

interface ChatPanelProps {
  conversacion: WspConversacion | null
  mensajes: WspMensaje[]
  loading: boolean
  sugerencia: WspIaSugerencia | null
  onSend: (text: string) => Promise<void>
  onChangeCategoria: (cat: CrmCategoria) => void
  onChangeEstado: (estado: CrmEstado) => void
  onOpenPhotos: () => void
  onCreateVenta: () => void
  onSendMpLink: () => void
  onUseSugerencia: () => void
  onDismissSugerencia: () => void
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
  sending,
  onBack,
}: ChatPanelProps) {
  const [text, setText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [mensajes, scrollToBottom])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await onSend(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleSend()
    }
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
            <div className="chat-panel-header-name">
              {conversacion.nombre || conversacion.telefono || 'Sin nombre'}
            </div>
            {conversacion.telefono && (
              <div className="chat-panel-header-phone">{conversacion.telefono}</div>
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
          <button className="chat-panel-action-btn" onClick={onOpenPhotos} title="Enviar fotos">
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
        ) : (
          <>
            {mensajes.map((msg) => (
              <div key={msg.id} className={`chat-panel-msg chat-panel-msg--${msg.direccion}`}>
                <div className="chat-panel-msg-bubble">
                  {msg.tipo === 'image' && msg.media_url && (
                    <img
                      src={msg.media_url}
                      alt="Imagen"
                      className="chat-panel-msg-image"
                      loading="lazy"
                    />
                  )}
                  {msg.tipo === 'audio' && (
                    <div className="chat-panel-msg-audio">
                      {msg.transcripcion || '(audio sin transcripcion)'}
                    </div>
                  )}
                  {msg.contenido && <span>{msg.contenido}</span>}
                </div>
                <span className="chat-panel-msg-time">{formatTime(msg.timestamp)}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

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
          placeholder="Escribir mensaje... (Ctrl+Enter para enviar)"
          value={text}
          onChange={handleTextareaInput}
          onKeyDown={handleKeyDown}
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
    </div>
  )
}
