import { describe, expect, it } from 'vitest'
import { calcularOrigen, mensajesDe, mensajesDeSugerencia, ubicarAncla, unirMensajes } from './crmAprendizaje'
import type { WspMensaje } from '../types/crm'

const AHORA = new Date('2026-10-21T20:00:00Z').getTime()

function msg(id: string, direccion: 'in' | 'out', minutosAtras: number, extra: Partial<WspMensaje> = {}): WspMensaje {
  return {
    id, conversacion_id: 'c1', direccion, tipo: 'text', contenido: id, transcripcion: null, media_url: null,
    wa_message_id: null, enviado_por: null, timestamp: new Date(AHORA - minutosAtras * 60_000).toISOString(), ...extra,
  }
}

describe('calcularOrigen', () => {
  it('sin sugerencia del bot', () => {
    expect(calcularOrigen([], ['Hola'])).toBe('sin_sugerencia')
  })
  it('usada: lo mandado estaba entre lo que sugirió el bot (ignora mayúsculas y signos)', () => {
    expect(calcularOrigen(['Hola buenas! Cómo estás?', 'En qué talle?'], ['hola buenas cómo estas'])).toBe('usada')
  })
  it('usada también si mandó todos los mensajes', () => {
    expect(calcularOrigen(['A', 'B'], ['A', 'B'])).toBe('usada')
  })
  it('distinta si cambió algo o agregó un mensaje propio', () => {
    expect(calcularOrigen(['Hola buenas!'], ['Hola buenas! Cómo estás?'])).toBe('distinta')
    expect(calcularOrigen(['A', 'B'], ['A', 'algo mío'])).toBe('distinta')
  })
  it('sin nada mandado no es usada', () => {
    expect(calcularOrigen(['A'], [])).toBe('distinta')
  })
})

describe('mensajesDe / mensajesDeSugerencia', () => {
  it('usa la lista si está, si no el texto viejo', () => {
    expect(mensajesDe(['a', ' ', 'b'], 'x')).toEqual(['a', 'b'])
    expect(mensajesDe(null, ' viejo ')).toEqual(['viejo'])
    expect(mensajesDe(null, null)).toEqual([])
  })
  it('sugerencia: humaniza cada mensaje', () => {
    expect(mensajesDeSugerencia({ mensajes_sugeridos: ['¡Hola! 🤗', 'Qué talle?'], respuesta_sugerida: 'x' })).toEqual(['Hola!', 'Qué talle?'])
    expect(mensajesDeSugerencia({ respuesta_sugerida: 'Un solo texto' })).toEqual(['Un solo texto'])
    expect(mensajesDeSugerencia(null)).toEqual([])
  })
  it('unirMensajes separa con línea en blanco', () => {
    expect(unirMensajes(['a', 'b'])).toBe('a\n\nb')
  })
})

describe('ubicarAncla', () => {
  it('primer mensaje de Right: engancha con lo último del cliente', () => {
    const r = ubicarAncla([msg('p1', 'in', 5), msg('p2', 'in', 4)], AHORA)
    expect(r?.bloque.map(m => m.id)).toEqual(['p1', 'p2'])
    expect(r?.salientes).toEqual([])
  })
  it('segundo mensaje: salta lo que Right ya mandó y engancha con la misma pregunta', () => {
    const r = ubicarAncla([msg('p1', 'in', 5), msg('r1', 'out', 3), msg('r2', 'out', 2)], AHORA)
    expect(r?.bloque.map(m => m.id)).toEqual(['p1'])
    expect(r?.salientes.map(m => m.id)).toEqual(['r1', 'r2'])
  })
  it('no cuenta mensajes pendientes, fallidos, borrados ni automáticos', () => {
    const r = ubicarAncla([
      msg('p1', 'in', 5),
      msg('auto', 'out', 4, { automatico: 'bienvenida' }),
      msg('fallo', 'out', 3, { _failed: true }),
      msg('pend', 'out', 2, { _pending: true }),
    ], AHORA)
    expect(r?.bloque.map(m => m.id)).toEqual(['p1'])
    expect(r?.salientes).toEqual([])
  })
  it('si Right contestó hace más de 20 minutos, lo nuevo ya no es parte de esa respuesta', () => {
    expect(ubicarAncla([msg('p1', 'in', 60), msg('r1', 'out', 40)], AHORA)).toBeNull()
  })
  it('sin mensajes del cliente no hay nada que aprender', () => {
    expect(ubicarAncla([msg('r1', 'out', 1)], AHORA)).toBeNull()
    expect(ubicarAncla([], AHORA)).toBeNull()
  })
})
