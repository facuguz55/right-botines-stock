import { describe, expect, it } from 'vitest'
import { INFO_NEGOCIO } from './crmNegocio'

// La ficha del negocio la "dice" el bot a cualquiera que escriba por
// WhatsApp: nada interno puede terminar ahí.
describe('INFO_NEGOCIO', () => {
  it('tiene lo básico que preguntan los clientes', () => {
    for (const dato of ['right.com.ar', 'Fray Cayetano Rodríguez 3985', 'lunes a sábado', '3 cuotas sin interés', '30 días', '24 hs hábiles']) {
      expect(INFO_NEGOCIO.toLowerCase()).toContain(dato.toLowerCase())
    }
  })

  it('no filtra información interna', () => {
    for (const interno of [/nova/i, /agencia/i, /supabase/i, /factur/i, /precio de costo/i, /ganancia/i, /proveedor/i, /empleado/i, /sueldo/i]) {
      expect(INFO_NEGOCIO).not.toMatch(interno)
    }
  })
})
