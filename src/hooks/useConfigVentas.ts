import { useState, useEffect, useCallback } from 'react'
import { fetchConfigVentas, updateDescuentoTransferenciaPct, detectarDescuentoDesdeTN } from '../services/configuracionVentas'

export function useConfigVentas() {
  const [descuentoTransferenciaPct, setDescuentoTransferenciaPct] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const config = await fetchConfigVentas()
      setDescuentoTransferenciaPct(config.descuento_transferencia_pct)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const guardarPct = async (pct: number | null) => {
    await updateDescuentoTransferenciaPct(pct)
    setDescuentoTransferenciaPct(pct)
  }

  const detectarAutomatico = async () => {
    const detectado = await detectarDescuentoDesdeTN()
    if (detectado != null) await guardarPct(detectado)
    return detectado
  }

  return { descuentoTransferenciaPct, loading, guardarPct, detectarAutomatico }
}
