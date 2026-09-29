// Deja las respuestas que se le mandan al cliente con la pinta de algo que
// escribió Cami desde el celular, no una IA: sin signos de apertura (¿ ¡ — en
// WhatsApp nadie los escribe), sin guiones largos ni viñetas, y emojis solo
// como los usa ella: de su repertorio y uno solo por mensaje (el último que
// haya). Se aplica a TODA respuesta sugerida antes de guardarla (webhook) y
// al usarla desde el chat, así aunque la IA ignore las instrucciones de
// estilo, al cliente no le llega nada de eso.

// Los que usa Cami en sus mensajes predeterminados (ver crmNegocio.ts).
export const EMOJIS_PERMITIDOS = ['🤗', '🙌', '😔', '🔥', '🤩', '☺️']
const PERMITIDO = /🤗|🙌|😔|🔥|🤩|☺\u{FE0F}?/gu
const MARCA = /\u0000(\d+)\u0000/g

const CLASE_EMOJI = '[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}\\u{1F3FB}-\\u{1F3FF}\\u{FE0F}\\u{FE0E}\\u{200D}\\u{20E3}]'
const EMOJI = new RegExp(CLASE_EMOJI, 'gu')
// Un emoji que hacía de separador entre dos oraciones ("no queda 😕 Te
// aviso?") se cambia por un punto; si no, quedaría "no queda Te aviso?".
const EMOJI_ENTRE_ORACIONES = new RegExp(`([^\\s.!?,:;])\\s*(?:${CLASE_EMOJI})+\\s+(?=[¿¡]?[A-ZÁÉÍÓÚÑ])`, 'gu')

export function humanizar(texto: string): string {
  // Los permitidos se apartan antes de barrer el resto de los emojis, y de
  // ellos queda solo el último (Cami usa uno, al final).
  const permitidos: string[] = []
  const protegido = texto.replace(PERMITIDO, e => {
    permitidos.push(e.startsWith('☺') ? '☺️' : e)
    return `\u0000${permitidos.length - 1}\u0000`
  })
  return protegido
    .replace(EMOJI_ENTRE_ORACIONES, '$1. ')
    .replace(EMOJI, '')
    .replace(/[¿¡]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/^[ \t]*[•·▪►]\s*/gm, '- ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .split('\n')
    .map(linea => linea.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?:;])/g, '$1').trim())
    .join('\n')
    .replace(MARCA, (_, i: string) => (Number(i) === permitidos.length - 1 ? permitidos[Number(i)] : ''))
    .split('\n')
    .map(linea => linea.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
