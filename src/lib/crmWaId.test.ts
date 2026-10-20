import { describe, expect, it } from 'vitest'
import { variantesWaId } from './crmWaId'

describe('variantesWaId', () => {
  it('con 9 devuelve las dos formas', () => {
    expect(variantesWaId('5493425903310')).toEqual(['5493425903310', '543425903310'])
  })
  it('sin 9 devuelve las dos formas', () => {
    expect(variantesWaId('543425903310')).toEqual(['5493425903310', '543425903310'])
  })
  it('otros países quedan igual', () => {
    expect(variantesWaId('5215512345678')).toEqual(['5215512345678'])
  })
})
