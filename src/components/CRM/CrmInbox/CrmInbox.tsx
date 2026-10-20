import { useState, useCallback, useEffect, useRef } from 'react'
import type { CrmCategoria, CrmEstado, CrmVentaInfo, WspMensaje } from '../../../types/crm'
import { useConversations } from '../../../hooks/useConversations'
import { useMessages } from '../../../hooks/useMessages'
import {
  sendTextMessage, sendImageMessage, sendDocumentMessage, uploadSalidaMedia, markSuggestionUsed, deleteMensaje,
  GUIA_TALLES_URL, MAX_IMAGEN_BYTES, MAX_DOCUMENTO_BYTES,
} from '../../../services/crmMessages'
import { markAsRead, updateCategoria, updateEstado, renameConversacion, startOrGetConversacion, clearBusqueda } from '../../../services/crmConversations'
import ConversationList from '../ConversationList/ConversationList'
import ChatPanel from '../ChatPanel/ChatPanel'
import { MpLinkModal } from '../MpLinkModal/MpLinkModal'
import './CrmInbox.css'

interface CrmInboxProps {
  empleadoId: string | null
  onOpenPhotoSender: (conversacionId: string, tipo: string | null, talle: number | null, waContactId: string, modelo: string | null) => void
  onCreateVenta: (info: CrmVentaInfo) => void
  // Deep link desde otras secciones (Preventa, Clientes locales): al llegar
  // un target nuevo, se busca/crea la conversación de ese número y se
  // selecciona directo, sin que el usuario tenga que buscarla a mano.
  openTarget?: { numero: string; nombre: string | null } | null
  onOpenTargetHandled?: () => void
}

