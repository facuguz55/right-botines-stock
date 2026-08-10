import { useState, useEffect, useCallback } from 'react'
import type { Fichaje, CajaDia } from '../types'
import { fetchFichajeAbierto, abrirFichaje, cerrarFichajeAbiertoDeEmpleado, countFichajesAbiertos } from '../services/fichajes'
import {
  fetchCajaAbierta, abrirCaja, cerrarCaja, calcularEfectivoEsperado, registrarVerificacionCaja,
} from '../services/caja'

// Cuando alguien ficha salida y hay caja abierta, siempre se le pide el
// efectivo — si es el último (nadie más fichado) ese monto CIERRA la caja
// de verdad; si no, queda como una verificación/checkpoint (no cierra nada).
export interface SalidaPendiente {
  caja: CajaDia
  esperado: number
  esUltimo: boolean
}

export function useFichajeActual(empleadoId: string | null) {
  const [fichaje, setFichaje] = useState<Fichaje | null>(null)
  const [cajaAbierta, setCajaAbierta] = useState<CajaDia | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [salidaPendiente, setSalidaPendiente] = useState<SalidaPendiente | null>(null)

  const reload = useCallback(async () => {
    if (!empleadoId) {
      setFichaje(null)
      setCajaAbierta(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [f, c] = await Promise.all([fetchFichajeAbierto(empleadoId), fetchCajaAbierta()])
      setFichaje(f)
      setCajaAbierta(c)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [empleadoId])

  useEffect(() => { reload() }, [reload])

  // El primero en fichar entrada en el día (sin fichaje propio ni caja
  // abierta) tiene que abrir la caja en el mismo paso — se bloquea el resto
  // de la app hasta hacerlo (ver AperturaCajaGate).
  const requiereApertura = !loading && !fichaje && !cajaAbierta

  const abrirCajaYFichar = async (montoApertura: number) => {
    if (!empleadoId) return
    try {
      await abrirCaja(montoApertura, empleadoId)
    } catch (e) {
      // Carrera entre dos fichajes casi simultáneos: si otro empleado ya
      // abrió la caja un instante antes, no es un error real — seguimos y
      // fichamos entrada igual, sin pisar la apertura que ya se hizo.
      if (!(e instanceof Error && e.message.includes('Ya hay una caja abierta'))) throw e
    }
    await abrirFichaje(empleadoId)
    await reload()
  }

  const ficharEntrada = async () => {
    if (!empleadoId) return
    await abrirFichaje(empleadoId)
    await reload()
  }

  const ficharSalida = async () => {
    if (!empleadoId) return
    const [abiertos, caja] = await Promise.all([countFichajesAbiertos(), fetchCajaAbierta()])
    if (caja) {
      const esperado = await calcularEfectivoEsperado(caja)
      setSalidaPendiente({ caja, esperado, esUltimo: abiertos <= 1 })
      return
    }
    await cerrarFichajeAbiertoDeEmpleado(empleadoId)
    await reload()
  }

  const confirmarSalida = async (montoContado: number, notas: string | null) => {
    if (!empleadoId || !salidaPendiente) return
    await cerrarFichajeAbiertoDeEmpleado(empleadoId)
    if (salidaPendiente.esUltimo) {
      await cerrarCaja(
        salidaPendiente.caja.id, salidaPendiente.caja.fecha, salidaPendiente.caja.monto_apertura,
        montoContado, empleadoId, notas,
      )
    } else {
      await registrarVerificacionCaja(salidaPendiente.caja.id, empleadoId, montoContado, salidaPendiente.esperado)
    }
    setSalidaPendiente(null)
    await reload()
  }

  const cancelarSalidaPendiente = () => setSalidaPendiente(null)

  return {
    fichaje, cajaAbierta, loading, error, requiereApertura,
    abrirCajaYFichar, ficharEntrada, ficharSalida,
    salidaPendiente, confirmarSalida, cancelarSalidaPendiente,
  }
}
