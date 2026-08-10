import { useState, useEffect, useCallback } from 'react'
import type { Compra } from '../types'
import {
  fetchCompras, registrarCompra, registrarPago, fetchSaldosPorProveedor,
  type CompraItemInput, type SaldoProveedor,
} from '../services/compras'

export function useCompras(startDate?: string, endDate?: string) {
  const [compras, setCompras] = useState<Compra[]>([])
  const [saldosPorProveedor, setSaldosPorProveedor] = useState<SaldoProveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, s] = await Promise.all([fetchCompras(startDate, endDate), fetchSaldosPorProveedor()])
      setCompras(c)
      setSaldosPorProveedor(s)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  const registrar = async (
    proveedorId: string, fecha: string, numeroRemito: string | null,
    items: CompraItemInput[], notas: string | null, empleadoId: string | null,
  ) => {
    await registrarCompra(proveedorId, fecha, numeroRemito, items, notas, empleadoId)
    await load()
  }

  const pagar = async (compraId: string, monto: number, fecha: string, notas: string | null, empleadoId: string | null) => {
    await registrarPago(compraId, monto, fecha, notas, empleadoId)
    await load()
  }

  return { compras, saldosPorProveedor, loading, error, reload: load, registrarCompra: registrar, registrarPago: pagar }
}
