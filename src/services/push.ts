// Notificaciones push del CRM en el celu (ver api/push-subscribe.ts y
// src/lib/webpush.ts). La clave pública es pública por diseño; la privada vive
// solo en las variables de entorno de Vercel.
const VAPID_PUBLIC_KEY = 'BJL98f-RpOG8aOJBQiUEUtmEBqRR2eS9L8Yj_ovv-LXVxfn-o8Ef9qTRnG8uG6yQ_RN-CnNJ0_vpAsaC88ESpbo'

export type EstadoPush = 'no_soportado' | 'ios_instalar' | 'denegado' | 'inactivo' | 'activo'

function esIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function esAppInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function claveAUint8(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function estadoPush(): Promise<EstadoPush> {
  // En iPhone solo anda con la app agregada a la pantalla de inicio.
  if (esIos() && !esAppInstalada()) return 'ios_instalar'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no_soportado'
  if (Notification.permission === 'denied') return 'denegado'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo'
  } catch {
    return 'inactivo'
  }
}

export async function activarPush(nombre?: string | null): Promise<EstadoPush> {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return permiso === 'denied' ? 'denegado' : 'inactivo'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAUint8(VAPID_PUBLIC_KEY) }))
  const res = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), nombre: nombre ?? null }),
  })
  if (!res.ok) throw new Error('No se pudo guardar la suscripción')
  return 'activo'
}
