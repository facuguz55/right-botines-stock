import type { TiendaNubeModelo } from '../types'
import { buildCodigoBase } from './codigos'

// ── Talle conversions ────────────────────────────────────────────────────────

// Alineada con src/lib/tnMapping.ts (la tabla que usa el sync en vivo con
// TiendaNube) — antes esta tabla del importador manual de Excel/CSV era
// otra completamente distinta (offset variable ~31.5-34.5) y encima sus
// fallbacks de acá abajo usaban un tercer offset (33) distinto de ambas.
// Resultado real: el mismo talle ARG 42 daba US 10 (tnMapping, sync activo)
// o US 9 (este importador) según qué camino lo hubiera tocado. Se unifica
// todo en una sola fuente de verdad (offset ARG-US=32 constante).
const ARG_TO_US: Record<number, number> = {
  34: 2, 34.5: 2.5, 35: 3, 35.5: 3.5, 36: 4, 36.5: 4.5, 37: 5, 37.5: 5.5,
  38: 6, 38.5: 6.5, 39: 7, 39.5: 7.5, 40: 8, 40.5: 8.5, 41: 9, 41.5: 9.5,
  42: 10, 42.5: 10.5, 43: 11, 43.5: 11.5, 44: 12, 44.5: 12.5, 45: 13, 45.5: 13.5,
  46: 14, 46.5: 14.5, 47: 15,
}
const US_TO_ARG: Record<number, number> = Object.fromEntries(
  Object.entries(ARG_TO_US).map(([arg, us]) => [us, Number(arg)])
)

export function parseTalle(raw: string): { talle_us: number; talle_arg: number } | null {
  const s = raw.trim()
  if (!s) return null

  const argFirst = s.match(/(\d+(?:[.,]\d+)?)\s*arg\s*[\/\-]\s*(\d+(?:[.,]\d+)?)\s*us/i)
  if (argFirst) return { talle_arg: parseFloat(argFirst[1].replace(',', '.')), talle_us: parseFloat(argFirst[2].replace(',', '.')) }

  const usFirst = s.match(/(\d+(?:[.,]\d+)?)\s*us\s*[\/\-]\s*(\d+(?:[.,]\d+)?)\s*arg/i)
  if (usFirst) return { talle_us: parseFloat(usFirst[1].replace(',', '.')), talle_arg: parseFloat(usFirst[2].replace(',', '.')) }

  const plainSlash = s.match(/^(\d+(?:[.,]\d+)?)\s*[\/\-]\s*(\d+(?:[.,]\d+)?)$/)
  if (plainSlash) {
    const a = parseFloat(plainSlash[1].replace(',', '.')), b = parseFloat(plainSlash[2].replace(',', '.'))
    const [talle_arg, talle_us] = a > b ? [a, b] : [b, a]
    return { talle_us, talle_arg }
  }

  const usMatch = s.match(/(\d+(?:[.,]\d+)?)\s*US/i)
  if (usMatch) { const us = parseFloat(usMatch[1].replace(',', '.')); return { talle_us: us, talle_arg: US_TO_ARG[us] ?? Math.round(us + 32) } }

  const argMatch = s.match(/(\d+(?:[.,]\d+)?)\s*ARG/i)
  if (argMatch) { const arg = parseFloat(argMatch[1].replace(',', '.')); return { talle_arg: arg, talle_us: ARG_TO_US[arg] ?? Math.round((arg - 32) * 2) / 2 } }

  const num = parseFloat(s.replace(',', '.'))
  if (!isNaN(num)) {
    if (num >= 34) return { talle_arg: num, talle_us: ARG_TO_US[num] ?? Math.round((num - 32) * 2) / 2 }
    return { talle_us: num, talle_arg: US_TO_ARG[num] ?? Math.round(num + 32) }
  }
  return null
}

// ── Marca detection ───────────────────────────────────────────────────────────

const MARCA_KEYWORDS: [string[], string][] = [
  [['under armour'], 'Under Armour'],
  [['new balance'], 'New Balance'],
  [['adidas', 'adias'], 'Adidas'],
  [['nike'], 'Nike'],
  [['puma'], 'Puma'],
  [['mizuno'], 'Mizuno'],
  [['umbro'], 'Umbro'],
  [['joma'], 'Joma'],
]

export function parseNombre(nombre: string): { marca: string; modelo: string } {
  const trimmed = nombre.trim()
  const lower = trimmed.toLowerCase()
  for (const [keywords, marca] of MARCA_KEYWORDS) {
    for (const kw of keywords) {
      const idx = lower.indexOf(kw)
      if (idx === -1) continue
      const modelo = idx === 0 ? trimmed.slice(kw.length).trim() : trimmed
      return { marca, modelo: modelo || trimmed }
    }
  }
  return { marca: 'Otra', modelo: trimmed }
}

// ── Categorías ────────────────────────────────────────────────────────────────

export function parseCategorias(cats: string): { categoria: string; gama: string } {
  const lower = cats.toLowerCase()
  let categoria = 'F11'
  if (lower.includes('f5') || lower.includes('cinco')) categoria = 'F5'
  else if (lower.includes('futsal')) categoria = 'Futsal'
  else if (lower.includes('hockey')) categoria = 'Hockey'
  let gama = 'Media'
  if (lower.includes('alta') || lower.includes('premium')) gama = 'Alta'
  else if (lower.includes('econ') || lower.includes('básic') || lower.includes('basic') || lower.includes('entry')) gama = 'Económica'
  return { categoria, gama }
}

