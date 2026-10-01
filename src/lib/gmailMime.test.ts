import { describe, it, expect } from 'vitest'
import { buildRawGmailMessage } from './gmailMime'

function decodeBase64Url(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64').toString('utf8')
}

describe('buildRawGmailMessage', () => {
  it('arma un mensaje ASCII sin tocar el asunto', () => {
    const raw = buildRawGmailMessage({ fromEmail: 'local@right.com', to: 'c@x.com', subject: 'Hola', body: 'Mensaje' })
    const decoded = decodeBase64Url(raw)
    expect(decoded).toContain('Subject: Hola\r\n')
    expect(decoded).toContain('From: local@right.com\r\n')
    expect(decoded).toContain('To: c@x.com\r\n')
    expect(decoded).toContain('\r\n\r\nMensaje')
  })

  it('codifica el asunto con tildes en RFC 2047, no lo manda crudo', () => {
    const raw = buildRawGmailMessage({ fromEmail: 'a@b.com', to: 'c@d.com', subject: 'Demora en tu pedido — disculpá la espera', body: 'x' })
    const decoded = decodeBase64Url(raw)
    const subjectLine = decoded.split('\r\n').find(l => l.startsWith('Subject:'))!
    expect(subjectLine).toMatch(/^Subject: =\?UTF-8\?B\?.+\?=$/)
    expect(subjectLine).not.toContain('á')
  })

  it('el body sí viaja en UTF-8 plano, tildes incluidas', () => {
    const raw = buildRawGmailMessage({ fromEmail: 'a@b.com', to: 'c@d.com', subject: 'x', body: 'Va a demorar unos días más, disculpá la molestia.' })
    const decoded = decodeBase64Url(raw)
    expect(decoded).toContain('Va a demorar unos días más, disculpá la molestia.')
  })

  it('no rompe con un body largo (el chunking de base64 cubre todo el texto)', () => {
    const bodyLargo = 'Línea de aviso de demora. '.repeat(3000) // ~80.000 bytes en UTF-8
    const raw = buildRawGmailMessage({ fromEmail: 'a@b.com', to: 'c@d.com', subject: 'Aviso', body: bodyLargo })
    const decoded = decodeBase64Url(raw)
    expect(decoded.endsWith(bodyLargo)).toBe(true)
  })
})
