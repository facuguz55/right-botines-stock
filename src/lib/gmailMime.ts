// Arma el mensaje RFC822 crudo que espera la API de Gmail
// (users.messages.send, campo "raw": base64url del mensaje completo).
// Mismo enfoque que /Users/mauricio/nova-local/api/_lib/gmail-send.ts.

export interface GmailMessageInput {
  fromEmail: string
  to: string
  subject: string
  body: string
}

// String.fromCharCode(...bytes) con spread rompe (call stack / límite de
// argumentos del motor) para bodies largos — el mensaje admite hasta 50.000
// caracteres, que en UTF-8 puede ser bastante más de eso en bytes. Se
// construye de a chunks para evitar el límite.
function bytesToBinaryString(bytes: Uint8Array): string {
  const CHUNK = 8192
  let out = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return out
}

// Los headers de un mail solo admiten ASCII — una tilde o ñ suelta ahí queda
// mal interpretada según el cliente que la lea ("Ã©" en vez de "é"). RFC 2047
// es la forma estándar de meter UTF-8 en un header: envolverlo en
// =?UTF-8?B?...?= con el texto en base64.
function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value
  const b64 = btoa(bytesToBinaryString(new TextEncoder().encode(value)))
  return `=?UTF-8?B?${b64}?=`
}

function toBase64Url(text: string): string {
  const b64 = btoa(bytesToBinaryString(new TextEncoder().encode(text)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function buildRawGmailMessage(input: GmailMessageInput): string {
  const lines = [
    `From: ${input.fromEmail}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    input.body,
  ]
  return toBase64Url(lines.join('\r\n'))
}
