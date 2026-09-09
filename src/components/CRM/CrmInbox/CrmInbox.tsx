import { useState, useCallback } from 'react'
import type { CrmCategoria, CrmEstado } from '../../../types/crm'
import { useConversations } from '../../../hooks/useConversations'
import { useMessages } from '../../../hooks/useMessages'
import { sendTextMessage, markSuggestionUsed } from '../../../services/crmMessages'
import { markAsRead, updateCategoria, updateEstado } from '../../../services/crmConversations'
import ConversationList from '../ConversationList/ConversationList'
import ChatPanel from '../ChatPanel/ChatPanel'
import './CrmInbox.css'

interface CrmInboxProps {
  empleadoId: string | null
  onOpenPhotoSender: (conversacionId: string, tipo: string | null, talle: number | null) => void
  onCreateVenta: (conversacionId: string) => void
  onSendMpLink: (conversacionId: string) => void
}

export default function CrmInbox({ empleadoId, onOpenPhotoSender, onCreateVenta, onSendMpLink }: CrmInboxProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [categoriaFilter, setCategoriaFilter] = useState<CrmCategoria | undefined>(undefined)
  const [sending, setSending] = useState(false)

  const { conversaciones, loading: loadingConvs, search, setSearch } = useConversations(categoriaFilter)
  const { mensajes, loading: loadingMsgs, sugerencia, setSugerencia } = useMessages(selectedId)

  const selectedConv = conversaciones.find((c) => c.id === selectedId) || null

  const handleSelect = useCallback(async (id: string) => {
    setSelectedId(id)
    try {
      await markAsRead(id)
    } catch (err) {
      console.error('Error marcando como leido:', err)
    }
  }, [])

  const handleSend = useCallback(async (text: string) => {
    if (!selectedId) return
    setSending(true)
    try {
      await sendTextMessage(selectedId, text, empleadoId)
    } catch (err) {
      console.error('Error enviando mensaje:', err)
    } finally {
      setSending(false)
    }
  }, [selectedId, empleadoId])

  const handleChangeCategoria = useCallback(async (cat: CrmCategoria) => {
    if (!selectedConv) return
    try {
      await updateCategoria(selectedConv.id, selectedConv.categoria, cat, empleadoId)
    } catch (err) {
      console.error('Error actualizando categoria:', err)
    }
  }, [selectedConv, empleadoId])

  const handleChangeEstado = useCallback(async (estado: CrmEstado) => {
    if (!selectedId) return
    try {
      await updateEstado(selectedId, estado)
    } catch (err) {
      console.error('Error actualizando estado:', err)
    }
  }, [selectedId])

  const handleUseSugerencia = useCallback(async () => {
    if (!sugerencia) return
    try {
      await markSuggestionUsed(sugerencia.id)
    } catch (err) {
      console.error('Error marcando sugerencia:', err)
    }
  }, [sugerencia])

  const handleDismissSugerencia = useCallback(() => {
    setSugerencia(null)
  }, [setSugerencia])

  const handleBack = useCallback(() => {
    setSelectedId(null)
  }, [])

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  return (
    <div className="crm-inbox">
      <div className={`crm-inbox-list${isMobile && selectedId ? ' crm-inbox-list--hidden' : ''}`}>
        <ConversationList
          conversaciones={conversaciones}
          loading={loadingConvs}
          selectedId={selectedId}
          onSelect={handleSelect}
          categoriaFilter={categoriaFilter}
          onCategoriaFilter={setCategoriaFilter}
          search={search}
          onSearch={setSearch}
        />
      </div>
      <div className={`crm-inbox-chat${isMobile && !selectedId ? ' crm-inbox-chat--hidden' : ''}`}>
        <ChatPanel
          conversacion={selectedConv}
          mensajes={mensajes}
          loading={loadingMsgs}
          sugerencia={sugerencia}
          onSend={handleSend}
          onChangeCategoria={handleChangeCategoria}
          onChangeEstado={handleChangeEstado}
          onOpenPhotos={() => {
            if (!selectedId) return
            const sug = sugerencia
            onOpenPhotoSender(selectedId, sug?.tipo_detectado || null, sug?.talle_detectado || null)
          }}
          onCreateVenta={() => { if (selectedId) onCreateVenta(selectedId) }}
          onSendMpLink={() => { if (selectedId) onSendMpLink(selectedId) }}
          onUseSugerencia={handleUseSugerencia}
          onDismissSugerencia={handleDismissSugerencia}
          sending={sending}
          onBack={handleBack}
        />
      </div>
    </div>
  )
}
