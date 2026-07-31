// ── Servicio de sincronización TiendaNube → Stock local ─────────────────────
// Descarga todos los productos de TN y los upsertea en Supabase.
// Las imágenes se guardan como URLs directas del CDN de TN (sin re-upload).

import { supabase } from '../lib/supabase'
import { fetchModelos, createModelo, updateModelo, upsertTalle } from './modelos'
import { fetchTNRawProducts, fetchTNProduct, updateTNVariant, getTNCredentials } from './tiendanubeService'
import type { Modelo } from '../types'

export interface SyncResult {
  created: number
  updated: number
  imagesAdded: number
  errors: string[]
  total: number
}

// ── Tablas de conversión de talles ──────────────────────────────────────────

const ARG_TO_US: Record<number, number> = {
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

function getUsFromArg(arg: number): number {
  return ARG_TO_US[arg] ?? Math.round((arg - 30.5) * 2) / 2
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

function detectCategoria(name: string, catNames: string[]): string {
  const all = [name, ...catNames].join(' ').toLowerCase()
  if (/futsal|f\.?sala|sala/.test(all))                               return 'Futsal'
  if (/hockey/.test(all))                                              return 'Hockey'
  if (/\bf5\b|fútbol\s*5|futbol\s*5|cinco/.test(all))                return 'F5'
  if (/\bf11\b|fútbol\s*11|futbol\s*11|once|eleven/.test(all))       return 'F11'
  return 'F11' // fallback
}

function detectGama(name: string, catNames: string[]): string {
  const all = [name, ...catNames].join(' ').toLowerCase()
  if (/económica|economica|low|entry|baja/.test(all))                 return 'Económica'
  if (/mixto|mix|dual|campo/.test(all))                               return 'Mixto'
  if (/\bmedia\b|mid\b|intermedia/.test(all))                         return 'Media'
  if (/\balta\b|high|premium|pro\b|top\b|elite/.test(all))           return 'Alta'
  return 'Alta' // fallback
}

// ── Extracción de marca y modelo ─────────────────────────────────────────────

function extractMarcaModelo(prod: {
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

// ── Función principal de sincronización ──────────────────────────────────────

export async function syncTNStock(
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, imagesAdded: 0, errors: [], total: 0 }

  const { storeId, token } = getTNCredentials()
  if (!storeId || !token) {
    result.errors.push('Sin credenciales TiendaNube')
    return result
  }

  onProgress?.('Obteniendo catálogo de TiendaNube...')
  const tnProducts = await fetchTNRawProducts(storeId, token)
  result.total = tnProducts.length
  if (result.total === 0) return result

  onProgress?.('Cargando stock local...')
  const localModelos = await fetchModelos()

  const localByCode = new Map<string, Modelo>()
  for (const m of localModelos) localByCode.set(m.codigo_base, m)

  for (let i = 0; i < tnProducts.length; i++) {
    const prod = tnProducts[i]
    const name = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? `Producto ${prod.id}`
    onProgress?.(`[${i + 1}/${tnProducts.length}] ${name.slice(0, 40)}`)

    try {
      const codigoBase   = `tn_${prod.id}`
      const catNames     = (prod.categories ?? []).map(c => c.name?.es ?? c.name?.en ?? '')
      const categoria    = detectCategoria(name, catNames)
      const gama         = detectGama(name, catNames)
      const { marca, modelo } = extractMarcaModelo(prod)
      const precio_venta = parseFloat(prod.variants[0]?.price ?? '0') || 0

      const existing = localByCode.get(codigoBase)

      // ── VARIANTES: parseamos los talles ─────────────────────────────────
      const variantTalles = prod.variants
        .map(v => {
          const label = (v.values ?? [])
            .map(val => val.es ?? val.en ?? Object.values(val).find(x => x) ?? '')
            .join(' ')
          const talle_arg = parseTalleArg(label)
          return talle_arg !== null
            ? { talle_arg, talle_us: getUsFromArg(talle_arg), stock: v.stock ?? 0, sku: v.sku }
            : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      if (existing) {
        // ── ACTUALIZAR ──────────────────────────────────────────────────
        await updateModelo(existing.id, {
          marca, modelo, categoria, gama,
          precio_venta,
          precio_costo: existing.precio_costo,
          codigo_base: codigoBase,
          notas: existing.notas,
        })

        for (const vt of variantTalles) {
          const existingTalle = existing.modelo_talles.find(t => t.talle_arg === vt.talle_arg)
          await upsertTalle({
            id:          existingTalle?.id,
            modelo_id:   existing.id,
            talle_us:    vt.talle_us,
            talle_arg:   vt.talle_arg,
            cantidad:    vt.stock,
            stock_minimo: existingTalle?.stock_minimo ?? 1,
          })
        }

        // Agregar imágenes solo si el modelo no tiene ninguna
        if (existing.modelo_fotos.length === 0 && prod.images.length > 0) {
          const rows = prod.images.slice(0, 5).map((img, idx) => ({
            modelo_id: existing.id,
            foto_url:  img.src,
            orden:     idx,
          }))
          const { error } = await supabase.from('modelo_fotos').insert(rows)
          if (!error) result.imagesAdded += rows.length
        }

        result.updated++

      } else {
        // ── CREAR ───────────────────────────────────────────────────────
        const newModelo = await createModelo({
          marca, modelo, categoria, gama,
          precio_venta,
          precio_costo: 0,
          codigo_base:  codigoBase,
          notas:        null,
        })

        for (const vt of variantTalles) {
          await upsertTalle({
            modelo_id:   newModelo.id,
            talle_us:    vt.talle_us,
            talle_arg:   vt.talle_arg,
            cantidad:    vt.stock,
            stock_minimo: 1,
          })
        }

        if (prod.images.length > 0) {
          const rows = prod.images.slice(0, 5).map((img, idx) => ({
            modelo_id: newModelo.id,
            foto_url:  img.src,
            orden:     idx,
          }))
          const { error } = await supabase.from('modelo_fotos').insert(rows)
          if (!error) result.imagesAdded += rows.length
        }

        result.created++
      }
    } catch (err) {
      result.errors.push(`Producto ${prod.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}

// ── Stock local → TiendaNube ─────────────────────────────────────────────────
// Al vender un talle desde el dashboard, empuja el nuevo stock a la variante
// correspondiente en TiendaNube (si el modelo proviene de un sync de TN).

export async function pushStockToTN(modelo: Modelo, talleArg: number, nuevaCantidad: number): Promise<void> {
  if (!modelo.codigo_base.startsWith('tn_')) return

  const productId = parseInt(modelo.codigo_base.slice('tn_'.length), 10)
  if (!Number.isFinite(productId)) return

  const { storeId, token } = getTNCredentials()
  if (!storeId || !token) return

  const prod = await fetchTNProduct(storeId, token, productId)

  const variant = prod.variants.find(v => {
    const label = (v.values ?? [])
      .map(val => val.es ?? val.en ?? Object.values(val).find(x => x) ?? '')
      .join(' ')
    return parseTalleArg(label) === talleArg
  })
  if (!variant) throw new Error(`No se encontró en TiendaNube la variante de talle ${talleArg}`)

  await updateTNVariant(storeId, token, productId, variant.id, { stock: Math.max(0, nuevaCantidad) })
}
