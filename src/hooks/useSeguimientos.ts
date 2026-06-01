import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { SeguimientosData } from '../types'

export function useSeguimientos() {
  const [data, setData] = useState<SeguimientosData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [
        { data: emails, error: e1 },
        { data: conversiones, error: e2 },
        { data: clicks, error: e3 },
      ] = await Promise.all([
        supabase
          .from('emails_enviados')
          .select('*')
          .order('fecha', { ascending: false }),
        supabase
          .from('conversiones')
          .select('*')
          .order('fecha_orden', { ascending: false }),
        supabase
          .from('clicks_tracking')
          .select('*')
          .order('fecha_click', { ascending: false }),
      ])

      const firstError = e1 || e2 || e3
      if (firstError) throw new Error(firstError.message ?? 'Error al cargar seguimientos')

      setData({
        emailsEnviados: emails ?? [],
        conversiones: conversiones ?? [],
        clicks: clicks ?? [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return { data, loading, error, reload: load }
}
