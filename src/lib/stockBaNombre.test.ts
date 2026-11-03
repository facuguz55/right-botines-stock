import { describe, it, expect } from 'vitest'
import { analizarNombre, marcaDe } from './stockBaNombre'

describe('analizarNombre', () => {
  it('separa los códigos del pedido del nombre', () => {
    const n = analizarNombre('616 GC F11 ADIDAS F50 FUCSIA TALON DORADO LINEAS...')
    expect(n.titulo).toBe('Adidas F50 Fucsia Talon Dorado Lineas…')
    expect(n.ref).toBe('616 GC · F11')
    expect(n.nino).toBe(false)
    expect(n.marca).toBe('Adidas')
  })

  it('detecta niño antes y después de F11', () => {
    expect(analizarNombre('616 GC F11 NIÑO ADIDAS F50 NEGRO/BLANCO').nino).toBe(true)
    const b = analizarNombre('616 GC NIÑO F11 PHANTOM BLANCO/FUCSIA CHULO NEG...')
    expect(b.nino).toBe(true)
    expect(b.titulo).toBe('Phantom Blanco/Fucsia Chulo Neg…')
    expect(b.marca).toBe('Nike')
  })

  it('une "F 50" y lo deja en mayúscula', () => {
    expect(analizarNombre('78 GC F11 ADIDAS F 50 MESSI BLANCO/AZUL').titulo).toBe('Adidas F50 Messi Blanco/Azul')
  })

  it('si no tiene códigos devuelve el nombre tal cual en formato título', () => {
    const n = analizarNombre('Mercurial plateado')
    expect(n.titulo).toBe('Mercurial Plateado')
    expect(n.ref).toBe('')
    expect(n.marca).toBe('Nike')
  })
})

describe('marcaDe', () => {
  it('reconoce Nike, Adidas y otras', () => {
    expect(marcaDe('TIEMPO FUCSIA CHULO NEGRO')).toBe('Nike')
    expect(marcaDe('PREDATOR GRIS')).toBe('Adidas')
    expect(marcaDe('PUMA FUTURE')).toBe('Otras')
  })
})
