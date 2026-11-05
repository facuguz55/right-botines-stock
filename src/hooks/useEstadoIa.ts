import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface EstadoIa {
  ultimo_error: string | null
  error_at: string | null
  ok_at: string | null
}

// Estado de la IA del bot (tabla crm_estado_ia, la escribe el webhook). Se usa
// una sola vez, en CrmInbox. Si la tabla no existe todavía, no muestra nada.
export function useEstadoIa(): EstadoIa | null {
  const [estado, setEstado] = useState<EstadoIa | null>(null)

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      const { data, error } = await supabase.from('crm_estado_ia').select('ultimo_error, error_at, ok_at').eq('id', 1).maybeSingle()
      if (vivo && !error) setEstado((data as EstadoIa | null) ?? null)
    }
    cargar()
    const channel = supabase
      .channel('crm-estado-ia')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_estado_ia' }, () => { cargar() })
      .subscribe()
    const timer = setInterval(cargar, 60_000)
    return () => { vivo = false; clearInterval(timer); supabase.removeChannel(channel) }
  }, [])

  return estado
}

// El aviso se muestra si el último error es posterior a la última vez que anduvo.
export function textoAvisoIa(e: EstadoIa | null): string | null {
  if (!e?.error_at) return null
  if (e.ok_at && new Date(e.ok_at).getTime() >= new Date(e.error_at).getTime()) return null
  switch (e.ultimo_error) {
    case 'sin_credito':
      return 'El bot no está sugiriendo respuestas: se terminó el saldo de la IA (Anthropic). Hay que cargar crédito en console.anthropic.com → Billing.'
    case 'clave':
      return 'El bot no está sugiriendo respuestas: la clave de la IA (Anthropic) no es válida.'
    default:
      return 'El bot no está sugiriendo respuestas: la IA (Anthropic) está fallando. Si sigue así, avisale a Mauri.'
  }
}
