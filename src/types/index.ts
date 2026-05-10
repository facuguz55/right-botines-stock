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
  modelos?: { modelo: string; marca: string; categoria: string; gama: string } | null
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

export type ActivePage = 'stock' | 'dashboard' | 'ventas' | 'configuracion'

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
