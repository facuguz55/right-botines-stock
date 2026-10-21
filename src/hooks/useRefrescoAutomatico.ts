import { useEffect, useRef } from 'react'

// Red de seguridad del tiempo real. La conexión en vivo es la vía principal,
// pero en el celular se corta en silencio (segundo plano, pantalla bloqueada,
// cambio de wifi a datos). Este hook vuelve a leer los datos:
//  - al volver a la app / enfocar la ventana / recuperar internet
//  - cuando llega una notificación push (la avisa el service worker)
//  - cada `cadaMs` mientras la app está visible
export function useRefrescoAutomatico(recargar: () => void, cadaMs: number, activo = true) {
  const ref = useRef(recargar)
  ref.current = recargar

  useEffect(() => {
    if (!activo) return
    const correr = () => { if (document.visibilityState === 'visible') ref.current() }
    const alMensajeSW = (e: MessageEvent) => { if (e.data && e.data.type === 'crm-refresh') ref.current() }
    document.addEventListener('visibilitychange', correr)
    window.addEventListener('focus', correr)
    window.addEventListener('online', correr)
    navigator.serviceWorker?.addEventListener('message', alMensajeSW)
    const id = window.setInterval(correr, cadaMs)
    return () => {
      document.removeEventListener('visibilitychange', correr)
      window.removeEventListener('focus', correr)
      window.removeEventListener('online', correr)
      navigator.serviceWorker?.removeEventListener('message', alMensajeSW)
      window.clearInterval(id)
    }
  }, [cadaMs, activo])
}
