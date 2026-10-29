// atob/btoa escritos en JS. En las funciones de Vercel, cuando la librería de
// push (vía uint8array-extras) llama a globalThis.atob, el runtime tira
// «Illegal invocation» y no sale ninguna notificación (visto el 28/10/2026 en
// push_subscriptions.ultimo_error). Con estas versiones no depende del runtime.

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const VALOR: Record<string, number> = Object.fromEntries([...ABC].map((c, i) => [c, i]))

export function atobJs(entrada: string): string {
  const s = String(entrada).replace(/[\t\n\f\r ]+/g, '').replace(/=+$/, '')
  if (s.length % 4 === 1) throw new Error('base64 inválido')
  let salida = ''
  let buffer = 0
  let bits = 0
  for (const c of s) {
    const v = VALOR[c]
    if (v === undefined) throw new Error('base64 inválido')
    buffer = (buffer << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      salida += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }
  return salida
}

export function btoaJs(entrada: string): string {
  const s = String(entrada)
  let salida = ''
  for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i)
    const b = i + 1 < s.length ? s.charCodeAt(i + 1) : NaN
    const c = i + 2 < s.length ? s.charCodeAt(i + 2) : NaN
    if (a > 255 || b > 255 || c > 255) throw new Error('btoa: carácter fuera de rango')
    const n = (a << 16) | ((b || 0) << 8) | (c || 0)
    salida += ABC[(n >> 18) & 63] + ABC[(n >> 12) & 63]
    salida += Number.isNaN(b) ? '=' : ABC[(n >> 6) & 63]
    salida += Number.isNaN(c) ? '=' : ABC[n & 63]
  }
  return salida
}

// Reemplaza atob/btoa globales por las de JS (mismo resultado, sin depender del runtime).
export function instalarBase64Js(): void {
  const g = globalThis as { atob: (s: string) => string; btoa: (s: string) => string }
  g.atob = atobJs
  g.btoa = btoaJs
}
