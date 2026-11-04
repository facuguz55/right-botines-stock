import { describe, expect, it } from 'vitest'
import { estaAtrasado, vencimientoDespacho } from './plazoDespacho'

// Horas en Argentina (-03:00).
const ar = (s: string) => new Date(`${s}-03:00`)

describe('plazo de despacho (2 días hábiles)', () => {
  it('martes 12:30 vence el jueves 12:30', () => {
    expect(vencimientoDespacho(ar('2026-11-03T12:30:00').toISOString())).toEqual(ar('2026-11-05T12:30:00'))
  })
  it('jueves vence el lunes (saltea el finde)', () => {
    expect(vencimientoDespacho(ar('2026-11-05T18:00:00').toISOString())).toEqual(ar('2026-11-09T18:00:00'))
  })
  it('viernes vence el martes', () => {
    expect(vencimientoDespacho(ar('2026-11-06T10:00:00').toISOString())).toEqual(ar('2026-11-10T10:00:00'))
  })
  it('sábado o domingo cuenta desde el lunes 00:00: vence el miércoles 00:00', () => {
    expect(vencimientoDespacho(ar('2026-11-07T15:00:00').toISOString())).toEqual(ar('2026-11-11T00:00:00'))
    expect(vencimientoDespacho(ar('2026-11-08T23:00:00').toISOString())).toEqual(ar('2026-11-11T00:00:00'))
  })
  it('un pedido de 21 h hecho un martes de noche (00:30 UTC del miércoles) usa la fecha argentina', () => {
    expect(vencimientoDespacho('2026-11-04T00:30:00Z')).toEqual(ar('2026-11-05T21:30:00'))
  })
  it('atrasado solo después del vencimiento', () => {
    const f = ar('2026-11-03T12:30:00').toISOString()
    expect(estaAtrasado(f, ar('2026-11-05T12:00:00'))).toBe(false)
    expect(estaAtrasado(f, ar('2026-11-05T13:00:00'))).toBe(true)
  })
})
