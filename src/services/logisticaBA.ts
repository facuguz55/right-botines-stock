// Envíos que salen del depósito de Buenos Aires (Edge Function logistica-ba).
// Acceso con el PIN de logística (link /logistica) o con un dispositivo de
// Right habilitado (pestaña "Depósito CABA" en Órdenes).
const URL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/logistica-ba`

export interface ProductoEnvio { nombre: string; talle: string; cantidad: number; foto: string | null }
export interface EnvioBA {
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
}

export class AccesoDenegado extends Error {}

export async function fetchEnviosBA(acceso: { pin: string } | { dispositivo: string | null }): Promise<EnvioBA[]> {
  const headers: Record<string, string> = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string }
  if ('pin' in acceso) headers['x-logistica-pin'] = acceso.pin
  else if (acceso.dispositivo) headers['x-device-token'] = acceso.dispositivo
  const res = await fetch(URL_FN, { headers })
  const body = await res.json().catch(() => ({})) as { ordenes?: EnvioBA[]; error?: string }
  if (res.status === 401) throw new AccesoDenegado(body.error ?? 'Sin acceso')
  if (!res.ok || !body.ordenes) throw new Error(body.error ?? `Error ${res.status}`)
  return body.ordenes
}
