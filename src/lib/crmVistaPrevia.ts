// Vista previa del último mensaje en la lista de chats, como en WhatsApp:
// en vez de "[audio]" se ve el micrófono y "Mensaje de voz". Lee tanto las
// marcas que guarda el webhook ("[audio]", "[image]"…) como las que guarda la
// app al mandar ("📷 Foto", "🎥 Video", "📎 archivo.pdf").

export type IconoVistaPrevia = 'voz' | 'foto' | 'video' | 'sticker' | 'archivo' | 'celular' | null

export interface VistaPrevia {
  icono: IconoVistaPrevia
  texto: string
}

const MARCAS: Record<string, VistaPrevia> = {
  '[audio]': { icono: 'voz', texto: 'Mensaje de voz' },
  '[image]': { icono: 'foto', texto: 'Foto' },
  '[video]': { icono: 'video', texto: 'Video' },
  '[sticker]': { icono: 'sticker', texto: 'Sticker' },
  '[document]': { icono: 'archivo', texto: 'Archivo' },
  '📷 Foto': { icono: 'foto', texto: 'Foto' },
  '🎥 Video': { icono: 'video', texto: 'Video' },
}

export function vistaPrevia(ultimo: string | null): VistaPrevia {
  if (!ultimo) return { icono: null, texto: 'Sin mensajes' }
  const marca = MARCAS[ultimo.trim()]
  if (marca) return marca
  if (ultimo.startsWith('📎 ')) return { icono: 'archivo', texto: ultimo.slice(3) }
  // Fotos de ver una vez, encuestas…: WhatsApp no las pasa (ver whatsapp-webhook.ts).
  if (ultimo.startsWith('Mensaje que WhatsApp no deja ver') || ultimo.includes('que la app no muestra')) {
    return { icono: 'celular', texto: 'Mensaje para ver en el celular' }
  }
  return { icono: null, texto: ultimo }
}
