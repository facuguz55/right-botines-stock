import type { ClienteLocal } from './index'

export type CrmCategoria = 'Urgente' | 'Pedido de talles' | 'Normal' | 'Spam' | 'Postventa/Reclamos' | 'Mayorista'
export type CrmEstado = 'Sin leer' | 'Respondido' | 'Venta concretada' | 'Cerrado'
export type MensajeDireccion = 'in' | 'out'
export type MensajeTipo = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker'

export const CRM_CATEGORIAS: CrmCategoria[] = [
  'Urgente', 'Pedido de talles', 'Normal', 'Spam', 'Postventa/Reclamos', 'Mayorista',
]

export const CRM_ESTADOS: CrmEstado[] = [
  'Sin leer', 'Respondido', 'Venta concretada', 'Cerrado',
]

export const CATEGORIA_COLORS: Record<CrmCategoria, string> = {
  'Urgente': '#F97316',
  'Pedido de talles': '#22D3EE',
  'Normal': '#8B949E',
  'Spam': '#4B5563',
  'Postventa/Reclamos': '#EF4444',
  'Mayorista': '#A78BFA',
}

export interface CrmCliente {
  id: string
  wa_contact_id: string
  nombre: string | null
  telefono: string | null
  dni: string | null
  notas: string | null
  cliente_local_id: string | null
  created_at: string
  clientes_locales?: ClienteLocal | null
}

export interface WspConversacion {
  id: string
  wa_contact_id: string
  crm_cliente_id: string | null
  nombre: string | null
  telefono: string | null
  avatar_url: string | null
  categoria: CrmCategoria
  estado: CrmEstado
  asignado_a: string | null
  no_leidos: number
  ultimo_mensaje: string | null
  ultimo_mensaje_at: string
  created_at: string
  crm_clientes?: CrmCliente | null
}

export interface WspMensaje {
  id: string
  conversacion_id: string
  direccion: MensajeDireccion
  tipo: MensajeTipo
  contenido: string | null
  transcripcion: string | null
  media_url: string | null
  wa_message_id: string | null
  enviado_por: string | null
  timestamp: string
  empleados?: { nombre: string } | null
}

export interface WspIaSugerencia {
  id: string
  mensaje_id: string | null
  conversacion_id: string | null
  categoria_sugerida: string | null
  intencion: string | null
  tipo_detectado: string | null
  talle_detectado: number | null
  respuesta_sugerida: string | null
  usada: boolean
  created_at: string
}

export interface WspEnvioFotos {
  id: string
  conversacion_id: string
  modelo_id: string | null
  talle: number | null
  enviado_por: string | null
  created_at: string
}

export interface WspReclasificacion {
  id: string
  conversacion_id: string
  categoria_anterior: string
  categoria_nueva: string
  por: string | null
  created_at: string
}

export interface CrmStatsData {
  mensajesPorDia: { fecha: string; cantidad: number }[]
  tiempoRespuestaPromedio: number
  mensajesPorCategoria: { categoria: string; cantidad: number }[]
  conversionAVenta: { total: number; concretadas: number; porcentaje: number }
  productosMasConsultados: { modelo_id: string; marca: string; modelo: string; consultas: number }[]
  actividadVendedora: { fecha: string; mensajes_enviados: number; conversaciones_atendidas: number }[]
  horasPico: { hora: number; cantidad: number }[]
}

export interface PhotoMatch {
  modelo_id: string
  marca: string
  modelo: string
  categoria: string
  precio_venta: number
  precio_efectivo: number | null
  talles_disponibles: { talle_arg: number; cantidad: number }[]
  fotos: { foto_url: string; orden: number }[]
}
