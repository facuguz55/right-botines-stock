import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from './gmailCrypto'

const SECRET = 'MHQFcFHHwRRWbUnuulfzV0XV/dQAyYIy/aJQnI12nnU=' // 32 bytes, solo para test

describe('gmailCrypto', () => {
  it('descifra exactamente lo que cifró', async () => {
    const original = 'ya29.a0AfH6SMC...token-de-ejemplo-con-ñ-y-tildes-áéíóú'
    const cipher = await encrypt(original, SECRET)
    expect(await decrypt(cipher, SECRET)).toBe(original)
  })

  it('produce un iv distinto en cada llamada (no reusa nonce)', async () => {
    const a = await encrypt('mismo texto', SECRET)
    const b = await encrypt('mismo texto', SECRET)
    expect(a).not.toBe(b)
  })

  it('rechaza un texto cifrado con otra clave', async () => {
    const otraClave = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=' // otros 32 bytes
    const cipher = await encrypt('secreto', SECRET)
    await expect(decrypt(cipher, otraClave)).rejects.toThrow()
  })

  it('tira un error claro si el secreto no son 32 bytes', async () => {
    await expect(encrypt('x', 'bm9wZQ==')).rejects.toThrow(/32 bytes/)
  })

  it('maneja string vacío', async () => {
    const cipher = await encrypt('', SECRET)
    expect(await decrypt(cipher, SECRET)).toBe('')
  })
})
