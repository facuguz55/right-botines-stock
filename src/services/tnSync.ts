// ── Servicio de sincronización TiendaNube ↔ Stock local ─────────────────────
// Sync incremental y bidireccional: los cambios puntuales (alta/edición/borrado
// de producto o talle) se empujan al toque. syncTNStock queda como resync de
// respaldo (corre cada 1h, ver useTNSync.ts) para cubrir webhooks perdidos.

import { supabase } from '../lib/supabase'
import { fetchModelos, createModelo, updateModelo, upsertTalle, deleteTalle } from './modelos'
import {
  fetchTNRawProducts, fetchTNProduct, updateTNVariant, createTNProduct,
  updateTNProduct, deleteTNProduct, createTNVariant, deleteTNVariant,
  getTNCredentials, type TNRawProduct,
} from './tiendanubeService'
import {
  parseTalleArg, getUsFromArg, detectCategoria, detectGama, extractMarcaModelo, variantLabel,
  computePrecioEfectivo,
} from '../lib/tnMapping'
import type { Modelo, ModeloTalle } from '../types'

export interface SyncResult {
  created: number
  updated: number
  imagesAdded: number
  errors: string[]
  total: number
}

export { parseTalleArg }

// ── Upsert de un modelo local a partir de un producto TN completo ───────────
// Compartido por syncTNStock (full-pull) y por el webhook de un solo producto.

