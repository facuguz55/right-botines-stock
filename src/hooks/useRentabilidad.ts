import { useState, useEffect, useCallback } from 'react'
import type { RentabilidadMes } from '../types'
import { computeRentabilidadMes } from '../services/rentabilidadService'
import { verifyOwnerPin } from '../services/auth'
import { getSessionPin, setSessionPin } from '../lib/pinSession'

function mesActualStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function useRentabilidad(mesInicial: string = mesActualStr()) {
  const [mes, setMes] = useState(mesInicial)
  const [data, setData] = useState<RentabilidadMes | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // PIN del dueño ya verificado en esta pestaña (ej. en Empleados) — si está,
  // se usa para traer el costo de mano de obra sin volver a pedirlo.
  const [pin, setPin] = useState<string | null>(() => getSessionPin())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await computeRentabilidadMes(mes, pin))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [mes, pin])

  useEffect(() => { load() }, [load])

  // Se llama desde la pantalla al pedirle el PIN para incluir los sueldos.
  // Devuelve false si el PIN es incorrecto (no lo guarda ni recarga).
  const desbloquearManoObra = useCallback(async (pinInput: string): Promise<boolean> => {
    const ok = await verifyOwnerPin(pinInput)
    if (!ok) return false
    setSessionPin(pinInput)
    setPin(pinInput)
    return true
  }, [])

  return { data, mes, setMes, loading, error, reload: load, manoObraDesbloqueada: pin != null, desbloquearManoObra }
}
