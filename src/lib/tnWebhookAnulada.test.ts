import { describe, it, expect } from 'vitest'
import { ordenAnulada } from '../../api/tn-webhook'

describe('ordenAnulada', () => {
  it('pedido pagado y abierto es una venta', () => {
    expect(ordenAnulada({ status: 'open', payment_status: 'paid' })).toBe(false)
  })
  it('cancelado aunque siga "paid" no es venta (caso #1128)', () => {
    expect(ordenAnulada({ status: 'cancelled', payment_status: 'paid' })).toBe(true)
  })
  it('devuelto o anulado no es venta', () => {
    expect(ordenAnulada({ status: 'open', payment_status: 'refunded' })).toBe(true)
    expect(ordenAnulada({ status: 'open', payment_status: 'voided' })).toBe(true)
  })
})
