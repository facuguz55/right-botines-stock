import { describe, it, expect } from 'vitest'
import { rangoDe, resumirRango, sumarDias, cantidadDias, fechaAR } from './tnRango'

const orden = (iso: string, total = '1000', extra: Record<string, string> = {}) => ({
  created_at: iso, total, status: 'open', payment_status: 'paid', ...extra,
})

describe('rangoDe', () => {
  it('hoy, ayer, mes y 60 días', () => {
    expect(rangoDe('hoy', '2026-10-08')).toEqual({ desde: '2026-10-08', hasta: '2026-10-08' })
    expect(rangoDe('ayer', '2026-10-08')).toEqual({ desde: '2026-10-07', hasta: '2026-10-07' })
    expect(rangoDe('mes', '2026-10-08')).toEqual({ desde: '2026-10-01', hasta: '2026-10-08' })
    expect(rangoDe('60d', '2026-10-08')).toEqual({ desde: '2026-08-10', hasta: '2026-10-08' })
  })
  it('ayer el 1° del mes cae en el mes anterior', () => {
    expect(rangoDe('ayer', '2026-10-01')).toEqual({ desde: '2026-09-30', hasta: '2026-09-30' })
    expect(rangoDe('ayer', '2027-01-01')).toEqual({ desde: '2026-12-31', hasta: '2026-12-31' })
  })
  it('personalizado: respeta el rango y acomoda si está al revés', () => {
    expect(rangoDe('custom', '2026-10-08', { desde: '2026-09-01', hasta: '2026-09-15' })).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' })
    expect(rangoDe('custom', '2026-10-08', { desde: '2026-09-15', hasta: '2026-09-01' })).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' })
    expect(rangoDe('custom', '2026-10-08', { desde: '2026-09-15', hasta: '' })).toEqual({ desde: '2026-09-15', hasta: '2026-09-15' })
  })
})

describe('días', () => {
  it('sumarDias y cantidadDias', () => {
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01')
    expect(cantidadDias({ desde: '2026-10-01', hasta: '2026-10-08' })).toBe(8)
    expect(cantidadDias({ desde: '2026-10-08', hasta: '2026-10-08' })).toBe(1)
  })
  it('fechaAR usa la hora de Argentina (UTC-3)', () => {
    expect(fechaAR('2026-10-08T02:30:00Z')).toBe('2026-10-07') // 23:30 del 7 en Argentina
    expect(fechaAR('2026-10-08T03:00:00Z')).toBe('2026-10-08')
  })
})

describe('resumirRango', () => {
  const ordenes = [
    orden('2026-10-08T15:00:00Z', '1000'),                          // 12:00 AR, 8/10
    orden('2026-10-08T15:30:00Z', '3000'),                          // 12:30 AR, 8/10
    orden('2026-10-08T02:30:00Z', '500'),                           // 23:30 AR del 7/10
    orden('2026-10-07T18:00:00Z', '700', { status: 'cancelled' }),  // cancelada: no cuenta
    orden('2026-10-07T18:00:00Z', '900', { payment_status: 'pending' }), // sin pagar: no cuenta
    orden('2026-09-30T15:00:00Z', '2000'),                          // fuera del rango
  ]
  it('cuenta solo órdenes pagadas del rango, en hora Argentina', () => {
    const r = resumirRango(ordenes, { desde: '2026-10-07', hasta: '2026-10-08' })
    expect(r.ordenes).toBe(3)
    expect(r.facturado).toBe(4500)
    expect(r.ticketPromedio).toBe(1500)
    expect(r.porDia).toEqual([
      { name: '07/10', value: 1, facturado: 500 },
      { name: '08/10', value: 2, facturado: 4000 },
    ])
    expect(r.horaPico).toEqual({ name: '12:00', value: 2 })
  })
  it('un día sin ventas da ceros y no rompe', () => {
    const r = resumirRango(ordenes, { desde: '2026-10-05', hasta: '2026-10-05' })
    expect(r.ordenes).toBe(0)
    expect(r.ticketPromedio).toBe(0)
    expect(r.horaPico).toEqual({ name: '—', value: 0 })
    expect(r.porDia).toEqual([{ name: '05/10', value: 0, facturado: 0 }])
  })
  it('medianoche argentina cuenta como hora 0', () => {
    const r = resumirRango([orden('2026-10-08T03:10:00Z')], { desde: '2026-10-08', hasta: '2026-10-08' })
    expect(r.porHora[0].value).toBe(1)
  })
})
