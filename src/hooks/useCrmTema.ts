import { useCallback, useEffect, useState } from 'react'
import { aplicarTemaCrm, guardarTemaCrm, leerTemaCrm, type CrmTema } from '../lib/crmTema'

// Se usa una sola vez (en CrmInbox). Al salir del CRM se saca el tema claro.
export function useCrmTema() {
  const [tema, setTema] = useState<CrmTema>(leerTemaCrm)

  useEffect(() => {
    aplicarTemaCrm(tema)
    return () => aplicarTemaCrm(null)
  }, [tema])

  const alternar = useCallback(() => {
    setTema(prev => {
      const next: CrmTema = prev === 'claro' ? 'oscuro' : 'claro'
      guardarTemaCrm(next)
      return next
    })
  }, [])

  return { tema, alternar }
}
