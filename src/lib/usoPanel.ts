// Medidor de uso del panel: qué secciones abren, cuánto tiempo las usan de
// verdad (con la pestaña visible y tocando algo), qué botones tocan, a qué
// hora, desde qué dispositivo y qué errores les salen. Todo va a Nova OS
// (dashboard.novaagency.info/api/uso), pantalla «Uso de paneles».
//
// No guarda lo que se escribe en los campos ni el contenido de los mensajes:
// de cada botón solo se queda con un nombre corto (data-uso, aria-label,
// title o el texto visible si es corto y no parece un teléfono ni un mail).
//
// Para que no se cuente el uso de Nova: entrar una vez con ?nova=1 en la URL
// (queda marcado en ese navegador; ?nova=0 lo desmarca). En localhost no mide.
//
// Este mismo archivo está copiado en right-botines-stock y en cofit: si se
// cambia uno, cambiar el otro.

const ENDPOINT = 'https://dashboard.novaagency.info/api/uso'
const LATIDO_MS = 15_000
const INACTIVO_MS = 60_000
const ENVIO_MS = 20_000
const MAX_ERRORES = 5

type Evento = {
  e: string
  p?: string
  el?: string
  s?: number
  t: string
  d?: Record<string, unknown>
}

let cliente = ''
let usuario: string | null = null
let rol: string | null = null
let sesion = ''
let cola: Evento[] = []
let pagina = ''
let segundosPagina = 0
let ultimaInteraccion = Date.now()
let errores = 0
let activo = false

function interno(): boolean {
  try {
    const { hostname, search } = window.location
    if (hostname === 'localhost' || hostname.startsWith('127.') || hostname === '[::1]') return true
    const q = new URLSearchParams(search).get('nova')
    if (q === '1') localStorage.setItem('nova_interno', '1')
    if (q === '0') localStorage.removeItem('nova_interno')
    return localStorage.getItem('nova_interno') === '1'
  } catch {
    return false
  }
}

