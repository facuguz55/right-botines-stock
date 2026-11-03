import { describe, it, expect } from 'vitest'
import { parsearPedido, parsearTalles, type TextoPdf } from './stockBaPdf'

const t = (s: string, x: number, y: number): TextoPdf => ({ s, x, y })

// Imita la hoja de la proveedora: encabezado a la izquierda y derecha, y una
// fila por modelo con sus columnas a la misma altura.
function pagina() {
  return {
    textos: [
      t('FECHA: 27/10/2026', 40, 584), t('ID DE PEDIDO: 2298', 40, 566), t('VENDEDOR: JACKELINE ARGENTINA', 40, 528),
      t('UNIDADES: 11', 509, 584), t('TOTAL: $1,839', 509, 528),
      t('CÓDIGO', 47, 479), t('FOTO', 119, 479), t('PRODUCTO', 264, 479), t('CANTIDAD', 405, 479), t('TALLAS', 523, 479),
      t('1218', 55, 450), t('719 GC F11 PHANTOM NEGRO/BLANCO CHULO NEGRO', 188, 450), t('5', 423, 450), t('41/1, 42/2, 43/2', 509, 450), t('$69', 652, 450), t('$345', 716, 450),
      t('1230', 54, 375), t('721 GC F11 PHANTOM FUCSIA/BLANCO', 187, 375), t('6', 423, 375), t('39/1, 40/3, 41/2', 465, 375), t('$69', 652, 375), t('$1,494', 714, 375),
      t('11', 421, 100), t('$1,839', 714, 100),
    ],
    imagenes: [
      { name: 'img1', x: 104, y: 406, w: 50, h: 52 },
      { name: 'img2', x: 90, y: 332, w: 79, h: 51 },
    ],
  }
}

describe('parsearTalles', () => {
  it('lee "41/1, 42/3"', () => {
    expect(parsearTalles('41/1, 42/3, 44/1')).toEqual([
      { talle: '41', cantidad: 1 }, { talle: '42', cantidad: 3 }, { talle: '44', cantidad: 1 },
    ])
  })
  it('ignora lo que no es talle', () => {
    expect(parsearTalles('')).toEqual([])
    expect(parsearTalles('hola')).toEqual([])
  })
})

describe('parsearPedido', () => {
  const p = parsearPedido([pagina()])
  it('lee el encabezado', () => {
    expect(p.numero).toBe('2298')
    expect(p.fecha).toBe('2026-10-27')
    expect(p.proveedor).toBe('JACKELINE ARGENTINA')
    expect(p.unidades).toBe(11)
    expect(p.total).toBe(1839)
  })
  it('arma un item por modelo, sin la fila de totales', () => {
    expect(p.items).toHaveLength(2)
    expect(p.items[0]).toMatchObject({ codigo: '1218', cantidad: 5, costo: 69, fotoNombre: 'img1' })
    expect(p.items[1]).toMatchObject({ codigo: '1230', cantidad: 6, fotoNombre: 'img2' })
    expect(p.items[1].talles).toHaveLength(3)
  })
  it('no avisa nada cuando los pares cierran', () => {
    expect(p.avisos).toEqual([])
  })
  it('avisa cuando los pares no coinciden con el total del PDF', () => {
    const pag = pagina()
    pag.textos = pag.textos.map(x => x.s === 'UNIDADES: 11' ? t('UNIDADES: 20', x.x, x.y) : x)
    expect(parsearPedido([pag]).avisos[0]).toMatch(/dice 20 pares y se leyeron 11/)
  })
  it('avisa cuando los talles de una fila no suman su cantidad', () => {
    const pag = pagina()
    pag.textos = pag.textos.map(x => x.s === '41/1, 42/2, 43/2' ? t('41/1, 42/2', x.x, x.y) : x)
    expect(parsearPedido([pag]).avisos.some(a => a.includes('1218'))).toBe(true)
  })
})
