import { describe, expect, it } from 'vitest'
import {
  esConsultaEnvioSegura,
  extraerNumeroPedido,
  mencionaPedido,
  respuestaEstadoPedido,
  resumenEnvio,
  sufijoTelefono,
  textoEntrega,
  type PedidoTN,
} from './crmPedidos'

const base: PedidoTN = {
  id: 1,
  number: 1234,
  status: 'open',
  payment_status: 'paid',
  shipping_status: 'unpacked',
  created_at: '2026-09-20T15:00:00-03:00',
  total: '120000',
  products: [{ name: 'Adidas F50 Negro Blanco (40)', quantity: 1 }],
}
const ahora = new Date('2026-09-28T12:00:00-03:00')

describe('teléfonos', () => {
  it('mismo sufijo en cualquier formato argentino', () => {
    const esperado = '4633285'
    expect(sufijoTelefono('5493424633285')).toBe(esperado)
    expect(sufijoTelefono('+54 9 342 463-3285')).toBe(esperado)
    expect(sufijoTelefono('0342 15 463-3285')).toBe(esperado)
    expect(sufijoTelefono('3424633285')).toBe(esperado)
  })
  it('números muy cortos no se usan', () => {
    expect(sufijoTelefono('12345')).toBeNull()
    expect(sufijoTelefono(null)).toBeNull()
  })
})

describe('resumenEnvio', () => {
  it('pagado sin empaquetar → en preparación', () => {
    expect(resumenEnvio(base).estado).toBe('en_preparacion')
  })
  it('pago pendiente', () => {
    expect(resumenEnvio({ ...base, payment_status: 'pending' }).estado).toBe('pago_pendiente')
  })
  it('cancelado gana a todo', () => {
    expect(resumenEnvio({ ...base, status: 'cancelled', shipping_status: 'shipped' }).estado).toBe('cancelado')
  })
  it('enviado con los campos viejos', () => {
    const r = resumenEnvio({ ...base, shipping_status: 'shipped', shipping_tracking_number: 'TN123', shipping_tracking_url: 'https://seguimiento/TN123' })
    expect(r).toMatchObject({ estado: 'enviado', codigo: 'TN123', url: 'https://seguimiento/TN123' })
  })
  it('enviado con fulfillments (API nueva)', () => {
    const r = resumenEnvio({
      ...base,
      shipping_status: null,
      fulfillments: [{
        status: 'DISPATCHED',
        tracking_info: { code: 'AND999', url: 'https://andreani/AND999' },
        shipping: { carrier: { name: 'Andreani' }, min_delivery_date: '2026-09-29T10:00:00-03:00', max_delivery_date: '2026-10-01T10:00:00-03:00' },
      }],
    })
    expect(r).toMatchObject({ estado: 'enviado', codigo: 'AND999', transportista: 'Andreani' })
    expect(textoEntrega(r, ahora)).toBe('Llega aprox. entre el 29/9 y el 1/10.')
  })
  it('retiro en el local', () => {
    expect(resumenEnvio({ ...base, fulfillments: [{ status: 'READY_FOR_PICKUP' }] }).estado).toBe('listo_retirar')
  })
  it('fecha estimada con días hábiles de la opción de envío', () => {
    const r = resumenEnvio({ ...base, paid_at: '2026-09-25T10:00:00-03:00', shipping_min_days: 3, shipping_max_days: 5 })
    // viernes 25/9 + 3 hábiles = miércoles 30/9; + 5 = viernes 2/10
    expect(textoEntrega(r, ahora)).toBe('Llega aprox. entre el 30/9 y el 2/10.')
  })
  it('no promete una fecha que ya pasó', () => {
    const r = resumenEnvio({ ...base, paid_at: '2026-09-01T10:00:00-03:00', shipping_min_days: 3, shipping_max_days: 5 })
    expect(textoEntrega(r, ahora)).toBeNull()
  })
})

describe('respuestaEstadoPedido', () => {
  it('enviado: código, link y transportista, sin inventar lo que falta', () => {
    const txt = respuestaEstadoPedido({ ...base, shipping_status: 'shipped', shipping_option: 'Correo Argentino', shipping_tracking_number: 'CA123' }, ahora)
    expect(txt).toContain('#1234')
    expect(txt).toContain('Adidas F50 Negro Blanco (40)')
    expect(txt).toContain('por Correo Argentino')
    expect(txt).toContain('Código de seguimiento: CA123')
    expect(txt).not.toContain('Seguilo acá')
    expect(txt).not.toContain('Llega aprox')
  })
  it('en preparación', () => {
    expect(respuestaEstadoPedido(base, ahora)).toMatch(/lo estamos preparando/)
  })
})

describe('detección en el mensaje', () => {
  it.each([
    ['cuándo me llega el pedido?', true],
    ['me pasás el código de seguimiento?', true],
    ['ya lo enviaron?', true],
    ['compré unos botines y tengo un problema, tienen garantía?', true],
    ['que tenes en talle 38', false],
  ])('%s → menciona pedido: %s', (texto, esperado) => {
    expect(mencionaPedido(texto)).toBe(esperado)
  })

  it('consulta segura (sin IA) solo con frases inequívocas', () => {
    expect(esConsultaEnvioSegura('cuando me llega?')).toBe(true)
    expect(esConsultaEnvioSegura('pasame el seguimiento')).toBe(true)
    expect(esConsultaEnvioSegura('tenés código de descuento?')).toBe(false)
  })

  it.each([
    ['mi pedido #1234 no llegó', 1234],
    ['pedido 5678', 5678],
    ['orden nro 4321', 4321],
    ['compra n° 998', 998],
    ['talle 40', null],
    ['me llamo al 3424633285', null],
  ])('%s → número %s', (texto, numero) => {
    expect(extraerNumeroPedido(texto)).toBe(numero)
  })
})
