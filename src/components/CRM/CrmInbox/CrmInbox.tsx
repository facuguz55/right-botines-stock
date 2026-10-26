import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { CrmCategoria, CrmEstado, CrmVentaInfo, WspConversacion, WspMensaje } from '../../../types/crm'
import { useConversations } from '../../../hooks/useConversations'
import { useMessages } from '../../../hooks/useMessages'
import { registrarAprendizaje } from '../../../services/crmAprendizajes'
import { prepararFoto } from '../../../lib/crmImagen'
import { useEtiquetas } from '../../../hooks/useEtiquetas'
import { useCrmTema } from '../../../hooks/useCrmTema'
import {
  sendTextMessage, sendImageMessage, sendVideoMessage, sendDocumentMessage, uploadSalidaMedia, markSuggestionUsed, deleteMensaje,
  GUIA_TALLES_URL, MAX_VIDEO_BYTES, MAX_DOCUMENTO_BYTES,
} from '../../../services/crmMessages'
import {
  markAsRead, markAsUnread, updateCategoria, updateEstado, renameConversacion, startOrGetConversacion, clearBusqueda,
  setArchivada, setBloqueada, setSilenciada, vaciarChat, eliminarChat,
} from '../../../services/crmConversations'
import { estaSilenciada } from '../../../lib/crmSilencio'
import ConversationList, { type VistaChats } from '../ConversationList/ConversationList'
import type { AccionesChat } from '../ConversationList/ChatMenu'
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
  const { tema, alternar: alternarTema } = useCrmTema()
  const [etiquetaFilter, setEtiquetaFilter] = useState<string | undefined>(undefined)
  const { etiquetas, porConversacion, toggle: toggleEtiqueta, crear: crearEtiqueta, eliminar: eliminarEtiqueta } = useEtiquetas()

  const { conversaciones, loading: loadingConvs, search, setSearch, reload: reloadConversaciones, recargarSilencioso: refrescarConversaciones } = useConversations(categoriaFilter)
  const {
    mensajes, loading: loadingMsgs, sugerencia, setSugerencia, sugerenciasPorMensaje,
    addPendingMensaje, resolvePendingMensaje, failPendingMensaje, setMensajeTranscripcion,
    setMensajeOculto, recargarSilencioso: refrescarMensajes,
  } = useMessages(selectedId)

  const [actualizando, setActualizando] = useState(false)
  const handleActualizar = useCallback(async () => {
    setActualizando(true)
    try { await Promise.all([refrescarConversaciones(), refrescarMensajes()]) }
    finally { setActualizando(false) }
  }, [refrescarConversaciones, refrescarMensajes])

  // Deshacer borrado: el mensaje se oculta al toque, pero el DELETE real
  // recién se manda si nadie lo deshace dentro de este tiempo.
  const UNDO_MS = 5000
  const [undoDelete, setUndoDelete] = useState<{ mensajeId: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedConv = conversaciones.find((c) => c.id === selectedId) || null

  // Si se borra la etiqueta por la que se estaba filtrando, el filtro se va.
  useEffect(() => {
    if (etiquetaFilter && !etiquetas.some(e => e.id === etiquetaFilter)) setEtiquetaFilter(undefined)
  }, [etiquetas, etiquetaFilter])

  // Qué chats se ven: los de siempre, los archivados o los bloqueados. Al buscar se
  // mira en todos menos los bloqueados (como en WhatsApp, la búsqueda llega a los archivados).
  const [vista, setVista] = useState<VistaChats>('activos')
  const cantArchivados = conversaciones.filter(c => c.archivada && !c.bloqueada).length
  const cantBloqueados = conversaciones.filter(c => c.bloqueada).length
  const porVista = conversaciones.filter(c => {
    if (vista === 'bloqueados') return c.bloqueada
    if (c.bloqueada) return false
    return search.trim() ? true : vista === 'archivados' ? c.archivada : !c.archivada
  })
  const conversacionesVisibles = etiquetaFilter
    ? porVista.filter(c => porConversacion[c.id]?.some(e => e.id === etiquetaFilter))
    : porVista

  // Cantidad de mensajes sin leer: se ve en el título de la pestaña y, en la app
  // instalada, como globito en el ícono.
  // No cuenta lo archivado, bloqueado ni silenciado.
  const totalNoLeidos = conversaciones.reduce((n, c) => (c.archivada || c.bloqueada || estaSilenciada(c) ? n : n + (c.no_leidos || 0)), 0)
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
      // El bot aprende de cada respuesta: queda para que los dueños la revisen.
      void registrarAprendizaje({ conversacionId: selectedId, mensajes, sugerenciasPorMensaje, textoEnviado: text })
    } catch (err) {
      console.error('Error enviando mensaje:', err)
      failPendingMensaje(tempId)
      alert(err instanceof Error ? err.message : 'No se pudo enviar el mensaje por WhatsApp')
    } finally {
      setSending(false)
    }
  }, [selectedId, selectedConv, empleadoId, mensajes, sugerenciasPorMensaje, addPendingMensaje, resolvePendingMensaje, failPendingMensaje])

  // Fotos y archivos que Cami elige del dispositivo (rótulos de cambio,
  // comprobantes de devolución, etc.) y la guía de talles. Mismo esquema que
  // el texto: aparece al toque como "enviando" y se resuelve con el real.
  const handleSendMedia = useCallback(async (
    kind: 'image' | 'video' | 'document',
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
        : kind === 'video'
        ? await sendVideoMessage(selectedId, url, null, empleadoId, selectedConv.wa_contact_id)
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
    // Fotos: se pasan a JPG y se achican (las del celular suelen pesar más de
    // lo que WhatsApp acepta, y las de iPhone vienen en HEIC).
    if (file.type.startsWith('image/') && file.type !== 'image/gif') {
      const foto = await prepararFoto(file)
      if (foto) {
        await handleSendMedia('image', () => uploadSalidaMedia(foto), 'la foto', foto.name)
        return
      }
      // No se pudo leer: va como archivo (abajo).
    }
    // Videos: WhatsApp solo reproduce MP4 / 3GP de hasta 16 MB.
    if (file.type.startsWith('video/')) {
      if (file.size > MAX_VIDEO_BYTES) {
        alert('El video pesa más de 16 MB y WhatsApp no lo acepta. Probá con uno más corto o grabado en menor calidad.')
        return
      }
      if (/^video\/(mp4|3gpp)$/.test(file.type)) {
        await handleSendMedia('video', () => uploadSalidaMedia(file), 'el video', file.name)
        return
      }
      if (!window.confirm('Este video no está en formato MP4 (por ejemplo, un .mov de iPhone). WhatsApp se lo va a mostrar al cliente como un archivo para descargar, no como video que se reproduce. ¿Mandarlo igual?')) return
    }
    if (file.size > MAX_DOCUMENTO_BYTES) {
      alert('El archivo pesa más de 16 MB. Probá con uno más liviano.')
      return
    }
    await handleSendMedia('document', () => uploadSalidaMedia(file), 'el archivo', file.name)
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

  // Marcar como no leído: el chat queda con el contador en la lista y se sale
  // de él (si no, seguiría abierto y no se notaría).
  const handleMarkUnread = useCallback(async () => {
    if (!selectedId) return
    try {
      await markAsUnread(selectedId)
      handleBack()
    } catch (err) {
      console.error('Error marcando como no leído:', err)
      alert('No se pudo marcar como no leído.')
    }
  }, [selectedId, handleBack])

  // Menú de un chat de la lista (mantener apretado / clic derecho). Si la acción deja
  // afuera al chat que está abierto (no leído, archivar, bloquear, eliminar), se sale
  // de él: si no, seguiría abierto y no se notaría.
  const acciones: AccionesChat = useMemo(() => {
    const salirSiEsteEstaAbierto = (c: WspConversacion) => { if (selectedId === c.id) handleBack() }
    return {
      onToggleLeido: async (c) => {
        const marcarNoLeido = (c.no_leidos || 0) === 0
        try {
          if (marcarNoLeido) { await markAsUnread(c.id); salirSiEsteEstaAbierto(c) }
          else await markAsRead(c.id)
        } catch (err) {
          console.error('Error cambiando leído / no leído:', err)
          alert(marcarNoLeido ? 'No se pudo marcar como no leído.' : 'No se pudo marcar como leído.')
        }
      },
      onRenombrar: (c, nombre) => renameConversacion(c.id, nombre),
      onSilenciar: (c, hasta) => setSilenciada(c.id, hasta),
      onArchivar: async (c, archivar) => { await setArchivada(c.id, archivar); salirSiEsteEstaAbierto(c) },
      onBloquear: async (c, bloquear) => { await setBloqueada(c.id, bloquear); salirSiEsteEstaAbierto(c) },
      onVaciar: async (c) => { await vaciarChat(c.id); if (selectedId === c.id) await refrescarMensajes() },
      onEliminar: async (c) => { await eliminarChat(c.id); salirSiEsteEstaAbierto(c); await refrescarConversaciones() },
      onToggleEtiqueta: (convId, etiquetaId) => { void toggleEtiqueta(convId, etiquetaId) },
      onCrearEtiqueta: (nombre, color, convId) => crearEtiqueta(nombre, color, convId),
      onEliminarEtiqueta: (id) => { void eliminarEtiqueta(id) },
    }
  }, [selectedId, handleBack, refrescarMensajes, refrescarConversaciones, toggleEtiqueta, crearEtiqueta, eliminarEtiqueta])

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
          conversaciones={conversacionesVisibles}
          loading={loadingConvs}
          selectedId={selectedId}
          onSelect={handleSelect}
          categoriaFilter={categoriaFilter}
          onCategoriaFilter={setCategoriaFilter}
          search={search}
          onSearch={setSearch}
          onStartConversacion={handleStartConversacion}
          etiquetas={etiquetas}
          etiquetasPorConv={porConversacion}
          etiquetaFilter={etiquetaFilter}
          onEtiquetaFilter={setEtiquetaFilter}
          tema={tema}
          onToggleTema={alternarTema}
          onActualizar={handleActualizar}
          acciones={acciones}
          vista={vista}
          onVista={setVista}
          cantArchivados={cantArchivados}
          cantBloqueados={cantBloqueados}
          actualizando={actualizando}
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
          etiquetas={etiquetas}
          etiquetasDelChat={selectedId ? porConversacion[selectedId] ?? [] : []}
          onToggleEtiqueta={(etiquetaId) => { if (selectedId) toggleEtiqueta(selectedId, etiquetaId) }}
          onCrearEtiqueta={(nombre, color) => crearEtiqueta(nombre, color, selectedId ?? undefined)}
          onEliminarEtiqueta={eliminarEtiqueta}
          onMarkUnread={handleMarkUnread}
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
