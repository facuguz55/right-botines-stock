import { describe, expect, it } from 'vitest'
import { SILENCIAR_SIEMPRE, estaSilenciada } from './crmSilencio'

const AHORA = new Date('2026-10-23T15:00:00Z').getTime()

describe('estaSilenciada', () => {
  it('sin fecha no está silenciada', () => {
    expect(estaSilenciada({}, AHORA)).toBe(false)
    expect(estaSilenciada({ silenciada_hasta: null }, AHORA)).toBe(false)
  })
  it('silenciada hasta una fecha futura', () => {
    expect(estaSilenciada({ silenciada_hasta: '2026-10-23T23:00:00Z' }, AHORA)).toBe(true)
  })
  it('cuando pasa la fecha, deja de estar silenciada', () => {
    expect(estaSilenciada({ silenciada_hasta: '2026-10-23T14:59:59Z' }, AHORA)).toBe(false)
  })
  it('"siempre" sigue silenciada', () => {
    expect(estaSilenciada({ silenciada_hasta: SILENCIAR_SIEMPRE }, AHORA)).toBe(true)
  })
})
