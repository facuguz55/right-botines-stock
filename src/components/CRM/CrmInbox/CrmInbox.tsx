import { useState, useCallback, useEffect } from 'react'
import type { CrmCategoria, CrmEstado, WspMensaje } from '../../../types/crm'
import { useConversations } from '../../../hooks/useConversations'
import { useMessages } from '../../../hooks/useMessages'
import { sendTextMessage, markSuggestionUsed, deleteMensaje } from '../../../services/crmMessages'
import { markAsRead, updateCategoria, updateEstado, renameConversacion, startOrGetConversacion } from '../../../services/crmConversations'
import ConversationList from '../ConversationList/ConversationList'
import ChatPanel from '../ChatPanel/ChatPanel'
import './CrmInbox.css'

interface CrmInboxProps {
  empleadoId: string | null
  onOpenPhotoSender: (conversacionId: string, tipo: string | null, talle: number | null, waContactId: string) => void
  onCreateVenta: (conversacionId: string) => void
  onSendMpLink: (conversacionId: string) => void
  // Deep link desde otras secciones (Preventa, Clientes locales): al llegar
  // un target nuevo, se busca/crea la conversación de ese número y se
  // selecciona directo, sin que el usuario tenga que buscarla a mano.
  openTarget?: { numero: string; nombre: string | null } | null
  onOpenTargetHandled?: () => void
}

export default function CrmInbox({ empleadoId, onOpenPhotoSender, onCreateVenta, onSendMpLink, openTarget, onOpenTargetHandled }: CrmInboxProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [categoriaFilter, setCategoriaFilter] = useState<CrmCategoria | undefined>(undefined)
  const [sending, setSending] = useState(false)

  const { conversaciones, loading: loadingConvs, search, setSearch, reload: reloadConversaciones } = useConversations(categoriaFilter)
  const {
    mensajes, loading: loadingMsgs, sugerencia, setSugerencia, reload: reloadMensajes,
    addPendingMensaje, resolvePendingMensaje, failPendingMensaje,
  } = useMessages(selectedId)

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
    if (!selectedId || !selectedConv) return

    // Aparece en el chat al toque (con un ícono de "enviando") en vez de
    // esperar el viaje completo a la API de WhatsApp + guardado en la base,
    // que es lo que hacía sentir la demora de unos segundos.
    const tempId = `temp-${Date.now()}`
    const optimistic: WspMensaje = {
      id: tempId,
      conversacion_id: selectedId,
      direccion: 'out',
      tipo: 'text',
      contenido: text,
      transcripcion: null,
      media_url: null,
      wa_message_id: null,
      enviado_por: empleadoId,
      timestamp: new Date().toISOString(),
      _pending: true,
    }
    addPendingMensaje(optimistic)

    setSending(true)
    try {
      const real = await sendTextMessage(selectedId, text, empleadoId, selectedConv.wa_contact_id)
      resolvePendingMensaje(tempId, real)
    } catch (err) {
      console.error('Error enviando mensaje:', err)
      failPendingMensaje(tempId)
      alert(err instanceof Error ? err.message : 'No se pudo enviar el mensaje por WhatsApp')
    } finally {
      setSending(false)
    }
  }, [selectedId, selectedConv, empleadoId, addPendingMensaje, resolvePendingMensaje, failPendingMensaje])

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

  const handleStartConversacion = useCallback(async (numero: string, nombre: string | null) => {
    const conv = await startOrGetConversacion(numero, nombre)
    await reloadConversaciones()
    setSelectedId(conv.id)
  }, [reloadConversaciones])

  useEffect(() => {
    if (!openTarget) return
    handleStartConversacion(openTarget.numero, openTarget.nombre)
      .catch(err => { console.error('Error abriendo conversación desde deep link:', err); alert('No se pudo abrir la conversación.') })
      .finally(() => onOpenTargetHandled?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTarget])

  const handleRename = useCallback(async (nombre: string) => {
    if (!selectedId) return
    try {
      await renameConversacion(selectedId, nombre)
    } catch (err) {
      console.error('Error renombrando chat:', err)
      alert('No se pudo renombrar el chat.')
    }
  }, [selectedId])

  const handleDeleteMensaje = useCallback(async (mensajeId: string) => {
    try {
      await deleteMensaje(mensajeId)
      await reloadMensajes()
    } catch (err) {
      console.error('Error borrando mensaje:', err)
      alert('No se pudo borrar el mensaje.')
    }
  }, [reloadMensajes])

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
          onStartConversacion={handleStartConversacion}
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
            if (!selectedId || !selectedConv) return
            const sug = sugerencia
            onOpenPhotoSender(selectedId, sug?.tipo_detectado || null, sug?.talle_detectado || null, selectedConv.wa_contact_id)
          }}
          onCreateVenta={() => { if (selectedId) onCreateVenta(selectedId) }}
          onSendMpLink={() => { if (selectedId) onSendMpLink(selectedId) }}
          onUseSugerencia={handleUseSugerencia}
          onDismissSugerencia={handleDismissSugerencia}
          onDeleteMensaje={handleDeleteMensaje}
          onRename={handleRename}
          sending={sending}
          onBack={handleBack}
        />
      </div>
    </div>
  )
}
