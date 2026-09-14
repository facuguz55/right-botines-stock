import { useCallback, useState } from 'react'
import type { Empleado, Role } from '../types'
import { logFailedOwnerAttempt, verifyOwnerPin } from '../services/auth'

const ROLE_KEY = 'rb_role'
const EMPLEADO_ID_KEY = 'rb_empleado_id'
const EMPLEADO_NOMBRE_KEY = 'rb_empleado_nombre'

// sessionStorage, no localStorage: localStorage se comparte entre TODAS las
// pestañas del navegador, así que dos empleados atendiendo a la vez en dos
// pestañas (ej. Rocío y Bernardino los sábados) se pisaban la sesión el uno
// al otro. sessionStorage es propio de cada pestaña — cada una mantiene su
// propio empleado logueado sin afectar a las demás.
function getStoredRole(): Role | null {
  try {
    const saved = sessionStorage.getItem(ROLE_KEY)
    return saved === 'empleado' || saved === 'dueno' || saved === 'atencion' ? saved : null
  } catch {
    return null
  }
}

function getStoredEmpleado(): { id: string | null; nombre: string | null } {
  try {
    return {
      id: sessionStorage.getItem(EMPLEADO_ID_KEY),
      nombre: sessionStorage.getItem(EMPLEADO_NOMBRE_KEY),
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
      sessionStorage.setItem(ROLE_KEY, 'empleado')
      sessionStorage.setItem(EMPLEADO_ID_KEY, empleado.id)
      sessionStorage.setItem(EMPLEADO_NOMBRE_KEY, empleado.nombre)
    } catch { /* noop */ }
    setRole('empleado')
    setEmpleadoId(empleado.id)
    setEmpleadoNombre(empleado.nombre)
  }, [])

  // Atención al público: no es un empleado del listado (es una sola persona
  // fija, sin ficha), así que entra directo sin elegir nombre, sin fichar y
  // sin depender de la caja (ver App.tsx puedeVender / AperturaCajaGate, que
  // solo miran role==='empleado'). Las ventas quedan con empleado_id null,
  // igual que las que hace el dueño.
  const loginAtencion = useCallback(async (): Promise<void> => {
    try {
      sessionStorage.setItem(ROLE_KEY, 'atencion')
      sessionStorage.removeItem(EMPLEADO_ID_KEY)
      sessionStorage.setItem(EMPLEADO_NOMBRE_KEY, 'Atención al público')
    } catch { /* noop */ }
    setRole('atencion')
    setEmpleadoId(null)
    setEmpleadoNombre('Atención al público')
  }, [])

  const loginDueno = useCallback(async (pin: string): Promise<boolean> => {
    const ok = await verifyOwnerPin(pin)
    if (ok) {
      try { sessionStorage.setItem(ROLE_KEY, 'dueno') } catch { /* noop */ }
      setRole('dueno')
    } else {
      try { await logFailedOwnerAttempt() } catch { /* noop */ }
    }
    return ok
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      sessionStorage.removeItem(ROLE_KEY)
      sessionStorage.removeItem(EMPLEADO_ID_KEY)
      sessionStorage.removeItem(EMPLEADO_NOMBRE_KEY)
    } catch { /* noop */ }
    setRole(null)
    setEmpleadoId(null)
    setEmpleadoNombre(null)
  }, [])

  return { role, empleadoId, empleadoNombre, loginEmpleado, loginAtencion, loginDueno, logout }
}
