// Permiso de este dispositivo para usar TiendaNube a través del proxy con las
// credenciales del servidor (ver supabase/migrations/046_dispositivos_habilitados.sql).
// Se obtiene una sola vez con el PIN del dueño y queda guardado acá.
const KEY = 'rb_device_token'
export const EVENTO_NO_HABILITADO = 'rb-dispositivo-no-habilitado'

export function getDeviceToken(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}

export function setDeviceToken(token: string) {
  try { localStorage.setItem(KEY, token) } catch { /* noop */ }
}

export function clearDeviceToken() {
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
}

export function headerDispositivo(): Record<string, string> {
  const t = getDeviceToken()
  return t ? { 'x-device-token': t } : {}
}

// El proxy respondió que este dispositivo no está habilitado (nunca se
// habilitó, o el dueño lo quitó): se avisa a la app para mostrar el cartel.
export async function revisarRespuestaProxy(res: Response) {
  if (res.status !== 401) return
  try {
    const body = await res.clone().json()
    if (body?.error === 'DISPOSITIVO_NO_HABILITADO') {
      clearDeviceToken()
      window.dispatchEvent(new Event(EVENTO_NO_HABILITADO))
    }
  } catch { /* noop */ }
}
