import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WspMensaje, WspIaSugerencia } from '../types/crm'
import { fetchMensajes, fetchLatestSugerencia, fetchSugerenciasPorMensaje } from '../services/crmMessages'
import { useRefrescoAutomatico } from './useRefrescoAutomatico'
import { playNotificationSound } from '../services/crmNotification'

export function useMessages(conversacionId: string | null) {
  const [mensajes, setMensajes] = useState<WspMensaje[]>([])
  const [loading, setLoading] = useState(false)
  const [sugerencia, setSugerencia] = useState<WspIaSugerencia | null>(null)
  // Por mensaje_id, para poder pegar el botón "mandar disponibles" al lado
  // del mensaje puntual donde el cliente preguntó por un talle.
  const [sugerenciasPorMensaje, setSugerenciasPorMensaje] = useState<Record<string, WspIaSugerencia>>({})

  const load = useCallback(async (silencioso = false) => {
    if (!conversacionId) { setMensajes([]); return }
    if (!silencioso) setLoading(true)
    try {
      const [msgs, sug, sugsPorMsg] = await Promise.all([
        fetchMensajes(conversacionId),
        fetchLatestSugerencia(conversacionId),
        fetchSugerenciasPorMensaje(conversacionId),
      ])
      // Si se refresca con un mensaje todavía mandándose (o fallido), no
      // se lo pisa: se conserva al final de la lista.
      setMensajes(prev => {
        const locales = prev.filter(m => (m._pending || m._failed) && !msgs.some(r => r.id === m.id))
        return locales.length ? [...msgs, ...locales] : msgs
      })
      setSugerencia(sug as WspIaSugerencia | null)
      const map: Record<string, WspIaSugerencia> = {}
      for (const s of sugsPorMsg as WspIaSugerencia[]) {
        if (s.mensaje_id) map[s.mensaje_id] = s
      }
      setSugerenciasPorMensaje(map)
    } catch (err) {
      console.error('Error cargando mensajes:', err)
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [conversacionId])

  useEffect(() => { load() }, [load])

  const loadRef = useRef(load)
  loadRef.current = load

  // Red de seguridad por si el tiempo real se cae en silencio.
  useRefrescoAutomatico(() => { load(true) }, 4000, !!conversacionId)

  useEffect(() => {
    if (!conversacionId) return
    let yaConectado = false

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
      .on(
        // Avisos de entrega de Meta (enviado → entregado → visto / fallido):
        // llegan como UPDATE sobre el mensaje ya guardado.
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wsp_mensajes',
          filter: `conversacion_id=eq.${conversacionId}`,
        },
        (payload) => {
          const upd = payload.new as WspMensaje
          setMensajes(prev => prev.map(m => m.id === upd.id
            ? { ...m, wa_estado: upd.wa_estado, wa_estado_at: upd.wa_estado_at, wa_error: upd.wa_error }
            : m))
        }
      )
      .on(
        // La IA tarda unos segundos en clasificar el mensaje y recién ahí
        // inserta la fila en wsp_ia_sugerencias — bastante después de que el
        // mensaje ya se mostró. Sin este listener, el botón de "mandar
        // talle" y el cartel de respuesta sugerida solo aparecían si se
        // salía de la conversación y se volvía a entrar (lo que releía todo
        // desde cero), nunca en vivo mientras el chat estaba abierto.
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wsp_ia_sugerencias',
          filter: `conversacion_id=eq.${conversacionId}`,
        },
        (payload) => {
          const newSug = payload.new as WspIaSugerencia
          if (newSug.mensaje_id) {
            setSugerenciasPorMensaje(prev => ({ ...prev, [newSug.mensaje_id as string]: newSug }))
          }
          setSugerencia(prev => (!prev || newSug.created_at >= prev.created_at) ? newSug : prev)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (yaConectado) loadRef.current(true)
          yaConectado = true
        }
      })

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
    setMensajes(prev => {
      // El listener de arriba ya se cuida de no duplicar cuando la fila real
      // llega por realtime DESPUÉS de resolverse acá (chequea por id antes
      // de agregar) — pero si llega ANTES (típico si el insert es más
      // rápido que la respuesta HTTP del envío), esta función pisaba el
      // mensaje optimista con la fila real sin fijarse que ya estaba
      // agregada, y la burbuja quedaba dos veces. Si ya está, solo se saca
      // el optimista en vez de agregar la real de nuevo.
      if (prev.some(m => m.id === real.id)) {
        return prev.filter(m => m.id !== tempId)
      }
      return prev.map(m => m.id === tempId ? real : m)
    })
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
    mensajes, loading, reload: () => load(), recargarSilencioso: () => load(true), sugerencia, setSugerencia, sugerenciasPorMensaje,
    addPendingMensaje, resolvePendingMensaje, failPendingMensaje, setMensajeTranscripcion,
    setMensajeOculto,
  }
}
