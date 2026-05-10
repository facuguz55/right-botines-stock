import { supabase } from '../lib/supabase'
import type { AjustePrecioConfig, Modelo } from '../types'

export interface PreviewAjuste {
  id: string
  marca: string
  modelo: string
  precioActual: number
  precioNuevo: number
}

function calcularPrecioNuevo(precioActual: number, config: AjustePrecioConfig): number {
  const { tipo, operacion, valor } = config
  let delta = tipo === 'porcentaje' ? precioActual * (valor / 100) : valor
  if (operacion === 'descuento') delta = -delta
  return Math.max(0, Math.round(precioActual + delta))
}

export function filtrarModelos(modelos: Modelo[], filtros: AjustePrecioConfig['filtros']): Modelo[] {
  return modelos.filter(m => {
    if (filtros.gama && m.gama !== filtros.gama) return false
    if (filtros.marca && m.marca !== filtros.marca) return false
    if (filtros.categoria && m.categoria !== filtros.categoria) return false
    return true
  })
}

export function previewAjuste(modelos: Modelo[], config: AjustePrecioConfig): PreviewAjuste[] {
  const objetivo = filtrarModelos(modelos, config.filtros)
  return objetivo.map(m => ({
    id: m.id,
    marca: m.marca,
    modelo: m.modelo,
    precioActual: m.precio_venta,
    precioNuevo: calcularPrecioNuevo(m.precio_venta, config),
  }))
}

export async function aplicarAjuste(
  modelos: Modelo[],
  config: AjustePrecioConfig
): Promise<void> {
  const items = previewAjuste(modelos, config)
  if (items.length === 0) throw new Error('No hay modelos para ajustar con esos filtros')

  // Actualizar en lotes de 20 para no saturar la API
  const BATCH = 20
  for (let i = 0; i < items.length; i += BATCH) {
    const lote = items.slice(i, i + BATCH)
    await Promise.all(
      lote.map(({ id, precioNuevo, precioActual }) =>
        supabase
          .from('modelos')
          .update({ precio_venta: precioNuevo })
          .eq('id', id)
          .then(async ({ error }) => {
            if (error) throw error
            // Registrar en historial de precios
            await supabase.from('historial_precios').insert([{
              modelo_id: id,
              precio_venta_anterior: precioActual,
              precio_venta_nuevo: precioNuevo,
            }])
          })
      )
    )
  }
}
