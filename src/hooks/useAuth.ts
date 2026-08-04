import { useCallback, useState } from 'react'
import type { Role } from '../types'
import { logFailedOwnerAttempt, verifyOwnerPin } from '../services/auth'

const ROLE_KEY = 'rb_role'

function getStoredRole(): Role | null {
  try {
    const saved = localStorage.getItem(ROLE_KEY)
    return saved === 'empleado' || saved === 'dueno' ? saved : null
  } catch {
    return null
  }
}

export function useAuth() {
  const [role, setRole] = useState<Role | null>(getStoredRole)

  const loginEmpleado = useCallback(() => {
    try { localStorage.setItem(ROLE_KEY, 'empleado') } catch { /* noop */ }
    setRole('empleado')
  }, [])

  const loginDueno = useCallback(async (pin: string): Promise<boolean> => {
    const ok = await verifyOwnerPin(pin)
    if (ok) {
      try { localStorage.setItem(ROLE_KEY, 'dueno') } catch { /* noop */ }
      setRole('dueno')
    } else {
      try { await logFailedOwnerAttempt() } catch { /* noop */ }
    }
    return ok
  }, [])

  const logout = useCallback(() => {
    try { localStorage.removeItem(ROLE_KEY) } catch { /* noop */ }
    setRole(null)
  }, [])

  return { role, loginEmpleado, loginDueno, logout }
}
