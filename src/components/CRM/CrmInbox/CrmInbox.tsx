import { useState, useCallback, useEffect, useRef } from 'react'
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
    mensajes, loading: loadingMsgs, sugerencia, setSugerencia, sugerenciasPorMensaje,
    addPendingMensaje, resolvePendingMensaje, failPendingMensaje, setMensajeTranscripcion,
    setMensajeOculto,
  } = useMessages(selectedId)

  // Deshacer borrado: el mensaje se oculta al toque, pero el DELETE real
  // recién se manda si nadie lo deshace dentro de este tiempo.
  const UNDO_MS = 5000
  const [undoDelete, setUndoDelete] = useState<{ mensajeId: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Si ya había otro borrado esperando "deshacer" y llega uno nuevo, el
  // anterior se confirma ya (no se acumulan ventanas de deshacer).
  const finalizarBorrado = useCallback(async (mensajeId: string) => {
    try {
      await deleteMensaje(mensajeId)
    } catch (err) {
      console.error('Error borrando mensaje:', err)
    }
  }, [])

  const handleDeleteMensaje = useCallback((mensajeId: string) => {
    if (undoDelete && undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      finalizarBorrado(undoDelete.mensajeId)
    }
    setMensajeOculto(mensajeId, true)
    setUndoDelete({ mensajeId })
    undoTimerRef.current = setTimeout(() => {
      finalizarBorrado(mensajeId)
      setUndoDelete(null)
    }, UNDO_MS)
  }, [undoDelete, finalizarBorrado, setMensajeOculto])

  const handleUndoDelete = useCallback(() => {
    if (!undoDelete) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setMensajeOculto(undoDelete.mensajeId, false)
    setUndoDelete(null)
  }, [undoDelete, setMensajeOculto])

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

  // Reactivo: antes se calculaba una sola vez por render con window.innerWidth
  // y no reaccionaba al girar el celular o cambiar el tamaño de la ventana.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // El botón "atrás" del celular (o el gesto de volver) tiene que cerrar el
  // chat y volver a la lista, no sacarte de la app. Al abrir un chat en
  // mobile se agrega una entrada al historial; volver la consume.
  const pushedHistoryRef = useRef(false)
  useEffect(() => {
    if (!isMobile || !selectedId) return
    if (!pushedHistoryRef.current) {
      window.history.pushState({ crmChat: true }, '')
      pushedHistoryRef.current = true
    }
    const onPop = () => {
      pushedHistoryRef.current = false
      setSelectedId(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [isMobile, selectedId])

  const handleBack = useCallback(() => {
    if (pushedHistoryRef.current) window.history.back()
    else setSelectedId(null)
  }, [])

  // Con el chat a pantalla completa en mobile, el teclado achica el viewport
  // visible pero no el layout: sin esto el campo de escribir quedaba tapado
  // por el teclado. Se sigue el visualViewport y se lo pasa por CSS.
  useEffect(() => {
    if (!isMobile || !selectedId) return
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      root.style.setProperty('--crm-vv-height', `${vv.height}px`)
      root.style.setProperty('--crm-vv-top', `${vv.offsetTop}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--crm-vv-height')
      root.style.removeProperty('--crm-vv-top')
    }
  }, [isMobile, selectedId])

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
      <div className={`crm-inbox-chat${isMobile && !selectedId ? ' crm-inbox-chat--hidden' : ''}${isMobile && selectedId ? ' crm-inbox-chat--open' : ''}`}>
        <ChatPanel
          conversacion={selectedConv}
          mensajes={mensajes}
          loading={loadingMsgs}
          sugerencia={sugerencia}
          onSend={handleSend}
          onChangeCategoria={handleChangeCategoria}
          onChangeEstado={handleChangeEstado}
          onOpenPhotos={(tipo, talle) => {
            if (!selectedId || !selectedConv) return
            onOpenPhotoSender(selectedId, tipo ?? null, talle ?? null, selectedConv.wa_contact_id)
          }}
          onCreateVenta={() => { if (selectedId) onCreateVenta(selectedId) }}
          onSendMpLink={() => { if (selectedId) onSendMpLink(selectedId) }}
          onUseSugerencia={handleUseSugerencia}
          onDismissSugerencia={handleDismissSugerencia}
          onDeleteMensaje={handleDeleteMensaje}
          onRename={handleRename}
          onTranscribed={setMensajeTranscripcion}
          sugerenciasPorMensaje={sugerenciasPorMensaje}
          undoDelete={undoDelete}
          onUndoDelete={handleUndoDelete}
          sending={sending}
          onBack={handleBack}
        />
      </div>
    </div>
  )
}
