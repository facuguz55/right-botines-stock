import { useState } from 'react'
import { Bug, X, CheckCircle } from 'lucide-react'
import { reportFeedback } from '../../services/errorReporter'
import './FeedbackButton.css'

const TIPOS = [
  { value: 'bug', label: 'Algo no funciona' },
  { value: 'mejora', label: 'Sugerencia / mejora' },
  { value: 'pregunta', label: 'Pregunta' },
]

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState('bug')
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSend = async () => {
    if (!texto.trim() || sending) return
    setSending(true)
    const label = TIPOS.find(t => t.value === tipo)?.label ?? tipo
    await reportFeedback(
      `[${label}] ${texto.trim()}`,
      'feedback-manual',
    )
    setSending(false)
    setSent(true)
    setTimeout(() => {
      setOpen(false)
      setSent(false)
      setTexto('')
      setTipo('bug')
    }, 2000)
  }

  return (
    <>
      <button className="feedback-fab" onClick={() => setOpen(true)} title="Reportar error o sugerencia">
        <Bug size={20} />
      </button>

      {open && (
        <div className="feedback-overlay" onClick={() => { if (!sending) setOpen(false) }}>
          <div className="feedback-modal" onClick={e => e.stopPropagation()}>
            {sent ? (
              <div className="feedback-sent">
                <CheckCircle size={40} className="feedback-sent-icon" />
                <p className="feedback-sent-text">Reporte enviado</p>
                <p className="feedback-sent-hint">Ya nos llegó, lo vamos a revisar</p>
              </div>
            ) : (
              <>
                <div className="feedback-header">
                  <span className="feedback-title">Reportar problema</span>
                  <button className="feedback-close" onClick={() => setOpen(false)}>
                    <X size={18} />
                  </button>
                </div>

                <div className="feedback-body">
                  <div>
                    <p className="feedback-label">Tipo</p>
                    <select
                      className="feedback-select"
                      value={tipo}
                      onChange={e => setTipo(e.target.value)}
                    >
                      {TIPOS.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="feedback-label">Descripción</p>
                    <textarea
                      className="feedback-textarea"
                      placeholder="Contanos qué pasó o qué mejorarías..."
                      value={texto}
                      onChange={e => setTexto(e.target.value)}
                    />
                  </div>
                </div>

                <div className="feedback-footer">
                  <button className="feedback-btn-cancel" onClick={() => setOpen(false)}>
                    Cancelar
                  </button>
                  <button
                    className="feedback-btn-send"
                    onClick={handleSend}
                    disabled={!texto.trim() || sending}
                  >
                    {sending ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
