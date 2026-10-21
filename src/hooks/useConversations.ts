import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WspConversacion, CrmCategoria } from '../types/crm'
import { fetchConversaciones, searchConversaciones } from '../services/crmConversations'
import { playNotificationSound } from '../services/crmNotification'

export function useConversations(categoriaFilter?: CrmCategoria) {
  const [conversaciones, setConversaciones] = useState<WspConversacion[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // `silencioso`: refresca sin mostrar el cartel de "cargando" (para el
  // refresco automático al volver a la app y el botón de actualizar).
  const load = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const data = search
        ? await searchConversaciones(search)
        : await fetchConversaciones(categoriaFilter)
      setConversaciones(data)
    } catch (err) {
      console.error('Error cargando conversaciones:', err)
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [categoriaFilter, search])

  useEffect(() => { load() }, [load])

  // En el celular, con la app en segundo plano (o la pantalla bloqueada) la
  // conexión en tiempo real se corta y los mensajes de ese rato no llegan:
  // al volver a la app se recarga la lista, y mientras está abierta se
  // revisa cada tanto por si el tiempo real se cayó sin avisar.
  useEffect(() => {
    const recargar = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', recargar)
    window.addEventListener('focus', recargar)
    window.addEventListener('online', recargar)
    const id = window.setInterval(recargar, 30000)
    return () => {
      document.removeEventListener('visibilitychange', recargar)
      window.removeEventListener('focus', recargar)
      window.removeEventListener('online', recargar)
      window.clearInterval(id)
    }
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('crm-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wsp_conversaciones' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newConv = payload.new as WspConversacion
            // Si la conversación se creó desde acá mismo (ej. "Escribirle a
            // un número nuevo"), el reload manual que sigue a ese insert
            // puede llegar a la vez que este evento de tiempo real — sin
            // este chequeo quedaba duplicada en la lista.
            setConversaciones(prev => prev.some(c => c.id === newConv.id) ? prev : [newConv, ...prev])
            playNotificationSound()
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as WspConversacion
            setConversaciones(prev =>
              prev.map(c => c.id === updated.id ? { ...c, ...updated } : c)
                .sort((a, b) => new Date(b.ultimo_mensaje_at).getTime() - new Date(a.ultimo_mensaje_at).getTime())
            )
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string }
            setConversaciones(prev => prev.filter(c => c.id !== old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return { conversaciones, loading, reload: () => load(), recargarSilencioso: () => load(true), search, setSearch }
}