export async function upsertModeloFromTNProduct(
  prod: TNRawProduct,
  existing: Modelo | undefined,
  recargoCredito3CuotasPct: number | null,
): Promise<{ created: boolean; imagesAdded: number }> {
  const name = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? `Producto ${prod.id}`
  const catNames = (prod.categories ?? []).map(c => c.name?.es ?? c.name?.en ?? '')
  const categoria = detectCategoria(name, catNames)
  const gama = detectGama(name, catNames)
  const { marca, modelo } = extractMarcaModelo(prod)
  const precio_venta = parseFloat(prod.variants[0]?.price ?? '0') || 0
  // El "Promocional" de TN es el precio CON TARJETA de cada producto (campo
  // propio, no un % fijo — ver precio_promocional_tn.sql). El precio real de
  // efectivo/transferencia se deriva dividiendo por el recargo de Crédito 3
  // cuotas vigente (ver precio_efectivo.sql).
  const promoRaw = prod.variants[0]?.promotional_price
  const precio_promocional = promoRaw ? parseFloat(promoRaw) || null : null
  const precio_efectivo = computePrecioEfectivo(precio_promocional, recargoCredito3CuotasPct)
  const tn_category_id = prod.categories?.[0]?.id ?? null

  const variantTalles = prod.variants
    .map(v => {
      const talle_arg = parseTalleArg(variantLabel(v))
      return talle_arg !== null
        ? { talle_arg, talle_us: getUsFromArg(talle_arg), stock: v.stock ?? 0, variantId: v.id }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  let imagesAdded = 0

  if (existing) {
    await updateModelo(existing.id, {
      marca, modelo, categoria, gama,
      precio_venta,
      precio_promocional,
      precio_efectivo,
      precio_costo: existing.precio_costo,
      codigo_base: existing.codigo_base,
      notas: existing.notas,
      tn_product_id: prod.id,
      tn_category_id,
    })

    // Comparación por string: talle_arg es `numeric` en Postgres y puede
    // volver como string vía la API REST — Number(x) === Number(y) evita
    // que un mismatch de tipo rompa el matching silenciosamente.
    const seenTalleArgs = new Set<number>()
    for (const vt of variantTalles) {
      seenTalleArgs.add(vt.talle_arg)
      const existingTalle = existing.modelo_talles.find(t => Number(t.talle_arg) === vt.talle_arg)
      await upsertTalle({
        id: existingTalle?.id,
        modelo_id: existing.id,
        talle_us: vt.talle_us,
        talle_arg: vt.talle_arg,
        cantidad: vt.stock,
        stock_minimo: existingTalle?.stock_minimo ?? 1,
        tn_variant_id: vt.variantId,
      })
    }

    // Bidireccional: un talle local que ya no aparece en TN se borra acá.
    for (const t of existing.modelo_talles) {
      if (!seenTalleArgs.has(Number(t.talle_arg))) await deleteTalle(t.id)
    }

    if (existing.modelo_fotos.length === 0 && prod.images.length > 0) {
      const rows = prod.images.slice(0, 5).map((img, idx) => ({
        modelo_id: existing.id, foto_url: img.src, orden: idx,
      }))
      const { error } = await supabase.from('modelo_fotos').insert(rows)
      if (!error) imagesAdded = rows.length
    }

    return { created: false, imagesAdded }
  }

  const newModelo = await createModelo({
    marca, modelo, categoria, gama,
    precio_venta,
    precio_promocional,
    precio_efectivo,
    precio_costo: 0,
    codigo_base: `tn_${prod.id}`,
    notas: null,
    tn_product_id: prod.id,
    tn_category_id,
  })

  for (const vt of variantTalles) {
    await upsertTalle({
      modelo_id: newModelo.id,
      talle_us: vt.talle_us,
      talle_arg: vt.talle_arg,
      cantidad: vt.stock,
      stock_minimo: 1,
      tn_variant_id: vt.variantId,
    })
  }

  if (prod.images.length > 0) {
    const rows = prod.images.slice(0, 5).map((img, idx) => ({
      modelo_id: newModelo.id, foto_url: img.src, orden: idx,
    }))
    const { error } = await supabase.from('modelo_fotos').insert(rows)
    if (!error) imagesAdded = rows.length
  }

  return { created: true, imagesAdded }
}

// ── Resync completo de respaldo (cada 1h, ver useTNSync.ts) ─────────────────

export async function syncTNStock(
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, imagesAdded: 0, errors: [], total: 0 }

  const { storeId, token } = getTNCredentials()

  onProgress?.('Obteniendo catálogo de TiendaNube...')
  const tnProducts = await fetchTNRawProducts(storeId, token)
  result.total = tnProducts.length
  if (result.total === 0) return result

  onProgress?.('Cargando stock local...')
  const localModelos = await fetchModelos()
  const { data: recargoRow } = await supabase
    .from('recargos_tarjeta')
    .select('porcentaje')
    .eq('tarjeta', 'Crédito')
    .eq('cuotas', 3)
    .eq('activo', true)
    .maybeSingle()
  const recargoCredito3CuotasPct = recargoRow?.porcentaje ?? null
  // Claves como string: Postgres devuelve las columnas bigint (tn_product_id)
  // como string en algunos casos vía la API REST — comparar como number con
  // Map<number,...> puede fallar silenciosamente por mismatch de tipo.
  const localByTNId = new Map<string, Modelo>()
  for (const m of localModelos) if (m.tn_product_id != null) localByTNId.set(String(m.tn_product_id), m)

  for (let i = 0; i < tnProducts.length; i++) {
    const prod = tnProducts[i]
    const name = prod.name.es ?? prod.name.en ?? Object.values(prod.name)[0] ?? `Producto ${prod.id}`
    onProgress?.(`[${i + 1}/${tnProducts.length}] ${name.slice(0, 40)}`)

    try {
      const { created, imagesAdded } = await upsertModeloFromTNProduct(prod, localByTNId.get(String(prod.id)), recargoCredito3CuotasPct)
      result[created ? 'created' : 'updated']++
      result.imagesAdded += imagesAdded
    } catch (err) {
      result.errors.push(`Producto ${prod.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}

// ── Resolución de variant.id (con auto-cacheo en Supabase) ──────────────────

export async function resolveTNVariantId(modelo: Modelo, talle: ModeloTalle): Promise<number | null> {
  if (talle.tn_variant_id) return talle.tn_variant_id
  if (!modelo.tn_product_id) return null

  const { storeId, token } = getTNCredentials()
  const prod = await fetchTNProduct(storeId, token, modelo.tn_product_id)
  const variant = prod.variants.find(v => parseTalleArg(variantLabel(v)) === Number(talle.talle_arg))
  if (!variant) return null

  await supabase.from('modelo_talles').update({ tn_variant_id: variant.id }).eq('id', talle.id)
  return variant.id
}

// ── Stock local → TiendaNube ─────────────────────────────────────────────────

export async function pushStockToTN(modelo: Modelo, talleArg: number, nuevaCantidad: number): Promise<void> {
  if (!modelo.tn_product_id) return
  const talle = modelo.modelo_talles.find(t => Number(t.talle_arg) === Number(talleArg))
  if (!talle) return

  const variantId = await resolveTNVariantId(modelo, talle)
  if (!variantId) return

  const { storeId, token } = getTNCredentials()
  await updateTNVariant(storeId, token, modelo.tn_product_id, variantId, { stock: Math.max(0, nuevaCantidad) })
}

// ── Edición/borrado de producto local → TiendaNube ───────────────────────────

export async function pushModeloUpdateToTN(modelo: Modelo, opts: { categoryChanged?: boolean } = {}): Promise<void> {
  if (!modelo.tn_product_id) return
  const { storeId, token } = getTNCredentials()

  await updateTNProduct(storeId, token, modelo.tn_product_id, {
    name: `${modelo.marca} ${modelo.modelo}`,
    ...(opts.categoryChanged ? { categoryId: modelo.tn_category_id ?? null } : {}),
  })

  // El precio en TN vive por VARIANTE, no por producto → iterar todos los talles
  for (const talle of modelo.modelo_talles) {
    const variantId = await resolveTNVariantId(modelo, talle)
    if (variantId) {
      await updateTNVariant(storeId, token, modelo.tn_product_id, variantId, { price: String(modelo.precio_venta) })
    }
  }
}

export async function pushModeloDeleteToTN(modelo: Modelo): Promise<void> {
  if (!modelo.tn_product_id) return
  const { storeId, token } = getTNCredentials()
  await deleteTNProduct(storeId, token, modelo.tn_product_id)
}

// ── Altas/bajas/ediciones de talle local → TiendaNube ────────────────────────

export async function pushTalleCreateToTN(
  modelo: Modelo,
  talle: { id: string; talle_arg: number; talle_us: number; cantidad: number },
): Promise<void> {
  if (!modelo.tn_product_id) return
  const { storeId, token } = getTNCredentials()
  const { variantId } = await createTNVariant(storeId, token, modelo.tn_product_id, {
    price: modelo.precio_venta, stock: talle.cantidad, talleArg: talle.talle_arg, talleUs: talle.talle_us,
  })
  await supabase.from('modelo_talles').update({ tn_variant_id: variantId }).eq('id', talle.id)
}

export async function pushTalleDeleteToTN(modelo: Modelo, talle: ModeloTalle): Promise<void> {
  if (!modelo.tn_product_id) return
  const variantId = await resolveTNVariantId(modelo, talle)
  if (!variantId) return
  const { storeId, token } = getTNCredentials()
  await deleteTNVariant(storeId, token, modelo.tn_product_id, variantId)
}

export async function pushTalleUpdateToTN(
  modelo: Modelo, talle: ModeloTalle, opts: { labelChanged?: boolean } = {},
): Promise<void> {
  if (!modelo.tn_product_id) return
  const variantId = await resolveTNVariantId(modelo, talle)
  if (!variantId) {
    // Self-heal: si nunca se creó del lado de TN (ej. falló el alta original), la creamos ahora.
    await pushTalleCreateToTN(modelo, talle)
    return
  }
  const { storeId, token } = getTNCredentials()
  const data: { stock: number; values?: { es: string }[] } = { stock: Math.max(0, talle.cantidad) }
  if (opts.labelChanged) {
    data.values = [{ es: `${talle.talle_arg} arg / ${String(talle.talle_us).replace('.', ',')} us` }]
  }
  await updateTNVariant(storeId, token, modelo.tn_product_id, variantId, data)
}

// ── Modelo nuevo local → TiendaNube ──────────────────────────────────────────

export async function createTNProductAndLink(
  modelo: Modelo,
  talles: { id: string; talleArg: number; talleUs: number; cantidad: number }[],
  fotoUrls: string[],
  categoryId: number | null,
): Promise<void> {
  const { storeId, token } = getTNCredentials()

  const { productId, variants } = await createTNProduct(storeId, token, {
    name: `${modelo.marca} ${modelo.modelo}`,
    categoryId,
    precioVenta: modelo.precio_venta,
    talles: talles.map(({ talleArg, talleUs, cantidad }) => ({ talleArg, talleUs, cantidad })),
    fotos: fotoUrls,
  })

  await updateModelo(modelo.id, { tn_product_id: productId, tn_category_id: categoryId })

  for (const t of talles) {
    const match = variants.find(v => parseTalleArg(variantLabel(v)) === t.talleArg)
    if (match) await supabase.from('modelo_talles').update({ tn_variant_id: match.id }).eq('id', t.id)
  }
}