export default function CrmInbox({ empleadoId, onOpenPhotoSender, onCreateVenta, openTarget, onOpenTargetHandled }: CrmInboxProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [categoriaFilter, setCategoriaFilter] = useState<CrmCategoria | undefined>(undefined)
  const [sending, setSending] = useState(false)
  const [mpLinkOpen, setMpLinkOpen] = useState(false)

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

  // Cantidad de mensajes sin leer: se ve en el título de la pestaña y, en la app
  // instalada, como globito en el ícono.
  const totalNoLeidos = conversaciones.reduce((n, c) => n + (c.no_leidos || 0), 0)
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '')
    document.title = totalNoLeidos > 0 ? `(${totalNoLeidos}) ${base}` : base
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (totalNoLeidos > 0) nav.setAppBadge?.(totalNoLeidos)?.catch(() => { /* sin soporte */ })
    else nav.clearAppBadge?.()?.catch(() => { /* sin soporte */ })
  }, [totalNoLeidos])
  useEffect(() => () => {
    document.title = document.title.replace(/^\(\d+\)\s*/, '')
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> }
    nav.clearAppBadge?.()?.catch(() => { /* sin soporte */ })
  }, [])

  const handleSelect = useCallback(async (id: string) => {
    setSelectedId(id)
    try {
      await markAsRead(id)
    } catch (err) {
      console.error('Error marcando como leido:', err)
    }
  }, [])

  const handleSend = useCallback(async (text: string, contextoWaId?: string | null) => {
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
      contexto_wa_id: contextoWaId ?? null,
      enviado_por: empleadoId,
      timestamp: new Date().toISOString(),
      _pending: true,
    }
    addPendingMensaje(optimistic)

    setSending(true)
    try {
      const real = await sendTextMessage(selectedId, text, empleadoId, selectedConv.wa_contact_id, contextoWaId)
      resolvePendingMensaje(tempId, real)
    } catch (err) {
      console.error('Error enviando mensaje:', err)
      failPendingMensaje(tempId)
      alert(err instanceof Error ? err.message : 'No se pudo enviar el mensaje por WhatsApp')
    } finally {
      setSending(false)
    }
  }, [selectedId, selectedConv, empleadoId, addPendingMensaje, resolvePendingMensaje, failPendingMensaje])

  // Fotos y archivos que Cami elige del dispositivo (rótulos de cambio,
  // comprobantes de devolución, etc.) y la guía de talles. Mismo esquema que
  // el texto: aparece al toque como "enviando" y se resuelve con el real.
  const handleSendMedia = useCallback(async (
    kind: 'image' | 'document',
    mediaUrl: string | (() => Promise<string>),
    label: string,
    filename: string,
  ) => {
    if (!selectedId || !selectedConv) return
    const tempId = `temp-${Date.now()}`
    addPendingMensaje({
      id: tempId,
      conversacion_id: selectedId,
      direccion: 'out',
      tipo: kind,
      contenido: kind === 'document' ? filename : null,
      transcripcion: null,
      media_url: typeof mediaUrl === 'string' ? mediaUrl : null,
      wa_message_id: null,
      enviado_por: empleadoId,
      timestamp: new Date().toISOString(),
      _pending: true,
    })
    setSending(true)
    try {
      const url = typeof mediaUrl === 'string' ? mediaUrl : await mediaUrl()
      const real = kind === 'image'
        ? await sendImageMessage(selectedId, url, null, empleadoId, selectedConv.wa_contact_id)
        : await sendDocumentMessage(selectedId, url, filename, null, empleadoId, selectedConv.wa_contact_id)
      resolvePendingMensaje(tempId, real)
    } catch (err) {
      console.error(`Error enviando ${label}:`, err)
      failPendingMensaje(tempId)
      alert(err instanceof Error ? err.message : `No se pudo enviar ${label}`)
    } finally {
      setSending(false)
    }
  }, [selectedId, selectedConv, empleadoId, addPendingMensaje, resolvePendingMensaje, failPendingMensaje])

  const handleSendFile = useCallback(async (file: File) => {
    const esImagen = /^image\/(jpeg|png)$/.test(file.type)
    if (esImagen && file.size > MAX_IMAGEN_BYTES) {
      alert('La foto pesa más de 5 MB y WhatsApp no la acepta. Probá con una más liviana.')
      return
    }
    if (!esImagen && file.size > MAX_DOCUMENTO_BYTES) {
      alert('El archivo pesa más de 16 MB. Probá con uno más liviano.')
      return
    }
    // WhatsApp solo manda como foto JPG/PNG; el resto (WebP, HEIC, PDF, Word…) va como archivo.
    await handleSendMedia(esImagen ? 'image' : 'document', () => uploadSalidaMedia(file), 'el archivo', file.name)
  }, [handleSendMedia])

  const handleSendGuiaTalles = useCallback(
    () => handleSendMedia('image', GUIA_TALLES_URL, 'la guía de talles', 'guia-de-talles.png'),
    [handleSendMedia],
  )

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
          onOpenPhotos={(tipo, talle, modelo) => {
            if (!selectedId || !selectedConv) return
            onOpenPhotoSender(selectedId, tipo ?? null, talle ?? null, selectedConv.wa_contact_id, modelo ?? null)
          }}
          onCreateVenta={() => {
            if (!selectedId || !selectedConv) return
            onCreateVenta({
              conversacionId: selectedId,
              crmClienteId: selectedConv.crm_cliente_id,
              clienteLocalId: selectedConv.crm_clientes?.cliente_local_id ?? null,
              nombre: selectedConv.nombre_personalizado || selectedConv.nombre,
              telefono: selectedConv.telefono,
              waContactId: selectedConv.wa_contact_id,
            })
          }}
          onSendMpLink={() => setMpLinkOpen(true)}
          onSendFile={handleSendFile}
          onSendGuiaTalles={handleSendGuiaTalles}
          onUseSugerencia={handleUseSugerencia}
          onDismissSugerencia={handleDismissSugerencia}
          onDeleteMensaje={handleDeleteMensaje}
          onRename={handleRename}
          onTranscribed={setMensajeTranscripcion}
          onClearBusqueda={() => {
            if (!selectedId) return
            clearBusqueda(selectedId).catch(err => {
              console.error('Error borrando la búsqueda:', err)
              alert('No se pudo borrar lo que busca el cliente.')
            })
          }}
          sugerenciasPorMensaje={sugerenciasPorMensaje}
          undoDelete={undoDelete}
          onUndoDelete={handleUndoDelete}
          sending={sending}
          onBack={handleBack}
        />
      </div>
      <MpLinkModal
        isOpen={mpLinkOpen}
        onClose={() => setMpLinkOpen(false)}
        onSend={handleSend}
      />
    </div>
  )
}
