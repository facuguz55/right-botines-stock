import { describe, it, expect } from 'vitest'
import { filterModelos } from './useModelos'
import type { Modelo, ModeloFilters, ModeloTalle } from '../types'

function talle(talle_arg: number, cantidad: number): ModeloTalle {
  return { id: `t-${talle_arg}-${cantidad}-${Math.random()}`, modelo_id: 'm', talle_us: talle_arg, talle_arg, cantidad, stock_minimo: 1 }
}

function modelo(overrides: Partial<Modelo> & { modelo_talles: ModeloTalle[] }): Modelo {
  return {
    id: overrides.id ?? Math.random().toString(),
    marca: 'Adidas',
    modelo: 'Test',
    categoria: 'F5',
    gama: 'Alta',
    precio_costo: 1000,
    precio_venta: 2000,
    precio_promocional: null,
    precio_efectivo: null,
    codigo_base: 'TEST-1',
    notas: null,
    created_at: new Date().toISOString(),
    modelo_fotos: [],
    ...overrides,
  }
}

const DEFAULT_FILTERS: ModeloFilters = {
  marca: '', categoria: '', gama: '', talle: '', disponibilidad: 'todos', search: '',
}

describe('filterModelos — filtro de talle + disponibilidad', () => {
  it('excluye un modelo que no tiene el talle filtrado, aunque tenga stock en otro', () => {
    const m = modelo({ modelo_talles: [talle(44, 5)] }) // no tiene talle 41
    const res = filterModelos([m], { ...DEFAULT_FILTERS, talle: '41' })
    expect(res).toHaveLength(0)
  })

  it('"Disponibles" + talle mira el stock DE ESE TALLE, no el total del modelo', () => {
    // Talle 41 sin stock, talle 44 con stock — el modelo tiene stock "en general"
    // pero no en el talle que se está pidiendo.
    const m = modelo({ modelo_talles: [talle(41, 0), talle(44, 5)] })
    const res = filterModelos([m], { ...DEFAULT_FILTERS, talle: '41', disponibilidad: 'disponible' })
    expect(res).toHaveLength(0)
  })

  it('"Disponibles" + talle sí incluye el modelo cuando ESE talle tiene stock', () => {
    const m = modelo({ modelo_talles: [talle(41, 2), talle(44, 0)] })
    const res = filterModelos([m], { ...DEFAULT_FILTERS, talle: '41', disponibilidad: 'disponible' })
    expect(res).toHaveLength(1)
  })

  it('sin talle elegido, "Disponibles" sigue mirando el total del modelo (comportamiento previo)', () => {
    const m = modelo({ modelo_talles: [talle(41, 0), talle(44, 5)] })
    const res = filterModelos([m], { ...DEFAULT_FILTERS, disponibilidad: 'disponible' })
    expect(res).toHaveLength(1)
  })
})
