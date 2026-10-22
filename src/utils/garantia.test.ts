import { describe, expect, it } from 'vitest'
import { estadoGarantia, textoGarantia } from './garantia'

const AHORA = new Date('2026-10-22T15:00:00Z').getTime() // 22/10 12:00 en Argentina

describe('estadoGarantia', () => {
  it('compra de hace 10 días: vigente, quedan 20', () => {
    const g = estadoGarantia('2026-10-12T15:00:00Z', 'Alta', AHORA)
    expect(g).toMatchObject({ vigente: true, dias: 20, venceEl: '11/11/2026' })
    expect(textoGarantia(g!)).toBe('Quedan 20 días')
  })
  it('a los 30 días justos todavía cubre (vence hoy)', () => {
    const g = estadoGarantia('2026-09-22T15:00:00Z', 'Alta', AHORA)
    expect(g).toMatchObject({ vigente: true, dias: 0 })
    expect(textoGarantia(g!)).toBe('Vence hoy')
  })
  it('a los 31 días ya venció', () => {
    const g = estadoGarantia('2026-09-21T15:00:00Z', 'Alta', AHORA)
    expect(g).toMatchObject({ vigente: false, dias: 1 })
    expect(textoGarantia(g!)).toBe('Venció hace 1 día')
  })
  it('cuenta días de calendario en hora de Argentina, no UTC', () => {
    // 01:00 UTC del 22/10 = 22:00 del 21/10 en Argentina: ayer para el negocio
    const g = estadoGarantia('2026-10-22T01:00:00Z', 'Alta', AHORA)
    expect(g).toMatchObject({ vigente: true, dias: 29 })
  })
  it('solo gama alta tiene garantía', () => {
    expect(estadoGarantia('2026-10-12T15:00:00Z', 'Media', AHORA)).toBeNull()
    expect(estadoGarantia('2026-10-12T15:00:00Z', null, AHORA)).toBeNull()
    expect(estadoGarantia('2026-10-12T15:00:00Z', 'alta', AHORA)).not.toBeNull()
  })
})
