import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WspConversacion, CrmCategoria } from '../types/crm'
import { fetchConversaciones, searchConversaciones } from '../services/crmConversations'
import { playNotificationSound } from '../services/crmNotification'

export function useConversations(categoriaFilter?: CrmCategoria) {
  const [conversaciones, setConversaciones] = useState<WspConversacion[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = search
        ? await searchConversaciones(search)
        : await fetchConversaciones(categoriaFilter)
      setConversaciones(data)
    } catch (err) {
      console.error('Error cargando conversaciones:', err)
    } finally {
      setLoading(false)
    }
  }, [categoriaFilter, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('crm-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wsp_conversaciones' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newConv = payload.new as WspConversacion
            setConversaciones(prev => [newConv, ...prev])
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

  return { conversaciones, loading, reload: load, search, setSearch }
}
