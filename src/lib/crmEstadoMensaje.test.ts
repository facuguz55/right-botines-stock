import { describe, expect, it } from 'vitest'
import { estadoEntrega, motivoFallo } from './crmEstadoMensaje'

describe('estadoEntrega', () => {
  it('solo los salientes con id de WhatsApp tienen estado', () => {
    expect(estadoEntrega({ direccion: 'in', wa_message_id: 'x' })).toBeNull()
    expect(estadoEntrega({ direccion: 'out', wa_message_id: null })).toBeNull()
  })
  it('sin aviso de Meta cuenta como enviado', () => {
    expect(estadoEntrega({ direccion: 'out', wa_message_id: 'x' })).toBe('sent')
    expect(estadoEntrega({ direccion: 'out', wa_message_id: 'x', wa_estado: 'read' })).toBe('read')
  })
})

describe('motivoFallo', () => {
  it('traduce el error de la ventana de 24 hs', () => {
    expect(motivoFallo('131047: Re-engagement message')).toContain('24 hs')
  })
  it('con un código desconocido muestra el texto de Meta', () => {
    expect(motivoFallo('999999: Algo raro')).toBe('Algo raro')
  })
  it('sin dato igual explica algo', () => {
    expect(motivoFallo(null)).toContain('no lo pudo entregar')
  })
})
