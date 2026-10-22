import { describe, expect, it } from 'vitest'
import { esRuidoDelNavegador } from './errorReporter'

describe('esRuidoDelNavegador', () => {
  it('"Script error." sin archivo ni línea es ruido', () => {
    expect(esRuidoDelNavegador('Script error.', '', 0)).toBe(true)
    expect(esRuidoDelNavegador('Script error', undefined, undefined)).toBe(true)
  })
  it('"Script error." con archivo o línea sí se reporta (viene de nuestro código)', () => {
    expect(esRuidoDelNavegador('Script error.', 'https://x/app.js', 10)).toBe(false)
  })
  it('service worker, portapapeles y diálogos no soportados', () => {
    expect(esRuidoDelNavegador('Failed to update a ServiceWorker for scope')).toBe(true)
    expect(esRuidoDelNavegador("Failed to execute 'writeText' on 'Clipboard': Write permission denied.")).toBe(true)
    expect(esRuidoDelNavegador('prompt() is not supported.')).toBe(true)
  })
  it('un error real se reporta', () => {
    expect(esRuidoDelNavegador("Cannot read properties of undefined (reading 'x')")).toBe(false)
    expect(esRuidoDelNavegador(undefined)).toBe(false)
  })
})
