import { describe, expect, it } from 'vitest'
import { atobJs, btoaJs } from './base64Js'

describe('base64 en JS', () => {
  it('da lo mismo que Buffer para textos y bytes', () => {
    const casos = ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))]
    for (const c of casos) {
      const esperado = Buffer.from(c, 'latin1').toString('base64')
      expect(btoaJs(c)).toBe(esperado)
      expect(atobJs(esperado)).toBe(c)
    }
  })

  it('decodifica una clave VAPID pública (65 bytes) igual que Buffer', () => {
    const bytes = Uint8Array.from({ length: 65 }, (_, i) => (i * 37 + 4) & 255)
    const b64 = Buffer.from(bytes).toString('base64')
    expect(Uint8Array.from(atobJs(b64), x => x.charCodeAt(0))).toEqual(bytes)
    expect(Uint8Array.from(atobJs(b64.replace(/=+$/, '')), x => x.charCodeAt(0))).toEqual(bytes)
  })

  it('rechaza base64 inválido y caracteres fuera de rango', () => {
    expect(() => atobJs('a')).toThrow()
    expect(() => atobJs('ab$d')).toThrow()
    expect(() => btoaJs('ñandú€')).toThrow()
  })
})
