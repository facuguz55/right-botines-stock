import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WspConversacion, CrmCategoria } from '../types/crm'
import { fetchConversaciones, searchConversaciones } from '../services/crmConversations'
import { useRefrescoAutomatico } from './useRefrescoAutomatico'
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

  // Red de seguridad por si el tiempo real se cae en silencio.
  useRefrescoAutomatico(() => { load(true) }, 8000)

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let yaConectado = false
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
      .subscribe((status) => {
        // Cada vez que la conexión se (re)establece se ponen al día los
        // mensajes que cayeron mientras estuvo caída.
        if (status === 'SUBSCRIBED') {
          if (yaConectado) loadRef.current(true)
          yaConectado = true
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [])

  return { conversaciones, loading, reload: () => load(), recargarSilencioso: () => load(true), search, setSearch }
}
