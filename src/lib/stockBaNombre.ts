// La proveedora escribe los productos así: "616 GC F11 NIÑO ADIDAS F50 FUCSIA/BLANCO LINEAS...".
// Para mostrarlo prolijo se separa lo que es del pedido (número, tipo, F11) de lo
// que identifica el botín. El nombre guardado no se toca: esto es solo de vista.

export type MarcaBA = 'Nike' | 'Adidas' | 'Otras'

export interface NombreBA {
  titulo: string // "Adidas F50 Blanco/Fucsia Líneas Negras"
  ref: string // "616 GC · F11"
  nino: boolean
  marca: MarcaBA
}

const CODIGOS = /^(\d{2,4}|GC|SC|SB|GB|F11|F5|F7)$/i

const MAYUSCULAS = new Set(['F50', 'GX', 'FG', 'AG', 'SG', 'TF', 'IC'])

function aTitulo(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s/])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .split(' ')
    .map(w => (MAYUSCULAS.has(w.toUpperCase()) ? w.toUpperCase() : w))
    .join(' ')
}

export function marcaDe(texto: string): MarcaBA {
  const t = texto.toUpperCase()
  if (/\b(ADIDAS|F\s?50|PREDATOR|COPA|X\s?CRAZYFAST)\b/.test(t)) return 'Adidas'
  if (/\b(NIKE|PHANTOM|MERCURIAL|TIEMPO|CHULO)\b/.test(t)) return 'Nike'
  return 'Otras'
}

export function analizarNombre(descripcion: string): NombreBA {
  const partes = descripcion.replace(/\s+/g, ' ').trim().split(' ')
  const ref: string[] = []
  let i = 0
  let nino = false
  // Primero van los códigos del pedido; "NIÑO" puede aparecer entre ellos.
  while (i < partes.length) {
    const p = partes[i].replace(/[.,]/g, '')
    if (CODIGOS.test(p)) ref.push(p.toUpperCase())
    else if (/^NI[ÑN]O$/i.test(p)) nino = true
    else break
    i++
  }
  let resto = partes.slice(i).join(' ')
  if (/\bNI[ÑN]O\b/i.test(resto)) {
    nino = true
    resto = resto.replace(/\bNI[ÑN]O\b\s*/i, '')
  }
  const truncado = /(\.{2,}|…)$/.test(resto)
  resto = resto.replace(/(\.{2,}|…)$/, '').trim()
  // "F 50" suelto es el mismo F50.
  resto = resto.replace(/\bF\s50\b/gi, 'F50')
  const titulo = (aTitulo(resto) || descripcion) + (truncado ? '…' : '')
  const refTxt = ref.length > 2 ? `${ref.slice(0, ref.length - 1).join(' ')} · ${ref[ref.length - 1]}` : ref.join(' ')
  return { titulo, ref: refTxt, nino, marca: marcaDe(resto || descripcion) }
}
