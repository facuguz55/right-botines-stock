import { describe, it, expect } from 'vitest'
import { talleParaProveedora } from './talleProveedora'

describe('talleParaProveedora', () => {
  it('suma uno al talle argentino de TiendaNube', () => {
    expect(talleParaProveedora('42 arg / 9,5 us')).toEqual({ arg: '42', planilla: '43' })
    expect(talleParaProveedora('39')).toEqual({ arg: '39', planilla: '40' })
  })
  it('respeta los medios talles', () => {
    expect(talleParaProveedora('40,5 arg / 8 us')).toEqual({ arg: '40,5', planilla: '41,5' })
  })
  it('sin número devuelve null', () => {
    expect(talleParaProveedora('Único')).toBeNull()
  })
})
