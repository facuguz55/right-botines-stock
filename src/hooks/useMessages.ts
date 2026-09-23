import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WspMensaje, WspIaSugerencia } from '../types/crm'
import { fetchMensajes, fetchLatestSugerencia, fetchSugerenciasPorMensaje } from '../services/crmMessages'
import { playNotificationSound } from '../services/crmNotification'

export function useMessages(conversacionId: string | null) {
  const [mensajes, setMensajes] = useState<WspMensaje[]>([])
  const [loading, setLoading] = useState(false)
  const [sugerencia, setSugerencia] = useState<WspIaSugerencia | null>(null)
  // Por mensaje_id, para poder pegar el botón "mandar disponibles" al lado
  // del mensaje puntual donde el cliente preguntó por un talle.
  const [sugerenciasPorMensaje, setSugerenciasPorMensaje] = useState<Record<string, WspIaSugerencia>>({})

  const load = useCallback(async () => {
    if (!conversacionId) { setMensajes([]); return }
    setLoading(true)
    try {
      const [msgs, sug, sugsPorMsg] = await Promise.all([
        fetchMensajes(conversacionId),
        fetchLatestSugerencia(conversacionId),
        fetchSugerenciasPorMensaje(conversacionId),
      ])
      setMensajes(msgs)
      setSugerencia(sug as WspIaSugerencia | null)
      const map: Record<string, WspIaSugerencia> = {}
      for (const s of sugsPorMsg as WspIaSugerencia[]) {
        if (s.mensaje_id) map[s.mensaje_id] = s
      }
      setSugerenciasPorMensaje(map)
    } catch (err) {
      console.error('Error cargando mensajes:', err)
    } finally {
      setLoading(false)
    }
  }, [conversacionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!conversacionId) return

    const channel = supabase
      .channel(`crm-messages-${conversacionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wsp_mensajes',
          filter: `conversacion_id=eq.${conversacionId}`,
        },
        (payload) => {
          const newMsg = payload.new as WspMensaje
          // El mensaje que YO mando ya se agrega "optimista" (ver
          // addPendingMensaje) y después se reemplaza a mano con la fila
          // real (resolvePendingMensaje) — sin este chequeo, cuando el
          // realtime de este mismo insert llega, se duplicaba en la lista.
          setMensajes(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
          if (newMsg.direccion === 'in') playNotificationSound()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversacionId])

  // Muestra el mensaje en el chat al instante (antes de que termine de
  // mandarse por WhatsApp) para que no se sienta como que tarda segundos en
  // aparecer — se resuelve con la fila real cuando el envío efectivamente
  // termina, o se marca como fallido si el envío no salió.
  const addPendingMensaje = useCallback((msg: WspMensaje) => {
    setMensajes(prev => [...prev, msg])
  }, [])

  const resolvePendingMensaje = useCallback((tempId: string, real: WspMensaje) => {
    setMensajes(prev => prev.map(m => m.id === tempId ? real : m))
  }, [])

  const failPendingMensaje = useCallback((tempId: string) => {
    setMensajes(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m))
  }, [])

  // El endpoint de transcripción ya guarda el texto en la base — esto solo
  // refleja el resultado al toque sin esperar a que llegue por realtime.
  const setMensajeTranscripcion = useCallback((mensajeId: string, texto: string) => {
    setMensajes(prev => prev.map(m => m.id === mensajeId ? { ...m, transcripcion: texto } : m))
  }, [])

  // Borrar es "optimista con demora": el mensaje se oculta al toque, pero el
  // DELETE real a la base se manda recién si nadie lo deshace a tiempo (ver
  // handleDeleteMensaje en CrmInbox, que arma la ventana de "Deshacer").
  const setMensajeOculto = useCallback((mensajeId: string, oculto: boolean) => {
    setMensajes(prev => prev.map(m => m.id === mensajeId ? { ...m, _hidden: oculto } : m))
  }, [])

  return {
    mensajes, loading, reload: load, sugerencia, setSugerencia, sugerenciasPorMensaje,
    addPendingMensaje, resolvePendingMensaje, failPendingMensaje, setMensajeTranscripcion,
    setMensajeOculto,
  }
}
