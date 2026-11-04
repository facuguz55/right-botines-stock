import { describe, it, expect } from 'vitest'
import { stockFueraDelLocal } from './tnUbicaciones'

describe('stockFueraDelLocal', () => {
  it('suma lo que no está en el local', () => {
    expect(stockFueraDelLocal([{ location_id: 'S', stock: 1 }, { location_id: 'C', stock: 2 }], 'S')).toBe(2)
  })
  it('sin ubicaciones o sin saber cuál es el local: todo del local', () => {
    expect(stockFueraDelLocal(undefined, 'S')).toBe(0)
    expect(stockFueraDelLocal([{ location_id: 'C', stock: 2 }], null)).toBe(0)
  })
  it('ignora negativos y nulos', () => {
    expect(stockFueraDelLocal([{ location_id: 'C', stock: null }, { location_id: 'D', stock: -1 }], 'S')).toBe(0)
  })
})