function idSesion(): string {
  try {
    const guardada = sessionStorage.getItem('uso_sesion')
    if (guardada) return guardada
    const nueva = crypto.randomUUID()
    sessionStorage.setItem('uso_sesion', nueva)
    return nueva
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

function dispositivo(): string {
  const tactil = window.matchMedia('(pointer: coarse)').matches
  if (!tactil) return 'compu'
  return Math.min(window.screen.width, window.screen.height) >= 700 ? 'tablet' : 'celu'
}

function appInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function agregar(e: string, extra: Omit<Evento, 'e' | 't'> = {}) {
  if (!activo) return
  cola.push({ e, t: new Date().toISOString(), ...extra })
  if (cola.length >= 80) enviar(false)
}

function cerrarTiempo() {
  if (pagina && segundosPagina > 0) agregar('tiempo', { p: pagina, s: segundosPagina })
  segundosPagina = 0
}

function enviar(saliendo: boolean) {
  if (!activo || cola.length === 0) return
  const lote = cola
  cola = []
  const cuerpo = JSON.stringify({
    cliente, sesion, usuario, rol,
    dispositivo: dispositivo(),
    app_instalada: appInstalada(),
    eventos: lote,
  })
  // text/plain para que el navegador no haga el pedido previo de CORS.
  const blob = new Blob([cuerpo], { type: 'text/plain' })
  if (saliendo && navigator.sendBeacon?.(ENDPOINT, blob)) return
  fetch(ENDPOINT, { method: 'POST', body: blob, keepalive: true, mode: 'no-cors' }).catch(() => { /* si falla se pierde el lote, no molesta al usuario */ })
}

// Nombre corto del elemento tocado, sin datos de clientes.
export function nombreElemento(el: Element): string {
  const marcado = el.getAttribute('data-uso') || el.getAttribute('aria-label') || el.getAttribute('title')
  if (marcado) return marcado.trim().slice(0, 60)
  const texto = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  if (texto && texto.length <= 40 && !/\d{5,}/.test(texto.replace(/[\s.-]/g, '')) && !texto.includes('@') && !/\$\s?\d/.test(texto)) return texto
  const tag = el.tagName.toLowerCase()
  const tipo = el.getAttribute('role') || (el as HTMLInputElement).type || ''
  return `(${tag}${tipo ? ' ' + tipo : ''} sin nombre)`
}

const CLICKEABLE = 'button, a, summary, select, label, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="option"], [data-uso], input[type="checkbox"], input[type="radio"]'

function alTocar(ev: Event) {
  ultimaInteraccion = Date.now()
  const objetivo = ev.target instanceof Element ? ev.target.closest(CLICKEABLE) : null
  if (!objetivo || objetivo.closest('[data-uso-ignorar]')) return
  agregar('clic', { p: pagina, el: nombreElemento(objetivo), d: { tag: objetivo.tagName.toLowerCase() } })
}

function alInteractuar() {
  ultimaInteraccion = Date.now()
}

export function iniciarUso(nombreCliente: string) {
  // Si ya mide y cambia el cliente (panel con selector de tienda), lo que
  // queda en la cola se manda con el cliente anterior y sigue con el nuevo.
  if (activo) {
    if (nombreCliente !== cliente) {
      cerrarTiempo()
      enviar(false)
      cliente = nombreCliente
      agregar('pagina', { p: pagina, d: { cambio_de_tienda: true } })
    }
    return
  }
  if (typeof window === 'undefined' || interno()) return
  activo = true
  cliente = nombreCliente
  sesion = idSesion()
  let nueva = true
  try {
    nueva = sessionStorage.getItem('uso_iniciada') !== sesion
    sessionStorage.setItem('uso_iniciada', sesion)
  } catch { /* sin sessionStorage igual mide */ }
  agregar(nueva ? 'inicio' : 'recarga', {
    d: { ancho: window.innerWidth, alto: window.innerHeight, ruta: window.location.pathname },
  })

  document.addEventListener('click', alTocar, true)
  for (const tipo of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    document.addEventListener(tipo, alInteractuar, { passive: true, capture: true })
  }
  window.addEventListener('scroll', alInteractuar, { passive: true, capture: true })

  // Solo cuenta como uso el tiempo con la pestaña visible y con alguien
  // tocando algo en el último minuto: un panel abierto y olvidado no suma.
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - ultimaInteraccion < INACTIVO_MS) {
      segundosPagina += LATIDO_MS / 1000
    }
  }, LATIDO_MS)
  window.setInterval(() => { cerrarTiempo(); enviar(false) }, ENVIO_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cerrarTiempo()
      agregar('oculto', { p: pagina })
      enviar(true)
    } else {
      ultimaInteraccion = Date.now()
      agregar('visible', { p: pagina })
    }
  })
  window.addEventListener('pagehide', () => {
    cerrarTiempo()
    agregar('fin', { p: pagina })
    enviar(true)
  })

  const registrarError = (mensaje: string) => {
    if (errores >= MAX_ERRORES) return
    errores++
    agregar('error', { p: pagina, el: mensaje.slice(0, 160) })
  }
  window.addEventListener('error', (ev) => registrarError(ev.message || 'Error'))
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason as { message?: string } | string | undefined
    registrarError(typeof r === 'string' ? r : r?.message || 'Promesa rechazada')
  })
}

export function usoPagina(nombre: string) {
  if (!activo || nombre === pagina) return
  cerrarTiempo()
  const anterior = pagina
  pagina = nombre
  agregar('pagina', { p: nombre, d: anterior ? { desde: anterior } : undefined })
}

export function usoUsuario(nombre: string | null, nuevoRol: string | null) {
  usuario = nombre ? nombre.slice(0, 60) : null
  rol = nuevoRol
}

// Para marcar una acción importante que no es un clic (ej. «venta cargada»).
export function usoAccion(nombre: string, detalle?: Record<string, unknown>) {
  agregar('accion', { p: pagina, el: nombre.slice(0, 60), d: detalle })
}
