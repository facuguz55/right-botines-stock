import { describe, expect, it } from 'vitest'
import { decidirAutomatico, estaAbierto } from './crmHorario'

// Fechas en hora de Argentina (UTC-3): 2026-10-19 es lunes.
const ar = (iso: string) => new Date(`${iso}-03:00`)

describe('estaAbierto', () => {
  it.each([
    ['2026-10-19T09:00:00', true],   // lunes apertura
    ['2026-10-19T12:59:00', true],
    ['2026-10-19T13:00:00', false],  // cierra al mediodía
    ['2026-10-19T14:30:00', false],
    ['2026-10-19T16:00:00', true],
    ['2026-10-19T19:59:00', true],
    ['2026-10-19T20:00:00', false],
    ['2026-10-19T22:30:00', false],
    ['2026-10-24T10:00:00', true],   // sábado mañana
    ['2026-10-24T17:00:00', false],  // sábado tarde cerrado
    ['2026-10-25T11:00:00', false],  // domingo cerrado
  ])('%s -> %s', (iso, esperado) => {
    expect(estaAbierto(ar(iso))).toBe(esperado)
  })
})

describe('decidirAutomatico', () => {
  const base = { mensajeAnteriorAt: null, ultimaAusenciaAt: null, bienvenidaActiva: true, ausenciaActiva: true }
  it('conversación nueva en horario: bienvenida', () => {
    expect(decidirAutomatico({ ...base, ahora: ar('2026-10-19T10:00:00') })).toBe('bienvenida')
  })
  it('charla reciente en horario: nada', () => {
    expect(decidirAutomatico({ ...base, ahora: ar('2026-10-19T10:00:00'), mensajeAnteriorAt: ar('2026-10-19T08:00:00') })).toBeNull()
  })
  it('vuelve después de un día: bienvenida', () => {
    expect(decidirAutomatico({ ...base, ahora: ar('2026-10-20T10:00:00'), mensajeAnteriorAt: ar('2026-10-19T10:00:00') })).toBe('bienvenida')
  })
  it('fuera de horario: ausencia, y una sola vez cada 6 horas', () => {
    expect(decidirAutomatico({ ...base, ahora: ar('2026-10-19T22:00:00') })).toBe('ausencia')
    expect(decidirAutomatico({ ...base, ahora: ar('2026-10-19T23:00:00'), ultimaAusenciaAt: ar('2026-10-19T22:00:00') })).toBeNull()
    expect(decidirAutomatico({ ...base, ahora: ar('2026-10-20T05:00:00'), ultimaAusenciaAt: ar('2026-10-19T22:00:00') })).toBe('ausencia')
  })
  it('apagados: nada', () => {
    expect(decidirAutomatico({ ...base, ahora: ar('2026-10-19T22:00:00'), ausenciaActiva: false })).toBeNull()
    expect(decidirAutomatico({ ...base, ahora: ar('2026-10-19T10:00:00'), bienvenidaActiva: false })).toBeNull()
  })
})
