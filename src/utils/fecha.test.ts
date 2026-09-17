import { describe, it, expect } from 'vitest'
import { toISOLocal, semanaActual, inicioDiaLocalISO, finDiaLocalISO } from './fecha'

describe('toISOLocal', () => {
  it('coincide con UTC en medio del día (caso sin ambigüedad)', () => {
    // 15:00 UTC = 12:00 ART, mismo día calendario en ambos husos.
    expect(toISOLocal(new Date('2026-09-17T15:00:00.000Z'))).toBe('2026-09-17')
  })

  it('un instante después de las 21:00 ART sigue siendo el mismo día en Argentina aunque UTC ya haya cruzado la medianoche', () => {
    // 00:30 UTC del día 18 = 21:30 ART del día 17 — el bug original devolvía "2026-09-18".
    expect(toISOLocal(new Date('2026-09-18T00:30:00.000Z'))).toBe('2026-09-17')
  })

  it('justo antes de medianoche ART (23:59 ART = 02:59 UTC del día siguiente)', () => {
    expect(toISOLocal(new Date('2026-09-18T02:59:00.000Z'))).toBe('2026-09-17')
  })

  it('ya cruzó a medianoche en Argentina (00:00 ART = 03:00 UTC del día siguiente)', () => {
    expect(toISOLocal(new Date('2026-09-18T03:00:00.000Z'))).toBe('2026-09-18')
  })
})

describe('semanaActual', () => {
  it('un jueves devuelve el lunes de esa semana como inicio y el domingo como fin', () => {
    // 2026-09-17 es jueves.
    expect(semanaActual(new Date('2026-09-17T15:00:00.000Z'))).toEqual({ start: '2026-09-14', end: '2026-09-20' })
  })

  it('un lunes es el propio inicio de semana', () => {
    // 2026-09-14 es lunes.
    expect(semanaActual(new Date('2026-09-14T15:00:00.000Z'))).toEqual({ start: '2026-09-14', end: '2026-09-20' })
  })

  it('un domingo es el propio fin de semana', () => {
    // 2026-09-20 es domingo.
    expect(semanaActual(new Date('2026-09-20T15:00:00.000Z'))).toEqual({ start: '2026-09-14', end: '2026-09-20' })
  })

  it('respeta el día calendario de Argentina, no el de UTC, para el jueves de noche', () => {
    // 00:30 UTC del viernes 18 = jueves 17 a las 21:30 ART — sigue siendo la misma semana.
    expect(semanaActual(new Date('2026-09-18T00:30:00.000Z'))).toEqual({ start: '2026-09-14', end: '2026-09-20' })
  })
})

describe('inicioDiaLocalISO / finDiaLocalISO', () => {
  it('el rango de un día cubre exactamente 00:00 a 23:59:59.999 hora de Argentina', () => {
    const inicio = new Date(inicioDiaLocalISO('2026-09-17'))
    const fin = new Date(finDiaLocalISO('2026-09-17'))
    // Una venta a las 22:30 ART (01:30 UTC del día siguiente) tiene que caer
    // dentro del rango del día 17 — es justo el caso que antes se perdía.
    const ventaDeNoche = new Date('2026-09-18T01:30:00.000Z')
    expect(ventaDeNoche.getTime()).toBeGreaterThanOrEqual(inicio.getTime())
    expect(ventaDeNoche.getTime()).toBeLessThanOrEqual(fin.getTime())

    // Una venta a las 20:30 ART del día siguiente (18) no tiene que entrar.
    const ventaDeOtroDia = new Date('2026-09-18T23:30:00.000Z')
    expect(ventaDeOtroDia.getTime()).toBeGreaterThan(fin.getTime())
  })
})
