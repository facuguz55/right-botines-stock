import { describe, expect, it } from 'vitest'
import { etiquetaVarianteTN, textoUs, usDeGuia, usDesdeEtiqueta, usParaGuardar } from './talles'

describe('talles según la guía de right.com.ar', () => {
  // La tabla que usan los 144 productos publicados en right.com.ar.
  it.each([[35, 5], [36, 5], [37, 5.5], [38, 6.5], [39, 7], [40, 8], [41, 8.5], [42, 9.5], [43, 10], [44, 11]])('ARG %s → US %s', (arg, us) => {
    expect(usDeGuia(arg)).toBe(us)
  })
  it('fuera de la tabla (34, 45+) → null', () => {
    for (const arg of [34, 45, 46]) expect(usDeGuia(arg)).toBeNull()
  })
  it('etiqueta de la variante en TiendaNube', () => {
    expect(etiquetaVarianteTN(40, 8)).toBe('40 arg / 8 us')
    expect(etiquetaVarianteTN(41, 8.5)).toBe('41 arg / 8,5 us')
    expect(etiquetaVarianteTN(38, 6.5)).toBe('38 arg / 6,5 us')
    expect(etiquetaVarianteTN(45, 0)).toBe('45 arg')
    expect(etiquetaVarianteTN(45, null)).toBe('45 arg')
  })
  it('US a guardar y a mostrar', () => {
    expect(usParaGuardar('8,5')).toBe(8.5)
    expect(usParaGuardar('')).toBe(0)
    expect(usParaGuardar(null)).toBe(0)
    expect(textoUs(0)).toBe('')
    expect(textoUs(9.5)).toBe('9,5 us')
  })
  it('lee el US del nombre de una variante', () => {
    expect(usDesdeEtiqueta('40 arg / 8 us')).toBe(8)
    expect(usDesdeEtiqueta('41 ARG / 8,5 US')).toBe(8.5)
    expect(usDesdeEtiqueta('35 arg')).toBeNull()
  })
})
