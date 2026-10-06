import { supabase } from '../lib/supabase'

export interface TraficoResumen {
  visitantes: number
  sesiones: number
  paginas_vistas: number
  por_dia: { dia: string; visitantes: number; sesiones: number }[]
  dispositivos: { dispositivo: 'mobile' | 'tablet' | 'desktop'; sesiones: number }[]
  ciudades: { ciudad: string; sesiones: number }[]
  productos: { tn_product_id: number; vistas: number; carritos: number }[]
  paginas: { path: string; vistas: number }[]
  embudo: {
    sesiones: number
    vieron_producto: number
    agregaron_carrito: number
    iniciaron_checkout: number
    compraron: number
  }
  primer_evento: string | null
}

// Todo el agregado se calcula en la base (RPC web_trafico_resumen) — los
// eventos crudos pueden ser miles por día y no tiene sentido bajarlos.
export async function fetchTraficoResumen(desde: string, hasta: string): Promise<TraficoResumen> {
  const { data, error } = await supabase.rpc('web_trafico_resumen', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return data as TraficoResumen
}
