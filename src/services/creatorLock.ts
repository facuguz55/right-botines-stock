import { supabase } from '../lib/supabase'

export interface AppLockStatus {
  locked: boolean
  mensaje: string
}

export async function getAppLockStatus(): Promise<AppLockStatus> {
  const { data, error } = await supabase.rpc('get_app_lock_status')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { locked: Boolean(row?.locked), mensaje: row?.mensaje ?? '' }
}

export async function verifyCreatorPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_creator_pin', { pin_input: pin })
  if (error) throw error
  return Boolean(data)
}

export async function setAppLock(pin: string, locked: boolean, mensaje: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_app_lock', {
    pin_input: pin,
    new_locked: locked,
    new_mensaje: mensaje,
  })
  if (error) throw error
  return Boolean(data)
}

export async function setCreatorPin(currentPin: string, newPin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_creator_pin', {
    current_pin: currentPin,
    new_pin: newPin,
  })
  if (error) throw error
  return Boolean(data)
}
