// Envíos que salen del depósito de Buenos Aires (Edge Function logistica-ba).
// Acceso con el PIN de logística (link /logistica) o con un dispositivo de
// Right habilitado (pestaña "Depósito CABA" en Órdenes).
const URL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/logistica-ba`

export interface ProductoEnvio { nombre: string; talle: string; cantidad: number; foto: string | null }
export interface EnvioBA {
  orderId: number
  numero: number
  fecha: string
  estado: string
  despachado: boolean
  dividida: boolean
  cliente: string
  telefono: string
  direccion: string
  envio: string
  envioDudoso: boolean
  seguimiento: string | null
  codigoSeguimiento: string | null
  nota: string | null
  productos: ProductoEnvio[]
  // Última marca hecha desde la vista de logística (quién y cuándo).
  marcado: { accion: string; origen: string; created_at: string } | null
  // Último problema avisado con "Hay un problema" (le llega a Right en la campanita).
  problema: { detalle: string | null; origen: string; created_at: string } | null
}

export class AccesoDenegado extends Error {}

export type AccesoLogistica = { pin: string } | { dispositivo: string | null }

function headersAcceso(acceso: AccesoLogistica): Record<string, string> {
  const headers: Record<string, string> = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string }
  if ('pin' in acceso) headers['x-logistica-pin'] = acceso.pin
  else if (acceso.dispositivo) headers['x-device-token'] = acceso.dispositivo
  return headers
}

// Marca el envío en TiendaNube. "despachado" le avisa al cliente con el
// seguimiento (lo hace TiendaNube).
export async function marcarEnvioBA(acceso: AccesoLogistica, orderId: number, accion: 'armado' | 'despachado'): Promise<void> {
  await enviar(acceso, { orderId, accion })
}

// Avisa a Right que hay un problema con el pedido (no toca TiendaNube).
export async function avisarProblemaBA(acceso: AccesoLogistica, orderId: number, motivo: string): Promise<void> {
  await enviar(acceso, { orderId, accion: 'problema', motivo })
}

async function enviar(acceso: AccesoLogistica, cuerpo: Record<string, unknown>): Promise<void> {
  const res = await fetch(URL_FN, {
    method: 'POST',
    headers: { ...headersAcceso(acceso), 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  const body = await res.json().catch(() => ({})) as { error?: string }
  if (res.status === 401) throw new AccesoDenegado(body.error ?? 'Sin acceso')
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
}

export async function fetchEnviosBA(acceso: AccesoLogistica): Promise<EnvioBA[]> {
  const res = await fetch(URL_FN, { headers: headersAcceso(acceso) })
  const body = await res.json().catch(() => ({})) as { ordenes?: EnvioBA[]; error?: string }
  if (res.status === 401) throw new AccesoDenegado(body.error ?? 'Sin acceso')
  if (!res.ok || !body.ordenes) throw new Error(body.error ?? `Error ${res.status}`)
  return body.ordenes
}
