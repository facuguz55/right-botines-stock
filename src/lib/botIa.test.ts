import { describe, expect, it } from 'vitest'
import { elegirAprendizajes, limpiarMensajes, rankearAprendizajes } from './botIa'

const catalogo = {
  pregunta: 'Quiero saber si tienen un catalogo de botines',
  respuesta_aprobada: 'Sisi! Tenemos!\n\nEn qué talle y suela estabas buscando?',
  mensajes_aprobados: ['Sisi! Tenemos!', 'En qué talle y suela estabas buscando?'],
  origen: 'distinta',
}
const horario = { pregunta: 'A qué hora abren el sábado', respuesta_aprobada: 'De 9 a 13 hs', origen: 'distinta' }

describe('limpiarMensajes', () => {
  it('humaniza, saca vacíos y deja como mucho 3', () => {
    expect(limpiarMensajes(['¡Hola! 🤗', '  ', 'Dos', 'Tres', 'Cuatro'])).toEqual(['Hola!', 'Dos', 'Tres'])
    expect(limpiarMensajes(null)).toEqual([])
  })
})

describe('aprendizajes aprobados', () => {
  it('elige los que se parecen a lo que dijo el cliente', () => {
    const r = elegirAprendizajes('Hola, tienen catálogo de botines?', [horario, catalogo])
    expect(r).toEqual([catalogo])
  })
  it('no elige nada si no hay palabras en común', () => {
    expect(elegirAprendizajes('Cuánto cuesta el envío', [catalogo])).toEqual([])
  })
  it('a igual parecido, primero lo que Right corrigió', () => {
    const usada = { ...catalogo, origen: 'usada', pregunta: 'tienen catalogo de botines' }
    const r = elegirAprendizajes('tienen catalogo de botines', [usada, catalogo])
    expect(r[0].origen).toBe('distinta')
  })
  it('formatea varios mensajes seguidos', () => {
    const t = rankearAprendizajes('tienen catalogo de botines', [catalogo])
    expect(t).toContain('Right contestó en 2 mensajes seguidos')
    expect(t).toContain('1) Sisi! Tenemos!')
    expect(t).toContain('2) En qué talle y suela estabas buscando?')
  })
  it('una fila vieja con un solo texto se muestra en una línea', () => {
    const t = rankearAprendizajes('a qué hora abren sabado', [horario])
    expect(t).toContain('Right contestó: De 9 a 13 hs')
  })
})
