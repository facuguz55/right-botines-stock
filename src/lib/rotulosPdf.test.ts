import { describe, expect, it } from 'vitest'
import { agruparRotulos, type PaginaRotulos } from './rotulosPdf'

// Posiciones reales del PDF de rótulos de Andreani del 04/11 (A4 596×842),
// pasadas a coordenadas PDF (y desde abajo).
const H = 842
const t = (s: string, x: number, yDesdeArriba: number) => ({ s, x, y: H - yDesdeArriba })

describe('agruparRotulos', () => {
  it('separa una hoja de 2×2 y asigna a cada pedido su seguimiento', () => {
    const pagina: PaginaRotulos = {
      w: 596, h: H, textos: [
        t('N° de seguimiento: 360003150581500', 60, 33), t('N° de seguimiento: 360003152127690', 350, 33),
        t('N° Interno: #1042-MQP3M2EF82', 60, 147), t('N° Interno: #1054-HDZ1TYBASH', 350, 147),
        t('N° de seguimiento: 360003150581500', 60, 398), t('N° de seguimiento: 360003152127690', 350, 398),
        t('N° de seguimiento: 360003152127820', 60, 435), t('N° de seguimiento: 360003152128240', 350, 435),
        t('N° Interno: #1063-76XZMFVWQH', 60, 549), t('N° Interno: #1065-84JZ29DGZ1', 350, 549),
      ],
    }
    const r = agruparRotulos([pagina])
    expect(r.map(x => [x.numero, x.seguimiento])).toEqual([
      [1042, '360003150581500'], [1054, '360003152127690'], [1063, '360003152127820'], [1065, '360003152128240'],
    ])
    expect(r[0].zona).toEqual([0, 421, 298, 421])
    expect(r[3].zona).toEqual([298, 0, 298, 421])
  })

  it('la última hoja con un solo rótulo se recorta igual (grilla)', () => {
    const llena = { w: 596, h: H, textos: [t('#1042-A', 60, 147), t('#1054-B', 350, 147)] }
    const r = agruparRotulos([llena, { w: 596, h: H, textos: [t('#1076-7ZQ', 60, 147)] }])
    expect(r[2]).toMatchObject({ numero: 1076, pagina: 1, zona: [0, 421, 298, 421] })
  })

  it('un PDF de un rótulo por hoja toma la hoja entera', () => {
    const r = agruparRotulos([{ w: 596, h: H, textos: [t('#1076-7ZQ', 60, 549), t('360003152744800', 150, 435)] }])
    expect(r).toEqual([{ numero: 1076, seguimiento: '360003152744800', pagina: 0, zona: [0, 0, 596, H] }])
  })

  it('hojas sin rótulos no suman nada', () => {
    expect(agruparRotulos([{ w: 596, h: H, textos: [t('Hola', 10, 10)] }])).toEqual([])
  })
})
