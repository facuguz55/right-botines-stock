export interface ModeloFoto {
  id: string
  modelo_id: string
  foto_url: string
  orden: number
  created_at: string
}

export interface ModeloTalle {
  id: string
  modelo_id: string
  talle_us: number
  talle_arg: number
  cantidad: number
  stock_minimo: number
  tn_variant_id?: number | null
}

export interface Modelo {
  id: string
  marca: string
  modelo: string
  categoria: string
  gama: string
  precio_costo: number
  precio_venta: number
  codigo_base: string
  notas: string | null
  created_at: string
  modelo_talles: ModeloTalle[]
  modelo_fotos: ModeloFoto[]
  tn_product_id?: number | null
  tn_category_id?: number | null
}

export interface HistorialPrecio {
  id: string
  modelo_id: string
  precio_venta_anterior: number
  precio_venta_nuevo: number
  fecha: string
}

export type MedioPago = 'Efectivo' | 'Transferencia' | 'Tarjeta'

export interface Venta {
  id: string
  modelo_id: string | null
  talle_arg: number
  fecha: string
  precio_venta: number
  medio_pago: MedioPago
  recargo_tarjeta: number | null
  ganancia: number
  cliente_id: string | null
  venta_grupo_id: string | null
  precio_tipo?: 'lista' | 'promocional' | null
  descuento_pct_aplicado?: number | null
  tarjeta?: string | null
  cuotas?: number | null
  modelos?: { modelo: string; marca: string; categoria: string; gama: string } | null
  clientes_locales?: { nombre: string; telefono: string | null; email: string | null } | null
}

export interface ClienteLocal {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
  created_at: string
}

export interface CartItem {
  modelo: Modelo
  talleId: string
  talleArg: number
  talleUs: number
  cantidad: number
  usarPromocional: boolean
}

export interface TopModelo {
  modelo_id: string
  marca: string
  nombre: string
  codigo_base: string
  cantidadVendida: number
  foto_url: string | null
}

export interface DashboardData {
  totalModelos: number
  totalPares: number
  ventasMes: number
  totalFacturadoMes: number
  gananciaMes: number
  ventasPorSemana: { semana: string; ventas: number }[]
  topModelos: TopModelo[]
  alertasStock: {
    modelo: Modelo
    tallesAlerta: ModeloTalle[]
  }[]
}

export type Role = 'empleado' | 'dueno'

export type ActivePage =
  | 'stock' | 'dashboard' | 'ventas' | 'stock_avanzado' | 'carpetas' | 'configuracion' | 'seguimientos'
  | 'clientes_locales'
  | 'tn_dashboard' | 'tn_analytics' | 'tn_ordenes' | 'tn_clientes' | 'tn_cupones' | 'tn_mails'
  | 'rentabilidad'

// Para importación TiendaNube
export interface TiendaNubeModelo {
  marca: string
  modelo: string
  categoria: string
  gama: string
  precio_venta: number
  precio_costo: number
  notas: string
  talles: { talle_us: number; talle_arg: number; cantidad: number }[]
  codigo_base_preview: string
  errors: string[]
}

export interface EmailEnviado {
  id: string
  client_id: string
  email: string
  fecha: string
  created_at: string
}

export interface Conversion {
  id: string
  client_id: string
  email: string
  nombre_cliente: string
  id_orden: string
  total_orden: string
  fecha_orden: string
  fecha_click: string
  fecha_verificacion: string
  utm_campaign: string
}

export interface ClickTracking {
  id: string
  client_id: string
  email: string
  checkout_url: string
  fecha_click: string
  created_at: string
}

export interface SeguimientosData {
  emailsEnviados: EmailEnviado[]
  conversiones: Conversion[]
  clicks: ClickTracking[]
}

export type AjusteTipo = 'porcentaje' | 'fijo'
export type AjusteOperacion = 'descuento' | 'aumento'

export interface AjustePrecioFiltros {
  gama: string
  marca: string
  categoria: string
}

export interface AjustePrecioConfig {
  tipo: AjusteTipo
  operacion: AjusteOperacion
  valor: number
  filtros: AjustePrecioFiltros
}

export interface ModeloFilters {
  marca: string
  categoria: string
  gama: string
  talle: string
  disponibilidad: 'todos' | 'disponible' | 'agotado'
  search: string
}

export interface PhotoSlot {
  id?: string
  url: string
  file?: File
  orden: number
}

export interface TalleRow {
  id?: string
  talle_us: string
  talle_arg: string
  cantidad: string
  stock_minimo: string
  toDelete: boolean
}

// ── Costos configurables / Rentabilidad ──────────────────────────────────────

export type CostoTipo = 'fijo_mensual' | 'variable_venta'
export type CostoCanal = 'local' | 'web' | 'ambos'
export type CostoModoValor = 'monto' | 'porcentaje'

export interface CostoConfig {
  id: string
  nombre: string
  tipo: CostoTipo
  canal: CostoCanal
  modo_valor: CostoModoValor
  valor: number
  categoria: string | null
  activo: boolean
  vigente_desde: string
  vigente_hasta: string | null
  prorateo_web_pct: number | null
  notas: string | null
  created_at: string
  updated_at: string
}

export interface CostoUnico {
  id: string
  nombre: string
  canal: CostoCanal
  monto: number
  categoria: string | null
  fecha: string
  notas: string | null
  created_at: string
}

export interface RentabilidadCanal {
  facturado: number
  costoProductos: number
  gananciaBruta: number
  costosFijos: number
  costosVariables: number
  costosUnicos: number
  gananciaNeta: number
  margenNeto: number
  sinVincular: number
}

export interface RentabilidadMes {
  mes: string
  local: RentabilidadCanal
  web: RentabilidadCanal
  total: { facturado: number; gananciaNeta: number; margenNeto: number }
}

export interface RecargoTarjeta {
  id: string
  tarjeta: string
  cuotas: number
  porcentaje: number
  activo: boolean
  created_at: string
}

