import { registerSW } from 'virtual:pwa-register'

// La app suele quedar abierta todo el día en el mostrador. Al activarse una
// versión nueva del Service Worker esto recarga la página sola (comportamiento
// por defecto de registerType 'autoUpdate'); el chequeo periódico es la red
// de seguridad para que esa activación no tarde horas en dispararse.
export function initPwaUpdate() {
  registerSW({
    immediate: true,
    onRegisterError() {
      // Sin red al primer registro: se reintenta solo en la próxima carga.
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // registration.update() devuelve una promesa que RECHAZA si el navegador
      // no puede bajar sw.js en ese momento (sin conexión, WiFi que se cae, la
      // compu que estuvo suspendida...). Se llamaba sin manejar el error, así
      // que cada chequeo fallido terminaba como "unhandledrejection" y se
      // reportaba como un bug de la app cuando es solo un corte de red — el
      // próximo chequeo (o la próxima carga) lo resuelve solo.
      const checkForUpdate = () => {
        if (!navigator.onLine) return
        registration.update().catch(() => { /* reintenta en el siguiente chequeo */ })
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
      window.addEventListener('focus', checkForUpdate)
      setInterval(checkForUpdate, 15 * 60 * 1000)
    },
  })
}
