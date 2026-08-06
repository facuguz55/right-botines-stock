import { useState, useEffect } from 'react'
import { Mail, Send, RefreshCw, Inbox, Edit3, X, ExternalLink, MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './TNMails.css'

interface MailMessage {
  id: string
  from_name: string
  from_email: string
  subject: string
  body: string
  created_at: string
  read: boolean
  replied: boolean
}

export function TNMails() {
  const [messages, setMessages]   = useState<MailMessage[]>([])
  const [selected, setSelected]   = useState<MailMessage | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showCompose, setCompose] = useState(false)
  const [replyTo, setReplyTo]     = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending]     = useState(false)
  const [sendMsg, setSendMsg]     = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('tn_mails')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      setMessages((data ?? []) as MailMessage[])
    } catch { /* tabla puede no existir todavía */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const markRead = async (msg: MailMessage) => {
    if (msg.read) return
    await supabase.from('tn_mails').update({ read: true }).eq('id', msg.id)
    setMessages(ms => ms.map(m => m.id === msg.id ? { ...m, read: true } : m))
  }

  const handleSelect = (msg: MailMessage) => {
    setSelected(msg)
    markRead(msg)
    setReplyTo(msg.from_email)
    setReplySubject(`Re: ${msg.subject}`)
    setReplyBody('')
    setCompose(false)
  }

  const handleReply = async () => {
    if (!replyBody.trim() || !replyTo) return
    setSending(true)
    setSendMsg('')
    try {
      const mailto = `mailto:${replyTo}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(replyBody)}`
      window.open(mailto, '_blank')
      if (selected) {
        await supabase.from('tn_mails').update({ replied: true }).eq('id', selected.id)
        setMessages(ms => ms.map(m => m.id === selected.id ? { ...m, replied: true } : m))
        setSelected(s => s ? { ...s, replied: true } : null)
      }
      setSendMsg('✓ Se abrió tu cliente de email para enviar la respuesta.')
    } catch {
      setSendMsg('⚠ Error al preparar el email.')
    } finally {
      setSending(false)
    }
  }

  const unread = messages.filter(m => !m.read).length

  return (
    <div className="tn-mails">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mails</h1>
          <p className="page-subtitle">
            {messages.length} mensajes{unread > 0 ? ` · ${unread} sin leer` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={13} /> Actualizar
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setCompose(true); setSelected(null) }}>
            <Edit3 size={13} /> Redactar
          </button>
        </div>
      </div>

      {/* Setup banner si la tabla no está configurada */}
      {messages.length === 0 && !loading && (
        <div className="tn-mails-setup-banner">
          <div className="tn-mails-setup-icon"><Mail size={24} /></div>
          <div className="tn-mails-setup-content">
            <p className="tn-mails-setup-title">Configurar bandeja de entrada</p>
            <p className="tn-mails-setup-desc">
              Para recibir mensajes de clientes acá, creá la tabla <code>tn_mails</code> en Supabase y configurá el webhook
              en TiendaNube para que reenvíe las consultas a esta app.
            </p>
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ width: 'fit-content' }}
            >
              <ExternalLink size={12} /> Ir a Supabase
            </a>
          </div>
        </div>
      )}

      {/* Guía de contacto alternativo */}
      <div className="tn-mails-help">
        <MessageSquare size={13} />
        <span>
          También podés responder consultas directamente desde{' '}
          <a href={`https://www.tiendanube.com/admin/contacts`} target="_blank" rel="noreferrer">
            el panel de TiendaNube <ExternalLink size={10} />
          </a>
        </span>
      </div>

      <div className="tn-mails-layout">
        {/* Inbox list */}
        <div className="tn-inbox">
          {loading && <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '.875rem' }}>Cargando...</div>}
          {messages.length === 0 && !loading && (
            <div className="tn-inbox-empty">
              <Inbox size={32} />
              <p>Sin mensajes todavía</p>
            </div>
          )}
          {messages.map(m => (
            <div
              key={m.id}
              className={`tn-mail-item${selected?.id === m.id ? ' active' : ''}${!m.read ? ' unread' : ''}`}
              onClick={() => handleSelect(m)}
            >
              <div className="tn-mail-header">
                <span className="tn-mail-from">{m.from_name || m.from_email}</span>
                <span className="tn-mail-date">
                  {new Date(m.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
              <p className="tn-mail-subject">{m.subject}</p>
              <p className="tn-mail-preview">{m.body.slice(0, 80)}...</p>
              {m.replied && <span className="tn-mail-replied">↩ Respondido</span>}
            </div>
          ))}
        </div>

        {/* Reading / Compose pane */}
        <div className="tn-mail-pane">
          {!selected && !showCompose && (
            <div className="tn-pane-empty">
              <Mail size={40} />
              <p>Seleccioná un mensaje para leerlo</p>
            </div>
          )}

          {/* Lector */}
          {selected && !showCompose && (
            <div className="tn-mail-reader">
              <div className="tn-reader-header">
                <div>
                  <h3 className="tn-reader-subject">{selected.subject}</h3>
                  <p className="tn-reader-from">
                    De: <strong>{selected.from_name}</strong> &lt;{selected.from_email}&gt;
                  </p>
                  <p className="tn-reader-date">
                    {new Date(selected.created_at).toLocaleString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })}
                  </p>
                </div>
              </div>
              <div className="tn-reader-body">{selected.body}</div>

              {/* Reply box */}
              <div className="tn-reply-box">
                <p className="tn-reply-label">Responder a {selected.from_email}</p>
                <div className="form-group">
                  <label>Asunto</label>
                  <input type="text" value={replySubject} onChange={e => setReplySubject(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Mensaje</label>
                  <textarea
                    rows={5}
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    placeholder="Escribí tu respuesta acá..."
                  />
                </div>
                {sendMsg && <p className="tn-send-msg">{sendMsg}</p>}
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleReply}
                    disabled={sending || !replyBody.trim()}
                  >
                    <Send size={13} /> {sending ? 'Enviando...' : 'Responder'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Compose */}
          {showCompose && (
            <div className="tn-compose">
              <div className="tn-compose-header">
                <h3>Nuevo mensaje</h3>
                <button className="tn-compose-close" onClick={() => setCompose(false)}><X size={16} /></button>
              </div>
              <div className="tn-compose-form">
                <div className="form-group">
                  <label>Para</label>
                  <input type="email" value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="email@cliente.com" />
                </div>
                <div className="form-group">
                  <label>Asunto</label>
                  <input type="text" value={replySubject} onChange={e => setReplySubject(e.target.value)} placeholder="Asunto del mensaje" />
                </div>
                <div className="form-group">
                  <label>Mensaje</label>
                  <textarea rows={8} value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Escribí acá..." />
                </div>
                {sendMsg && <p className="tn-send-msg">{sendMsg}</p>}
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button className="btn btn-primary" onClick={handleReply} disabled={!replyBody.trim() || !replyTo}>
                    <Send size={13} /> Enviar
                  </button>
                  <button className="btn btn-secondary" onClick={() => setCompose(false)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
