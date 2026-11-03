import { describe, it, expect } from 'vitest'
import {
  descripcionFoto, esSaludoOMedia, limpiarNombreWsp, marcadorAdjunto, preguntaPorPedidoConfiable,
  sugerenciaDeRescate, usarRespuestaArmadaDeStock,
} from './crmSugerencia'

describe('esSaludoOMedia', () => {
  it('saludos y adjuntos sin texto no dicen qué quiere el cliente', () => {
    for (const t of ['Hola buenas tardes', 'Hola!', 'Cómo va?', '[foto]', '[audio]', '']) expect(esSaludoOMedia(t)).toBe(true)
  })
  it('una pregunta o un pedido sí', () => {
    expect(esSaludoOMedia('Quería saber si la horma de este botín es chica o normal?')).toBe(false)
    expect(esSaludoOMedia('Los quiero en talle 40')).toBe(false)
  })
})

describe('marcadorAdjunto', () => {
  it('uno por tipo, vacío para texto', () => {
    expect(marcadorAdjunto('image')).toBe('[foto]')
    expect(marcadorAdjunto('audio')).toBe('[audio]')
    expect(marcadorAdjunto('text')).toBe('')
  })
})

describe('descripcionFoto', () => {
  it('cuenta qué es la foto', () => {
    expect(descripcionFoto('comprobante de transferencia', null)).toBe('[foto del cliente: comprobante de transferencia]')
    expect(descripcionFoto(null, 'los quiero en 40')).toBe('los quiero en 40 [foto del cliente: no se vio qué muestra]')
  })
})

describe('usarRespuestaArmadaDeStock', () => {
  it('con stock o sin IA, sí', () => {
    expect(usarRespuestaArmadaDeStock('pedido_talle', true)).toBe(true)
    expect(usarRespuestaArmadaDeStock('consulta_precio', true)).toBe(true)
    expect(usarRespuestaArmadaDeStock(null, false)).toBe(true)
    expect(usarRespuestaArmadaDeStock('otro', false)).toBe(true)
  })
  it('si preguntó otra cosa (la horma, un envío), manda lo que preguntó', () => {
    expect(usarRespuestaArmadaDeStock('otro', true)).toBe(false)
    expect(usarRespuestaArmadaDeStock('consulta_envio', true)).toBe(false)
    expect(usarRespuestaArmadaDeStock('reclamo', true)).toBe(false)
  })
})

describe('sugerenciaDeRescate', () => {
  it('siempre devuelve algo', () => {
    expect(sugerenciaDeRescate('Bien')).toEqual(['Buenísimo!', 'Cualquier cosa mándanos!'])
    expect(sugerenciaDeRescate('Muchas gracias')).toEqual(['Buenísimo!', 'Cualquier cosa mándanos!'])
    expect(sugerenciaDeRescate('[foto]').length).toBeGreaterThan(0)
    expect(sugerenciaDeRescate('').length).toBeGreaterThan(0)
  })
})

describe('preguntaPorPedidoConfiable', () => {
  it('hace falta que hable de un pedido', () => {
    expect(preguntaPorPedidoConfiable(true, false)).toBe(false)
    expect(preguntaPorPedidoConfiable(true, true)).toBe(true)
    expect(preguntaPorPedidoConfiable(false, true)).toBe(false)
  })
})

describe('limpiarNombreWsp', () => {
  it('descifra los nombres con letras decoradas', () => {
    expect(limpiarNombreWsp('Åłę%¥§ Pëřę¥řą')).toBe('Alexys Pereyra')
  })
  it('no toca los nombres normales, con o sin acento', () => {
    for (const n of ['Sebastian Plat', 'José María', 'Ñandú Pérez', 'Ramón']) expect(limpiarNombreWsp(n)).toBe(n)
  })
  it('vacío', () => {
    expect(limpiarNombreWsp(null)).toBe('')
  })
})
