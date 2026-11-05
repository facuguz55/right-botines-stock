import { describe, expect, it } from 'vitest'
import { armarContexto, bloqueConAdjuntos, bloqueDeTextoDelCliente, type FilaMensaje } from './botEntrada'

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
