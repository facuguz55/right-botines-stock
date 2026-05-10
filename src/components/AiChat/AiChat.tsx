import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { sendMessage, TOOL_LABELS, type ChatMessage } from '../../services/aiChat'
import './AiChat.css'

interface UiMsg { role: 'user' | 'assistant' | 'tool'; content: string }
interface AiChatProps { onReload: () => void }

const WELCOME = 'Hola! Soy el asistente de Right Botines. Puedo consultar stock, agregar mercaderia, actualizar precios y ver ventas. Que necesitas?'

export function AiChat({ onReload }: AiChatProps) {
  const [open, setOpen] = useState(false)
  const [uiMsgs, setUiMsgs] = useState<UiMsg[]>([{ role: 'assistant', content: WELCOME }])
  const [apiMsgs, setApiMsgs] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [uiMsgs, open])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setUiMsgs(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)
    try {
      const { response, newApiMessages, dataChanged } = await sendMessage(
        apiMsgs,
        text,
        toolName => setUiMsgs(prev => [...prev, { role: 'tool', content: TOOL_LABELS[toolName] ?? toolName }])
      )
      setApiMsgs(newApiMessages)
      setUiMsgs(prev => [...prev, { role: 'assistant', content: response }])
      if (dataChanged) onReload()
    } catch (err: any) {
      setUiMsgs(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <>
      {open && (
        <div className="aichat-panel">
          <div className="aichat-header">
            <div className="aichat-header-dot" />
            <div className="aichat-header-info">
              <span className="aichat-header-title">Asistente IA</span>
              <span className="aichat-header-sub">Haiku · Right Botines</span>
            </div>
            <button className="aichat-close" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className="aichat-messages">
            {uiMsgs.map((msg, i) => (
              <div key={i} className={`aichat-msg aichat-msg--${msg.role}`}>{msg.content}</div>
            ))}
            {loading && (
              <div className="aichat-typing"><span /><span /><span /></div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="aichat-footer">
            <textarea
              className="aichat-input"
              placeholder="Consulta stock, agrega mercaderia..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={2}
              disabled={loading}
            />
            <button className="aichat-send" onClick={handleSend} disabled={loading || !input.trim()}>
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
      <button className={`aichat-btn${open ? ' aichat-btn--open' : ''}`} onClick={() => setOpen(o => !o)} title="Asistente IA">
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </>
  )
}
