import { useState, useEffect, useCallback } from 'react'
import type { CajaDia, TotalesEfectivoDia } from '../types'
import {
  fetchCajaAbierta, abrirCaja, cerrarCaja, fetchTotalesEfectivoDia, fetchCajasCerradas,
} from '../services/caja'

const POLL_MS = 30000

export function useCaja(startDate?: string, endDate?: string) {
  const [cajaAbierta, setCajaAbierta] = useState<CajaDia | null>(null)
  const [totalesDia, setTotalesDia] = useState<TotalesEfectivoDia>({ efectivo: 0, transferencia: 0, tarjeta: 0 })
  const [cerradas, setCerradas] = useState<CajaDia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAbierta = useCallback(async () => {
    try {
      const caja = await fetchCajaAbierta()
      setCajaAbierta(caja)
      if (caja) setTotalesDia(await fetchTotalesEfectivoDia(caja.fecha))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const loadCerradas = useCallback(async () => {
    try {
      setCerradas(await fetchCajasCerradas(startDate, endDate))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [startDate, endDate])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    await Promise.all([loadAbierta(), loadCerradas()])
    setLoading(false)
  }, [loadAbierta, loadCerradas])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!cajaAbierta) return
    const id = setInterval(loadAbierta, POLL_MS)
    return () => clearInterval(id)
  }, [cajaAbierta, loadAbierta])

  const abrir = async (monto: number, empleadoId: string | null) => {
    await abrirCaja(monto, empleadoId)
    await loadAbierta()
  }

  const cerrar = async (montoContado: number, empleadoId: string | null, notas: string | null) => {
    if (!cajaAbierta) throw new Error('No hay caja abierta')
    await cerrarCaja(cajaAbierta.id, cajaAbierta.fecha, cajaAbierta.monto_apertura, montoContado, empleadoId, notas)
    await loadAll()
  }

  return { cajaAbierta, totalesDia, cerradas, loading, error, abrir, cerrar, reload: loadAll }
}
