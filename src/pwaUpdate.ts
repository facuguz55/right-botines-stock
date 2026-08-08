import { registerSW } from 'virtual:pwa-register'

// La app suele quedar abierta todo el día en el mostrador. Al activarse una
// versión nueva del Service Worker esto recarga la página sola (comportamiento
// por defecto de registerType 'autoUpdate'); el chequeo periódico es la red
// de seguridad para que esa activación no tarde horas en dispararse.
export function initPwaUpdate() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const checkForUpdate = () => registration.update()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
      window.addEventListener('focus', checkForUpdate)
      setInterval(checkForUpdate, 15 * 60 * 1000)
    },
  })
}
