import { describe, it, expect } from 'vitest'
import { valorHoraEn, calcularPagos, type ValorHora, type TurnoParaPago } from './valoresHora'

const ANA = 'ana-id'
const BETO = 'beto-id'

describe('valorHoraEn', () => {
  it('devuelve null antes de que exista el primer valor cargado', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
    ]
    expect(valorHoraEn(valores, ANA, '2026-02-28')).toBeNull()
  })

  it('un turno de marzo se paga al valor de marzo aunque hoy la persona cobre más', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
      { id: '2', empleado_id: ANA, valor_hora: 2000, vigente_desde: '2026-08-01' },
    ]
    expect(valorHoraEn(valores, ANA, '2026-03-15')).toBe(1000)
  })

  it('el mismo día del aumento ya rige el valor nuevo', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
      { id: '2', empleado_id: ANA, valor_hora: 2000, vigente_desde: '2026-08-01' },
    ]
    expect(valorHoraEn(valores, ANA, '2026-08-01')).toBe(2000)
  })

  it('no mezcla el valor de una persona con el de otra', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
      { id: '2', empleado_id: BETO, valor_hora: 5000, vigente_desde: '2026-03-01' },
    ]
    expect(valorHoraEn(valores, ANA, '2026-06-01')).toBe(1000)
    expect(valorHoraEn(valores, BETO, '2026-06-01')).toBe(5000)
  })

  it('el dueño (empleado_id null) tiene su propio valor, sin mezclarse con nadie', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: null, valor_hora: 3000, vigente_desde: '2026-01-01' },
      { id: '2', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-01-01' },
    ]
    expect(valorHoraEn(valores, null, '2026-06-01')).toBe(3000)
    expect(valorHoraEn(valores, ANA, '2026-06-01')).toBe(1000)
  })
})

describe('calcularPagos', () => {
  it('un turno de marzo se paga al valor de marzo aunque hoy cobre más (caso completo)', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
      { id: '2', empleado_id: ANA, valor_hora: 2000, vigente_desde: '2026-08-01' },
    ]
    const turnos: TurnoParaPago[] = [
      { empleado_id: ANA, hora_entrada: '2026-03-10T09:00:00Z', hora_salida: '2026-03-10T17:00:00Z' }, // 8hs
    ]
    const [pago] = calcularPagos(turnos, valores)
    expect(pago.horas).toBe(8)
    expect(pago.importe).toBe(8000)
    expect(pago.horasSinValorizar).toBe(0)
  })

  it('las horas trabajadas antes del primer valor se suman a horas pero no al importe', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
    ]
    const turnos: TurnoParaPago[] = [
      { empleado_id: ANA, hora_entrada: '2026-01-10T09:00:00Z', hora_salida: '2026-01-10T13:00:00Z' }, // 4hs, sin valor
      { empleado_id: ANA, hora_entrada: '2026-03-10T09:00:00Z', hora_salida: '2026-03-10T13:00:00Z' }, // 4hs, con valor
    ]
    const [pago] = calcularPagos(turnos, valores)
    expect(pago.horas).toBe(8)
    expect(pago.horasSinValorizar).toBe(4)
    expect(pago.importe).toBe(4000) // solo las 4hs de marzo
  })

  it('las fracciones de hora se pagan proporcionales', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
    ]
    const turnos: TurnoParaPago[] = [
      { empleado_id: ANA, hora_entrada: '2026-03-10T09:00:00Z', hora_salida: '2026-03-10T10:30:00Z' }, // 1.5hs
    ]
    const [pago] = calcularPagos(turnos, valores)
    expect(pago.horas).toBe(1.5)
    expect(pago.importe).toBe(1500)
  })

  it('el importe se calcula sobre las horas exactas, no sobre las redondeadas', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
    ]
    // 1h 50m = 1.8333... horas exactas — redondeado a 1 decimal se vería "1.8"
    const turnos: TurnoParaPago[] = [
      { empleado_id: ANA, hora_entrada: '2026-03-10T09:00:00Z', hora_salida: '2026-03-10T10:50:00Z' },
    ]
    const [pago] = calcularPagos(turnos, valores)
    expect(pago.horas).toBeCloseTo(1.8333333, 5)
    expect(pago.importe).toBeCloseTo(1833.333, 2)
  })

  it('no mezcla el sueldo ni las horas de una persona con las de otra', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
      { id: '2', empleado_id: BETO, valor_hora: 5000, vigente_desde: '2026-03-01' },
    ]
    const turnos: TurnoParaPago[] = [
      { empleado_id: ANA, hora_entrada: '2026-03-10T09:00:00Z', hora_salida: '2026-03-10T13:00:00Z' }, // 4hs
      { empleado_id: BETO, hora_entrada: '2026-03-10T09:00:00Z', hora_salida: '2026-03-10T11:00:00Z' }, // 2hs
    ]
    const pagos = calcularPagos(turnos, valores)
    const pagoAna = pagos.find(p => p.empleadoId === ANA)!
    const pagoBeto = pagos.find(p => p.empleadoId === BETO)!
    expect(pagoAna.horas).toBe(4)
    expect(pagoAna.importe).toBe(4000)
    expect(pagoBeto.horas).toBe(2)
    expect(pagoBeto.importe).toBe(10000)
  })

  it('ignora turnos todavía abiertos (sin hora_salida)', () => {
    const valores: ValorHora[] = [
      { id: '1', empleado_id: ANA, valor_hora: 1000, vigente_desde: '2026-03-01' },
    ]
    const turnos: TurnoParaPago[] = [
      { empleado_id: ANA, hora_entrada: '2026-03-10T09:00:00Z', hora_salida: null },
    ]
    expect(calcularPagos(turnos, valores)).toEqual([])
  })
})
