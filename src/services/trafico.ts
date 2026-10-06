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

export interface ProductoAnalisis {
  tn_product_id: number
  vistas: number      // sesiones que vieron el producto
  carritos: number    // sesiones que lo agregaron al carrito
  checkouts: number   // de esas, las que después fueron al checkout
  ordenes: number     // órdenes web que lo incluyen (tn_ordenes)
  unidades: number
  stock: number | null
  nombre: string | null // nombre en TiendaNube, por si no está en el catálogo
}

export interface TalleAgotado {
  tn_product_id: number
  talle: string
  sesiones: number
  stock_actual: number | null
}

export interface AnalisisProductos {
  productos: ProductoAnalisis[]
  talles_agotados: TalleAgotado[]
}

export async function fetchAnalisisProductos(desde: string, hasta: string): Promise<AnalisisProductos> {
  const { data, error } = await supabase.rpc('web_analisis_productos', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return data as AnalisisProductos
}

// Todo el agregado se calcula en la base (RPC web_trafico_resumen) — los
// eventos crudos pueden ser miles por día y no tiene sentido bajarlos.
export async function fetchTraficoResumen(desde: string, hasta: string): Promise<TraficoResumen> {
  const { data, error } = await supabase.rpc('web_trafico_resumen', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return data as TraficoResumen
}

export interface CanalTrafico {
  canal: string
  sesiones: number
  visitantes: number
  vieron_producto: number
  carritos: number
  checkouts: number
  paginas_por_visita: number
}

export interface CampanaTrafico {
  campana: string
  utm_source: string | null
  utm_medium: string | null
  canal: string
  sesiones: number
  carritos: number
  checkouts: number
}

export interface TraficoCanales {
  canales: CanalTrafico[]
  campanas: CampanaTrafico[]
}

// El canal de cada visita se decide en la base (web_canal): UTM → ID de
// click → navegador interno de la app → referrer → Directo.
export async function fetchTraficoCanales(desde: string, hasta: string): Promise<TraficoCanales> {
  const { data, error } = await supabase.rpc('web_trafico_canales', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return data as TraficoCanales
}
