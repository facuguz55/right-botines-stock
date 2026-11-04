import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Cuántos pedidos despachó la logística de Buenos Aires desde la última vez
// que se abrió la pestaña "Depósito CABA" en este dispositivo. Es el número
// que aparece al lado de "Órdenes" en el menú.
const KEY = 'rb_despachos_visto'
const EVENTO = 'rb-despachos-vistos'

function vistoDesde(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v) return v
  } catch { /* noop */ }
  return new Date(Date.now() - 24 * 3600_000).toISOString()
}

export function marcarDespachosVistos() {
  try { localStorage.setItem(KEY, new Date().toISOString()) } catch { /* noop */ }
  window.dispatchEvent(new Event(EVENTO))
}

export function useDespachosNuevos(activo: boolean): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    const contar = async () => {
      const { count, error } = await supabase.from('logistica_acciones')
        .select('id', { count: 'exact', head: true })
        .eq('accion', 'despachado').eq('ok', true).eq('origen', 'logistica')
        .gt('created_at', vistoDesde())
      if (vivo && !error) setN(count ?? 0)
    }
    contar()
    const t = setInterval(contar, 2 * 60 * 1000)
    const alVer = () => setN(0)
    window.addEventListener(EVENTO, alVer)
    return () => { vivo = false; clearInterval(t); window.removeEventListener(EVENTO, alVer) }
  }, [activo])
  return n
}
