// Estado de entrega de un mensaje saliente (lo informa Meta por el webhook).
export type EstadoEntrega = 'sent' | 'delivered' | 'read' | 'failed'

export const ESTADO_TITULO: Record<EstadoEntrega, string> = {
  sent: 'Enviado',
  delivered: 'Entregado al celular del cliente',
  read: 'Visto por el cliente',
  failed: 'No se pudo entregar',
}

// Por qué falló, en criollo. El código es el de Meta ("131047: Re-engagement…").
const MOTIVOS: Record<string, string> = {
  '131047': 'pasaron más de 24 hs desde el último mensaje del cliente. WhatsApp solo deja escribirle con una plantilla aprobada hasta que él escriba de nuevo',
  '131026': 'el número no tiene WhatsApp, o el cliente tiene una versión muy vieja o lo bloqueó',
  '131049': 'WhatsApp decidió no entregarlo (límite de mensajes a ese cliente)',
  '131051': 'tipo de archivo no soportado por WhatsApp',
  '131053': 'no se pudo subir el archivo (formato o peso no soportado)',
  '131052': 'no se pudo descargar el archivo que mandó el cliente',
  '130429': 'se mandaron demasiados mensajes juntos, esperá un rato',
  '131056': 'se mandaron demasiados mensajes a ese cliente en poco tiempo',
}

export function motivoFallo(waError: string | null | undefined): string {
  if (!waError) return 'WhatsApp no lo pudo entregar'
  const codigo = waError.match(/^\s*(\d{5,6})/)?.[1]
  if (codigo && MOTIVOS[codigo]) return MOTIVOS[codigo]
  return waError.replace(/^\s*\d+\s*:\s*/, '') || 'WhatsApp no lo pudo entregar'
}

export function estadoEntrega(m: { direccion: string; wa_message_id: string | null; wa_estado?: string | null }): EstadoEntrega | null {
  if (m.direccion !== 'out' || !m.wa_message_id) return null
  // Sin aviso todavía de Meta = recién enviado (un tilde).
  return (m.wa_estado as EstadoEntrega | null | undefined) ?? 'sent'
}
