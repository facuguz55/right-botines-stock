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
  precio_promocional: number | null
  precio_efectivo: number | null
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

export type MedioPago = 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Mixto'

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
  empleado_id?: string | null
  monto_efectivo?: number | null
  monto_transferencia?: number | null
  modelos?: { modelo: string; marca: string; categoria: string; gama: string } | null
  clientes_locales?: { nombre: string; telefono: string | null; email: string | null } | null
  empleados?: { nombre: string } | null
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
  | 'empleados' | 'caja'

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

// ── Empleados / Fichajes / Caja ──────────────────────────────────────────

export interface Empleado {
  id: string
  nombre: string
  activo: boolean
  created_at: string
}

export interface Fichaje {
  id: string
  empleado_id: string
  hora_entrada: string
  hora_salida: string | null
  created_at: string
  empleados?: { nombre: string } | null
}

export interface ConfiguracionFichajes {
  id: number
  hora_limite_cierre: string
  updated_at: string
}

export type CajaEstado = 'abierta' | 'cerrada'

export interface CajaDia {
  id: string
  fecha: string
  monto_apertura: number
  abierta_por: string | null
  abierta_at: string | null
  estado: CajaEstado
  monto_cierre_contado: number | null
  monto_esperado_snapshot: number | null
  diferencia: number | null
  cerrada_por: string | null
  cerrada_at: string | null
  notas: string | null
  total_gastos_snapshot: number | null
  created_at: string
  empleado_apertura?: { nombre: string } | null
  empleado_cierre?: { nombre: string } | null
}

export interface CajaGasto {
  id: string
  caja_dia_id: string
  monto: number
  motivo: string
  empleado_id: string | null
  created_at: string
  empleados?: { nombre: string } | null
}

export interface TotalesEfectivoDia {
  efectivo: number
  transferencia: number
  tarjeta: number
}

