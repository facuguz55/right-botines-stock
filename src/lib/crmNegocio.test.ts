import { describe, expect, it } from 'vitest'
import { EJEMPLOS_ESTILO_CAMI, INFO_NEGOCIO } from './crmNegocio'

// La ficha del negocio la "dice" el bot a cualquiera que escriba por
// WhatsApp: nada interno ni sensible puede terminar ahí.
describe('INFO_NEGOCIO', () => {
  it('tiene lo básico que preguntan los clientes', () => {
    for (const dato of [
      'right.com.ar', 'Fray Cayetano Rodríguez 3985', 'lunes a viernes de 9 a 13 y de 16 a 20', 'sábados de 9 a 13',
      '3 cuotas sin interés', '30 días', 'Andreani', '$9.500', '1 a 4 días hábiles', 'fuera de Argentina', '$19.000',
      '6 pares', 'ARG 40 = EU 41 = US 8 = 26 cm',
    ]) {
      expect(INFO_NEGOCIO.toLowerCase()).toContain(dato.toLowerCase())
    }
  })

  it('no filtra información interna', () => {
    for (const interno of [/nova/i, /agencia/i, /supabase/i, /factur/i, /precio de costo/i, /ganancia/i, /proveedor/i, /empleado/i, /sueldo/i]) {
      expect(INFO_NEGOCIO).not.toMatch(interno)
    }
  })

  it('no tiene datos bancarios (los pasa una persona, nunca la IA)', () => {
    const todo = [INFO_NEGOCIO, ...EJEMPLOS_ESTILO_CAMI].join('\n')
    expect(todo).not.toMatch(/\d{15,}/) // CBU / CVU
    expect(todo).not.toMatch(/\d{2}-\d{8}-\d/) // CUIL / CUIT
    expect(todo).not.toMatch(/[A-Z]{3,}\.[A-Z]{3,}/) // alias tipo NARANJA.BOTINES
    expect(todo).not.toMatch(/fern[aá]ndez/i) // titular de la cuenta
  })

  it('no afirma nada sobre originalidad: eso lo responde una persona', () => {
    // Todo menos la propia regla que le dice que no conteste eso.
    const regla = /- Si preguntan si son originales[^\n]*/
    expect(INFO_NEGOCIO).toMatch(regla)
    const todo = [INFO_NEGOCIO.replace(regla, ''), ...EJEMPLOS_ESTILO_CAMI].join('\n')
    expect(todo).not.toMatch(/r[eé]plica|G5|original/i)
    expect(INFO_NEGOCIO).toMatch(/originales.*NO respondas/s)
  })
})
