// Cifra/descifra los tokens de Gmail antes de guardarlos en Supabase (ver
// migración 039_gmail_integration.sql). AES-256-GCM vía Web Crypto, no
// node:crypto: las funciones de /api que usan esto corren en runtime Edge
// (igual que tn-webhook.ts, que ya usa crypto.subtle para el HMAC de TN) —
// Edge no tiene el módulo "crypto" de Node, pero sí Web Crypto.
//
// Formato de almacenamiento: "ivHex:cifradoHex". A diferencia de la versión
// en node:crypto (ver api/_lib/encryption.ts en nova-local, que guarda
// iv:authTag:cifrado por separado), el resultado de subtle.encrypt() con
// AES-GCM ya viene con el authTag pegado al final del ciphertext — no hace
// falta manejarlo aparte.

const ALGORITHM = 'AES-GCM'
const IV_BYTES = 12

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function importKey(secretBase64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(secretBase64), c => c.charCodeAt(0))
  if (raw.length !== 32) {
    throw new Error(`ENCRYPTION_SECRET debe decodificar a 32 bytes (AES-256), no ${raw.length}`)
  }
  return crypto.subtle.importKey('raw', raw, ALGORITHM, false, ['encrypt', 'decrypt'])
}

export async function encrypt(text: string, secretBase64: string): Promise<string> {
  const key = await importKey(secretBase64)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const cipherBuf = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, new TextEncoder().encode(text))
  return `${toHex(iv)}:${toHex(new Uint8Array(cipherBuf))}`
}

export async function decrypt(ciphertext: string, secretBase64: string): Promise<string> {
  const [ivHex, cipherHex] = ciphertext.split(':')
  if (!ivHex || !cipherHex) throw new Error('Formato de ciphertext inválido')
  const key = await importKey(secretBase64)
  const plainBuf = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: fromHex(ivHex) }, key, fromHex(cipherHex),
  )
  return new TextDecoder().decode(plainBuf)
}
