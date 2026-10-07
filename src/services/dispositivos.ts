import { supabase } from '../lib/supabase'
import { setDeviceToken } from '../lib/dispositivo'

export interface DispositivoHabilitado {
  id: string
  nombre: string
  created_at: string
  ultimo_uso: string | null
}

interface RespuestaRpc {
  ok: boolean
  error?: string
  token?: string
  dispositivos?: DispositivoHabilitado[]
}

// Las funciones devuelven { ok: false, error } en vez de tirar excepción ante
// un PIN incorrecto (ver la migración 046: si no, se perdía el registro del
// intento fallido y el bloqueo por intentos nunca se activaba).
async function llamar(fn: string, args: Record<string, unknown>): Promise<RespuestaRpc> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  const r = data as RespuestaRpc
  if (!r.ok) throw new Error(r.error ?? 'No se pudo completar')
  return r
}

export async function habilitarEsteDispositivo(pin: string, nombre: string): Promise<void> {
  const r = await llamar('habilitar_dispositivo', { p_pin: pin, p_nombre: nombre })
  if (!r.token) throw new Error('No se recibió el permiso')
  setDeviceToken(r.token)
}

export async function listarDispositivos(pin: string): Promise<DispositivoHabilitado[]> {
  return (await llamar('listar_dispositivos', { p_pin: pin })).dispositivos ?? []
}

export async function quitarDispositivo(pin: string, id: string): Promise<void> {
  await llamar('quitar_dispositivo', { p_pin: pin, p_id: id })
}

export async function esteDispositivoHabilitado(token: string | null): Promise<boolean> {
  if (!token) return false
  const { data, error } = await supabase.rpc('dispositivo_valido', { p_token: token })
  if (error) return true // ante un error de red no se molesta con el cartel
  return data === true
}
