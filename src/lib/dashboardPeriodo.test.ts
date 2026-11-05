import { describe, it, expect } from 'vitest'
import { etiquetaPeriodo, rangoAnterior, resumirPeriodo, type ParVendido } from './dashboardPeriodo'

const m1 = { id: 'a', marca: 'Adidas', modelo: 'Predator', codigo_base: 'P1', foto: null }
const m2 = { id: 'b', marca: 'Nike', modelo: 'Mercurial', codigo_base: 'M1', foto: null }
// Las fechas llevan -03:00 (hora Argentina) para que el día no se corra.
const par = (fecha: string, precio: number, ganancia: number | null, canal: 'local' | 'web' = 'local', modelo = m1): ParVendido =>
  ({ fecha, precio, ganancia, canal, modelo })

describe('resumirPeriodo', () => {
  const pares = [
    par('2026-11-05T10:00:00-03:00', 100, 40),
    par('2026-11-05T23:30:00-03:00', 200, 80, 'web', m2),
    par('2026-11-04T12:00:00-03:00', 50, null, 'local', m2),
    par('2026-10-31T12:00:00-03:00', 999, 1),
  ]

  it('suma solo lo del día elegido, separando local y web', () => {
    const r = resumirPeriodo(pares, { start: '2026-11-05', end: '2026-11-05' })
    expect(r.facturado).toEqual({ local: 100, web: 200, total: 300 })
    expect(r.pares).toEqual({ local: 1, web: 1 })
    expect(r.gananciaBruta).toBe(120)
  })

  it('un mes entero deja afuera lo del mes anterior', () => {
    const r = resumirPeriodo(pares, { start: '2026-11-01', end: '2026-11-30' })
    expect(r.facturado.total).toBe(350)
  })

  it('marca los modelos sin costo y arma el ranking por ganancia', () => {
    const r = resumirPeriodo(pares, { start: '2026-11-01', end: '2026-11-05' })
    expect(r.sinCosto).toEqual({ cantidad: 1, facturado: 50, ejemplos: ['Nike Mercurial'] })
    expect(r.ranking[0]).toMatchObject({ id: 'a', ganancia: 40, margen: 40 })
    expect(r.ranking[1]).toMatchObject({ id: 'b', ganancia: null })
  })
})

describe('rangoAnterior y etiqueta', () => {
  it('mes → mes anterior completo; días → los días de justo antes', () => {
    expect(rangoAnterior({ start: '2026-11-01', end: '2026-11-05' }, '2026-11-05')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(rangoAnterior({ start: '2026-11-02', end: '2026-11-05' }, '2026-11-05')).toEqual({ start: '2026-10-29', end: '2026-11-01' })
    expect(rangoAnterior({ start: '2026-11-05', end: '2026-11-05' }, '2026-11-05')).toEqual({ start: '2026-11-04', end: '2026-11-04' })
  })

  it('etiquetas', () => {
    const mes = (m: string) => `mes ${m}`
    expect(etiquetaPeriodo({ start: '2026-11-05', end: '2026-11-05' }, '2026-11-05', mes)).toBe('hoy')
    expect(etiquetaPeriodo({ start: '2026-11-04', end: '2026-11-04' }, '2026-11-05', mes)).toBe('ayer')
    expect(etiquetaPeriodo({ start: '2026-10-01', end: '2026-10-31' }, '2026-11-05', mes)).toBe('mes 2026-10')
    expect(etiquetaPeriodo({ start: '2026-11-02', end: '2026-11-05' }, '2026-11-05', mes)).toBe('02/11 al 05/11')
  })
})
