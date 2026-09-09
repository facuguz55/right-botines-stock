import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WspMensaje, WspIaSugerencia } from '../types/crm'
import { fetchMensajes, fetchLatestSugerencia } from '../services/crmMessages'
import { playNotificationSound } from '../services/crmNotification'

export function useMessages(conversacionId: string | null) {
  const [mensajes, setMensajes] = useState<WspMensaje[]>([])
  const [loading, setLoading] = useState(false)
  const [sugerencia, setSugerencia] = useState<WspIaSugerencia | null>(null)

  const load = useCallback(async () => {
    if (!conversacionId) { setMensajes([]); return }
    setLoading(true)
    try {
      const [msgs, sug] = await Promise.all([
        fetchMensajes(conversacionId),
        fetchLatestSugerencia(conversacionId),
      ])
      setMensajes(msgs)
      setSugerencia(sug as WspIaSugerencia | null)
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
          setMensajes(prev => [...prev, newMsg])
          if (newMsg.direccion === 'in') playNotificationSound()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversacionId])

  return { mensajes, loading, reload: load, sugerencia, setSugerencia }
}
