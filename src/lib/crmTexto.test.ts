import { describe, expect, it } from 'vitest'
import { humanizar } from './crmTexto'

describe('humanizar', () => {
  it.each([
    ['¡Hola! ¿Qué talle usás? 👟', 'Hola! Qué talle usás?'],
    ['¡Perfecto! Te paso los modelos 👇', 'Perfecto! Te paso los modelos'],
    ['Uh, no nos queda 😕 ¿Te aviso?', 'Uh, no nos queda. Te aviso?'],
    ['Tu pedido figura como entregado ✅ ¿Llegó bien?', 'Tu pedido figura como entregado. Llegó bien?'],
    ['Genial 🙌 te paso fotos', 'Genial 🙌 te paso fotos'],
    ['Hola 🤗 te paso fotos 🙌', 'Hola te paso fotos 🙌'],
    ['es sin cita previa!🙌', 'es sin cita previa!🙌'],
    ['Qué bueno ☺ nos vemos', 'Qué bueno ☺️ nos vemos'],
    ['Genial 👍 te paso fotos 🤗', 'Genial te paso fotos 🤗'],
    ['Adidas F50 — $120.000', 'Adidas F50 - $120.000'],
    ['Listo:\n• F50 talle 40\n• Predator talle 41', 'Listo:\n- F50 talle 40\n- Predator talle 41'],
    ['Es **gama alta** 🔥🔥', 'Es gama alta 🔥'],
    ['Hola 👋🏽 cómo andás?', 'Hola cómo andás?'],
    ['Somos de 🇦🇷', 'Somos de'],
    ['Nos vemos…', 'Nos vemos...'],
  ])('%s', (entrada, salida) => {
    expect(humanizar(entrada)).toBe(salida)
  })

  it('no toca texto normal, links ni precios', () => {
    const t = 'Hola! Tu pedido #1234 salió por Andreani.\nCódigo de seguimiento: AND-999\nLo podés seguir acá: https://andreani.com/envio/AND-999\nSale $120.000 (3 cuotas sin interés)'
    expect(humanizar(t)).toBe(t)
  })
})
