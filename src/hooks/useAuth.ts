import { useCallback, useState } from 'react'
import type { Empleado, Role } from '../types'
import { logFailedOwnerAttempt, verifyOwnerPin } from '../services/auth'

const ROLE_KEY = 'rb_role'
const EMPLEADO_ID_KEY = 'rb_empleado_id'
const EMPLEADO_NOMBRE_KEY = 'rb_empleado_nombre'

function getStoredRole(): Role | null {
  try {
    const saved = localStorage.getItem(ROLE_KEY)
    return saved === 'empleado' || saved === 'dueno' ? saved : null
  } catch {
    return null
  }
}

function getStoredEmpleado(): { id: string | null; nombre: string | null } {
  try {
    return {
      id: localStorage.getItem(EMPLEADO_ID_KEY),
      nombre: localStorage.getItem(EMPLEADO_NOMBRE_KEY),
    }
  } catch {
    return { id: null, nombre: null }
  }
}

export function useAuth() {
  const [role, setRole] = useState<Role | null>(getStoredRole)
  const [empleadoId, setEmpleadoId] = useState<string | null>(() => getStoredEmpleado().id)
  const [empleadoNombre, setEmpleadoNombre] = useState<string | null>(() => getStoredEmpleado().nombre)

  // Login = elegir perfil y quedar usando la app. Ya no abre fichaje: fichar
  // entrada/salida es una acción aparte (ver useFichajeActual), para que
  // cada empleado se haga cargo de ficharse sin depender de cerrar sesión.
  const loginEmpleado = useCallback(async (empleado: Empleado): Promise<void> => {
    try {
      localStorage.setItem(ROLE_KEY, 'empleado')
      localStorage.setItem(EMPLEADO_ID_KEY, empleado.id)
      localStorage.setItem(EMPLEADO_NOMBRE_KEY, empleado.nombre)
    } catch { /* noop */ }
    setRole('empleado')
    setEmpleadoId(empleado.id)
    setEmpleadoNombre(empleado.nombre)
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

  const logout = useCallback(async (): Promise<void> => {
    try {
      localStorage.removeItem(ROLE_KEY)
      localStorage.removeItem(EMPLEADO_ID_KEY)
      localStorage.removeItem(EMPLEADO_NOMBRE_KEY)
    } catch { /* noop */ }
    setRole(null)
    setEmpleadoId(null)
    setEmpleadoNombre(null)
  }, [])

  return { role, empleadoId, empleadoNombre, loginEmpleado, loginDueno, logout }
}
