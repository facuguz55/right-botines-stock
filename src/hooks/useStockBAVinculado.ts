import { useEffect, useState } from 'react'
import { fetchStockBAPorModeloLocal, type TalleBAVista } from '../services/stockBA'

// Qué talles hay en Buenos Aires para cada modelo del local. Se pide al abrir,
// al volver a la pestaña y cada minuto; si falla, la pantalla de Stock queda
// como estaba (sin la línea de Buenos Aires).
export function useStockBAVinculado() {
  const [mapa, setMapa] = useState<Map<string, TalleBAVista[]>>(new Map())

  useEffect(() => {
    let vivo = true
    const cargar = () => {
      fetchStockBAPorModeloLocal().then(m => { if (vivo) setMapa(m) }).catch(() => {})
    }
    cargar()
    const timer = setInterval(cargar, 60_000)
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivo = false; clearInterval(timer); document.removeEventListener('visibilitychange', alVolver) }
  }, [])

  return mapa
}
