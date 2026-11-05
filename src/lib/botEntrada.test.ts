import { describe, expect, it } from 'vitest'
import { armarContexto, bloqueConAdjuntos, bloqueDeTextoDelCliente, sacarSaludoRepetido, ultimaRespuestaDelLocalMs, type FilaMensaje } from './botEntrada'

const filas: FilaMensaje[] = [
  { direccion: 'in', tipo: 'text', contenido: 'Hola', transcripcion: null },
  { direccion: 'out', tipo: 'text', contenido: 'Hola buenas! En qué talle?', transcripcion: null },
  { direccion: 'in', tipo: 'text', contenido: 'Tenés estos?', transcripcion: null },
  { direccion: 'in', tipo: 'image', contenido: null, transcripcion: null, imagen_descripcion: 'botín Nike Phantom celeste' },
  { direccion: 'in', tipo: 'audio', contenido: null, transcripcion: 'en 42' },
]

describe('armado de lo que lee la IA', () => {
  it('la charla incluye las fotos con su descripción', () => {
    expect(armarContexto(filas)).toBe([
      'Cliente: Hola',
      'Local: Hola buenas! En qué talle?',
      'Cliente: Tenés estos?',
      'Cliente: [foto del cliente: botín Nike Phantom celeste]',
      'Cliente: en 42',
    ].join('\n'))
  })
  it('foto sin descripción y foto del local', () => {
    expect(armarContexto([
      { direccion: 'in', tipo: 'image', contenido: 'esta', transcripcion: null },
      { direccion: 'out', tipo: 'image', contenido: null, transcripcion: null },
    ])).toBe('Cliente: esta [foto del cliente: no se vio qué muestra]\nLocal: [foto que mandó el local]')
  })
  it('bloque del cliente: solo texto para buscar aprendizajes, con adjuntos para la IA', () => {
    expect(bloqueDeTextoDelCliente(filas)).toEqual(['Tenés estos?', 'en 42'])
    expect(bloqueConAdjuntos(filas)).toEqual(['Tenés estos?', '[foto del cliente: botín Nike Phantom celeste]', 'en 42 [audio]'])
  })
})

describe('saludo repetido', () => {
  const hora = 3_600_000
  it('si el local habló hace poco, saca el saludo del principio', () => {
    expect(sacarSaludoRepetido(['Hola buenas! Cómo estás? Sisi los tenemos en 42'], hora)).toEqual(['Sisi los tenemos en 42'])
    expect(sacarSaludoRepetido(['Buen día!', 'Te paso el link'], hora)).toEqual(['Te paso el link'])
    expect(sacarSaludoRepetido(['Hola! dale, te espero'], hora)).toEqual(['Dale, te espero'])
  })
  it('si la charla recién empieza o hace rato que no habla el local, deja el saludo', () => {
    expect(sacarSaludoRepetido(['Hola buenas! Cómo estás?'], null)).toEqual(['Hola buenas! Cómo estás?'])
    expect(sacarSaludoRepetido(['Hola buenas! Cómo estás?'], 5 * hora)).toEqual(['Hola buenas! Cómo estás?'])
  })
  it('no saca "Todo bien y vos?" ni deja la sugerencia vacía', () => {
    expect(sacarSaludoRepetido(['Todo bien y vos?'], hora)).toEqual(['Todo bien y vos?'])
    expect(sacarSaludoRepetido(['Hola buenas! Cómo estás?'], hora)).toEqual(['Hola buenas! Cómo estás?'])
  })
  it('cuánto hace que habló el local (sin contar los mensajes automáticos)', () => {
    const t0 = Date.parse('2026-11-05T15:00:00Z')
    const filas: FilaMensaje[] = [
      { direccion: 'out', contenido: 'Hola', transcripcion: null, timestamp: '2026-11-05T14:00:00Z' },
      { direccion: 'out', contenido: 'Fuera de horario', transcripcion: null, timestamp: '2026-11-05T14:50:00Z', automatico: 'ausencia' },
      { direccion: 'in', contenido: 'gracias', transcripcion: null, timestamp: '2026-11-05T14:59:00Z' },
    ]
    expect(ultimaRespuestaDelLocalMs(filas, t0)).toBe(hora)
    expect(ultimaRespuestaDelLocalMs([], t0)).toBeNull()
  })
})
