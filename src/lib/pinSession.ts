// PIN del dueño recordado solo para esta pestaña/sesión de navegación (se
// pierde al cerrarla) — evita repetir el PIN cada vez que se quiere ver un
// importe, sin guardarlo de forma persistente como localStorage.
const KEY = 'rb_owner_pin_session'

export function getSessionPin(): string | null {
  try { return sessionStorage.getItem(KEY) } catch { return null }
}

export function setSessionPin(pin: string): void {
  try { sessionStorage.setItem(KEY, pin) } catch { /* noop */ }
}

export function clearSessionPin(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* noop */ }
}