// ── Column detection ─────────────────────────────────────────────────────────

export interface DetectedColumns {
  nombre: number; precio: number; costo: number; stock: number
  sku: number; categorias: number
  talleVarianteNombre: number; talleVarianteValor: number; talleDirecto: number
}

function findCol(headers: string[], keys: string[]): number {
  const lowers = headers.map(h => h.toLowerCase().trim())
  for (const key of keys) {
    const i = lowers.findIndex(h => h === key || h.includes(key))
    if (i !== -1) return i
  }
  return -1
}

export function detectColumns(headers: string[]): DetectedColumns {
  const cols: DetectedColumns = {
    nombre: findCol(headers, ['nombre', 'name', 'producto', 'titulo']),
    precio: findCol(headers, ['precio normal', 'precio', 'price', 'pvp', 'precio de venta']),
    costo: findCol(headers, ['costo', 'cost', 'precio costo', 'precio de costo']),
    stock: findCol(headers, ['inventario', 'stock', 'cantidad', 'inventory']),
    sku: findCol(headers, ['sku', 'código', 'codigo', 'ref', 'referencia']),
    categorias: findCol(headers, ['categorías', 'categorias', 'categoria', 'category', 'categories']),
    talleVarianteNombre: -1, talleVarianteValor: -1,
    talleDirecto: findCol(headers, ['valor de propiedad 1', 'valor de propiedad', 'talle', 'size', 'talla']),
  }

  const varNombreRegex = /variante\s*\d+\s*[-–]\s*nombre/i
  const atribNombreRegex = /nombre\s*atributo\s*\d+/i
  for (let i = 0; i < headers.length; i++) {
    if (varNombreRegex.test(headers[i]) || atribNombreRegex.test(headers[i])) {
      cols.talleVarianteNombre = i
      if (i + 1 < headers.length) cols.talleVarianteValor = i + 1
      break
    }
  }
  return cols
}

function getTalleFromRow(row: string[], cols: DetectedColumns, headers: string[]): string {
  if (cols.talleDirecto !== -1 && row[cols.talleDirecto]) return row[cols.talleDirecto]
  if (cols.talleVarianteNombre !== -1) {
    const varNombre = (row[cols.talleVarianteNombre] || '').toLowerCase()
    if (varNombre.includes('talle') || varNombre.includes('size')) return row[cols.talleVarianteValor] ?? ''
    const varCols = headers.map((h, i) => ({ h, i })).filter(({ h }) => /variante\s*\d+\s*[-–]\s*nombre/i.test(h) || /nombre\s*atributo\s*\d+/i.test(h))
    for (const { i } of varCols) {
      const n = (row[i] || '').toLowerCase(), v = row[i + 1] ?? ''
      if ((n.includes('talle') || n.includes('size')) && v) return v
    }
  }
  return ''
}

// ── Heredar nombre vacío de la fila anterior ──────────────────────────────────

export function fillInheritedNames(rows: string[][], nombreCol: number): string[][] {
  if (nombreCol === -1) return rows
  let last = ''
  return rows.map(row => {
    const v = (row[nombreCol] ?? '').trim()
    if (v) { last = v; return row }
    if (last) { const f = [...row]; f[nombreCol] = last; return f }
    return row
  })
}

// ── Agrupar filas por modelo → un TiendaNubeModelo con todos sus talles ───────

export function groupByModelo(
  rows: string[][],
  cols: DetectedColumns,
  headers: string[]
): TiendaNubeModelo[] {
  const filledRows = fillInheritedNames(rows, cols.nombre)
  const groups = new Map<string, TiendaNubeModelo>()

  for (const row of filledRows) {
    const get = (i: number) => (i !== -1 ? (row[i] ?? '') : '').trim()
    const nombre = get(cols.nombre)
    if (!nombre) continue

    const { marca, modelo } = parseNombre(nombre)
    const { categoria, gama } = parseCategorias(get(cols.categorias))
    const key = `${marca}|${modelo}|${categoria}|${gama}`

    if (!groups.has(key)) {
      const precioRaw = get(cols.precio).replace(/[$\s.]/g, '').replace(',', '.')
      const costoRaw = get(cols.costo).replace(/[$\s.]/g, '').replace(',', '.')
      const codigoBase = buildCodigoBase(marca, modelo, categoria, gama)
      const errors: string[] = []
      if (!nombre) errors.push('nombre vacío')
      if (!precioRaw || isNaN(parseFloat(precioRaw))) errors.push('precio inválido')

      groups.set(key, {
        marca, modelo, categoria, gama,
        precio_venta: parseFloat(precioRaw) || 0,
        precio_costo: parseFloat(costoRaw) || 0,
        notas: get(cols.sku),
        talles: [],
        codigo_base_preview: codigoBase,
        errors,
      })
    }

    const group = groups.get(key)!
    const talleRaw = getTalleFromRow(row, cols, headers)
    const talleResult = parseTalle(talleRaw)
    const stockRaw = get(cols.stock)

    if (talleResult) {
      const existe = group.talles.find(t => t.talle_arg === talleResult.talle_arg)
      if (!existe) {
        group.talles.push({
          talle_us: talleResult.talle_us,
          talle_arg: talleResult.talle_arg,
          cantidad: parseInt(stockRaw) || 0,
        })
      }
    }
  }

  return Array.from(groups.values())
}
