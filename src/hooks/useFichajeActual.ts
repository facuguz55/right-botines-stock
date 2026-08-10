import { useState, useEffect, useCallback } from 'react'
import type { Fichaje, CajaDia } from '../types'
import { fetchFichajeAbierto, abrirFichaje, cerrarFichajeAbiertoDeEmpleado, countFichajesAbiertos } from '../services/fichajes'
import { fetchCajaAbierta, fetchTotalesEfectivoDia, fetchGastosCaja, fetchNetoDevolucionesEfectivo, cerrarCaja } from '../services/caja'

export interface CierreCajaPendiente {
  caja: CajaDia
  esperado: number
}

export function useFichajeActual(empleadoId: string | null) {
  const [fichaje, setFichaje] = useState<Fichaje | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cierrePendiente, setCierrePendiente] = useState<CierreCajaPendiente | null>(null)

  const reload = useCallback(async () => {
    if (!empleadoId) {
      setFichaje(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setFichaje(await fetchFichajeAbierto(empleadoId))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [empleadoId])

  useEffect(() => { reload() }, [reload])

  const ficharEntrada = async () => {
    if (!empleadoId) return
    await abrirFichaje(empleadoId)
    await reload()
  }

  // Si sos el último fichaje abierto y hay una caja abierta, fichar salida no
  // cierra directo: pide el efectivo contado para cerrar la caja en el mismo
  // paso (así queda siempre alguien responsable del arqueo, no se cierra sola).
  const ficharSalida = async () => {
    if (!empleadoId) return
    const [abiertos, caja] = await Promise.all([countFichajesAbiertos(), fetchCajaAbierta()])
    if (caja && abiertos <= 1) {
      const [totales, gastosList, netoDevoluciones] = await Promise.all([
        fetchTotalesEfectivoDia(caja.fecha),
        fetchGastosCaja(caja.id),
        fetchNetoDevolucionesEfectivo(caja.fecha),
      ])
      const totalGastos = gastosList.reduce((s, g) => s + g.monto, 0)
      const esperado = caja.monto_apertura + totales.efectivo + netoDevoluciones - totalGastos
      setCierrePendiente({ caja, esperado })
      return
    }
    await cerrarFichajeAbiertoDeEmpleado(empleadoId)
    await reload()
  }

  const confirmarSalidaConCierre = async (montoContado: number, notas: string | null) => {
    if (!empleadoId || !cierrePendiente) return
    await cerrarFichajeAbiertoDeEmpleado(empleadoId)
    await cerrarCaja(cierrePendiente.caja.id, cierrePendiente.caja.fecha, cierrePendiente.caja.monto_apertura, montoContado, empleadoId, notas)
    setCierrePendiente(null)
    await reload()
  }

  const cancelarCierrePendiente = () => setCierrePendiente(null)

  return {
    fichaje, loading, error, ficharEntrada, ficharSalida,
    cierrePendiente, confirmarSalidaConCierre, cancelarCierrePendiente,
  }
}
