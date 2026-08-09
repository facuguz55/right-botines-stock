// ── Helpers puros de mapeo TiendaNube ↔ modelo local ─────────────────────────
// Sin dependencias de supabase-js ni de import.meta.env: lo usan tanto
// src/services/tnSync.ts (cliente) como api/tn-webhook.ts (Vercel Edge).

export interface TNValue { es?: string; en?: string; [k: string]: string | undefined }
export interface TNVariantLike { values?: TNValue[] }

// ── Tablas de conversión de talles ──────────────────────────────────────────

export const ARG_TO_US: Record<number, number> = {
  34: 2, 34.5: 2.5,
  35: 3, 35.5: 3.5,
  36: 4, 36.5: 4.5,
  37: 5, 37.5: 5.5,
  38: 6, 38.5: 6.5,
  39: 7, 39.5: 7.5,
  40: 8, 40.5: 8.5,
  41: 9, 41.5: 9.5,
  42: 10, 42.5: 10.5,
  43: 11, 43.5: 11.5,
  44: 12, 44.5: 12.5,
  45: 13, 45.5: 13.5,
  46: 14, 46.5: 14.5,
  47: 15,
}

export function getUsFromArg(arg: number): number {
  return ARG_TO_US[arg] ?? Math.round((arg - 30.5) * 2) / 2
}

// ── Label de variante ────────────────────────────────────────────────────────

export function variantLabel(v: TNVariantLike): string {
  return (v.values ?? [])
    .map(val => val.es ?? val.en ?? Object.values(val).find(x => x) ?? '')
    .join(' ')
}

// ── Parsing de talle desde el label de variante ──────────────────────────────

export function parseTalleArg(label: string): number | null {
  // Limpia prefijos comunes: "Talle 39", "T 39", "T39", "39 AR", etc.
  const cleaned = label.replace(/talle|t\.?\s*/gi, '').trim()
  const match = cleaned.match(/^(\d{2,3}(?:[.,]\d)?)/)
  if (!match) return null
  const n = parseFloat(match[1].replace(',', '.'))
  if (n < 30 || n > 60) return null
  return n
}

// ── Detección de categoría y gama ────────────────────────────────────────────

export function detectCategoria(name: string, catNames: string[]): string {
  const all = [name, ...catNames].join(' ').toLowerCase()
  if (/futsal|f\.?sala|sala/.test(all))                               return 'Futsal'
  if (/hockey/.test(all))                                              return 'Hockey'
  if (/\bf5\b|fútbol\s*5|futbol\s*5|cinco/.test(all))                return 'F5'
  if (/\bf11\b|fútbol\s*11|futbol\s*11|once|eleven/.test(all))       return 'F11'
  return 'F11' // fallback
}

export function detectGama(name: string, catNames: string[]): string {
  const all = [name, ...catNames].join(' ').toLowerCase()
  if (/económica|economica|low|entry|baja/.test(all))                 return 'Económica'
  if (/mixto|mix|dual|campo/.test(all))                               return 'Mixto'
  if (/\bmedia\b|mid\b|intermedia/.test(all))                         return 'Media'
  if (/\balta\b|high|premium|pro\b|top\b|elite/.test(all))           return 'Alta'
  return 'Alta' // fallback
}

// ── Precio efectivo/transferencia a partir del "Promocional" de TN ──────────
// El promotional_price de TN es el precio CON TARJETA, no el de efectivo.
// TN no expone el precio real de efectivo/transferencia por API: son tiers
// redondos fijos por categoría que solo se ven en la web pública
// (right.com.ar/productos). Tabla relevada a mano el 2026-08-09 recorriendo
// las 8 páginas del catálogo público — cubre el 100% de los precios
// promocionales presentes en la base al momento del relevamiento.
// Si aparece un precio promocional nuevo que no está en la tabla (producto
// nuevo en TN todavía no relevado), se usa como respaldo la fórmula anterior
// (÷ recargo de Crédito 3 cuotas), que da un valor aproximado (~0.5% más alto).
export const TIERS_EFECTIVO_POR_TARJETA: Record<number, number> = {
  77500: 60000,
  135500: 105000,
  137380: 106000,
  166500: 129000,
  174300: 135000,
  174340: 135000,
  186300: 144000,
}

export function computePrecioEfectivo(
  precioPromocional: number | null, recargoCredito3CuotasPct: number | null,
): number | null {
  if (precioPromocional == null) return null
  const tier = TIERS_EFECTIVO_POR_TARJETA[precioPromocional]
  if (tier != null) return tier
  if (recargoCredito3CuotasPct == null || recargoCredito3CuotasPct <= 0) return null
  return Math.round(precioPromocional / (1 + recargoCredito3CuotasPct / 100))
}

// ── Extracción de marca y modelo ─────────────────────────────────────────────

export function extractMarcaModelo(prod: {
  brand?: string | null
  name: Record<string, string>
  id: number
}): { marca: string; modelo: string } {
  const name = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? `Producto ${prod.id}`
  const brand = (prod.brand ?? '').trim()

  if (brand) {
    const modelo = name.toLowerCase().startsWith(brand.toLowerCase())
      ? name.slice(brand.length).trim().replace(/^[-–—·]\s*/, '')
      : name
    return { marca: brand, modelo: modelo || name }
  }

  // Sin brand: primera palabra como marca
  const parts = name.split(' ')
  return {
    marca: parts[0] || 'Sin marca',
    modelo: parts.slice(1).join(' ') || name,
  }
}
