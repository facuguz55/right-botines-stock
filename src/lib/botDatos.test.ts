import { describe, expect, it } from 'vitest'
import { armarDatosNegocio, cargarDatosNegocio, formatearCatalogo, formatearComprasLocal, formatearPedidos, type ModeloCatalogo } from './botDatos'

const base: Omit<ModeloCatalogo, 'marca' | 'modelo' | 'modelo_talles'> = {
  categoria: 'F11', gama: 'Alta', precio_venta: 174340, precio_promocional: null, precio_efectivo: 135000,
}

describe('catálogo para el bot', () => {
  it('solo modelos con stock, con precios y talles; el último par se marca', () => {
    const txt = formatearCatalogo([
      { ...base, marca: 'Nike', modelo: 'Phantom GX6 celeste rosita', modelo_talles: [{ talle_arg: 42, cantidad: 1 }, { talle_arg: 40, cantidad: 3 }, { talle_arg: 41, cantidad: 0 }] },
      { ...base, marca: 'Adidas', modelo: 'Predator Negro', modelo_talles: [{ talle_arg: 40, cantidad: 0 }] },
    ])
    expect(txt).toBe('- Nike Phantom GX6 celeste rosita | Fútbol 11 | gama alta | transferencia $135.000, tarjeta $174.340 | talles 40, 42 (último par)')
  })
  it('no muestra cantidades exactas ni el costo', () => {
    const txt = formatearCatalogo([{ ...base, marca: 'Nike', modelo: 'X', modelo_talles: [{ talle_arg: 40, cantidad: 7 }] }])
    expect(txt).not.toMatch(/\b7\b/)
    expect(txt).not.toMatch(/costo/i)
  })
  it('"Mixto-" se muestra limpio y el promocional es el precio con tarjeta', () => {
    const txt = formatearCatalogo([{ ...base, marca: 'Mixto-', modelo: 'Nike Phantom', precio_promocional: 150000, modelo_talles: [{ talle_arg: 39, cantidad: 2 }] }])
    expect(txt).toContain('Mixto Nike Phantom')
    expect(txt).toContain('tarjeta $150.000')
  })
})

describe('pedidos y compras del cliente', () => {
  it('pedido web con estado legible y sin dirección ni mail', () => {
    const txt = formatearPedidos([{
      number: 1022, tn_created_at: '2026-11-03T15:00:00Z', status: 'open', payment_status: 'paid', shipping_status: 'shipped',
      total: '135000', products: [{ name: 'Nike Superfly Blanco Naranja (41 arg / 8,5 us)', quantity: 1 }],
    }])
    expect(txt).toBe('- Pedido #1022 del 3/11: Nike Superfly Blanco Naranja (41 arg / 8,5 us) | estado: Enviado | total $135.000')
  })
  it('compras del local', () => {
    expect(formatearComprasLocal([{ fecha: '2026-10-05T15:00:00Z', talle_arg: 41, modelos: { marca: 'Nike', modelo: 'Tiempo' } }]))
      .toBe('- 5/10: Nike Tiempo talle 41')
  })
  it('lo que falta se avisa, para que el bot no invente', () => {
    const d = armarDatosNegocio({ catalogo: '', pedidos: '', compras: '' })
    expect(d.stock).toContain('no afirmes nada de stock')
    expect(d.cliente).toContain('no encontramos pedidos web')
  })
})

describe('cargarDatosNegocio', () => {
  it('si una parte falla, las demás siguen', async () => {
    const leer = async (path: string) => {
      if (path.startsWith('modelos')) throw new Error('caída')
      if (path.startsWith('tn_clientes')) return []
      if (path.startsWith('tn_ordenes')) return [{ number: 5, tn_created_at: '2026-11-01T12:00:00Z', status: 'open', payment_status: 'paid', shipping_status: null, total: 1000, products: [] }]
      return []
    }
    const d = await cargarDatosNegocio(leer, { telefono: '5493424633285', crmClienteId: null })
    expect(d.stock).toContain('no afirmes nada de stock')
    expect(d.cliente).toContain('Pedido #5')
  })
  it('sin teléfono no busca pedidos', async () => {
    const pedidos: string[] = []
    await cargarDatosNegocio(async p => { pedidos.push(p); return [] }, { telefono: null, crmClienteId: null }, { catalogo: [] })
    expect(pedidos.some(p => p.startsWith('tn_'))).toBe(false)
  })
})
