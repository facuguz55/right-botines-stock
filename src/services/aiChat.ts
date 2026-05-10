import { fetchModelos, updateModelo, addIngreso } from './modelos'
import { fetchVentas } from './ventas'

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM = `Sos el asistente de gestion de Right Botines, una zapateria deportiva argentina.
Vendemos botines de futbol F5, F11, Futsal y Hockey de marcas como Nike, Adidas, Puma, New Balance, Mizuno, Umbro, Under Armour, Joma.
Precios en pesos argentinos (ARS). Talles en sistema ARG del 34 al 44.
Ejecuta las herramientas directamente sin pedir confirmacion. Cuando el usuario pida agregar stock, busca primero el modelo para obtener los IDs correctos.
Responde en espanol, conciso y directo. Usa $ para montos. No uses markdown.`

const TOOLS = [
  {
    name: 'listar_stock',
    description: 'Lista todos los modelos con su stock por talle. Retorna IDs para otras operaciones.',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] }
  },
  {
    name: 'buscar_modelo',
    description: 'Busca modelos por nombre, marca o codigo. Retorna IDs para agregar stock o cambiar precios.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },
  {
    name: 'agregar_stock',
    description: 'Agrega pares a un talle de un modelo. Usa buscar_modelo primero para obtener los IDs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        modelo_id: { type: 'string' },
        talle_id: { type: 'string', description: 'ID del talle si ya existe' },
        talle_arg: { type: 'number' },
        talle_us: { type: 'number' },
        cantidad_actual: { type: 'number', description: '0 si es talle nuevo' },
        cantidad_agregar: { type: 'number' },
        costo_total: { type: 'number', description: '0 si no se informa' }
      },
      required: ['modelo_id', 'talle_arg', 'talle_us', 'cantidad_actual', 'cantidad_agregar']
    }
  },
  {
    name: 'actualizar_precio',
    description: 'Actualiza precio de venta y/o costo de un modelo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        modelo_id: { type: 'string' },
        precio_venta: { type: 'number' },
        precio_costo: { type: 'number' }
      },
      required: ['modelo_id']
    }
  },
  {
    name: 'ver_ventas',
    description: 'Muestra ventas recientes con totales.',
    input_schema: {
      type: 'object' as const,
      properties: { dias: { type: 'number' } },
      required: [] as string[]
    }
  }
]

export const TOOL_LABELS: Record<string, string> = {
  listar_stock: 'Consultando stock...',
  buscar_modelo: 'Buscando modelo...',
  agregar_stock: 'Agregando stock...',
  actualizar_precio: 'Actualizando precio...',
  ver_ventas: 'Consultando ventas...',
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

const DATA_MUTATING = new Set(['agregar_stock', 'actualizar_precio'])

async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'listar_stock': {
      const modelos = await fetchModelos()
      return JSON.stringify(modelos.map(m => ({
        id: m.id, marca: m.marca, modelo: m.modelo, categoria: m.categoria,
        precio_venta: m.precio_venta, precio_costo: m.precio_costo,
        talles: m.modelo_talles.map(t => ({ id: t.id, talle_arg: t.talle_arg, talle_us: t.talle_us, cantidad: t.cantidad }))
      })))
    }
    case 'buscar_modelo': {
      const modelos = await fetchModelos()
      const q = String(input.query).toLowerCase()
      const found = modelos.filter(m =>
        m.modelo.toLowerCase().includes(q) || m.marca.toLowerCase().includes(q) || m.codigo_base.toLowerCase().includes(q)
      )
      if (!found.length) return 'No se encontraron modelos con esa busqueda.'
      return JSON.stringify(found.map(m => ({
        id: m.id, marca: m.marca, modelo: m.modelo,
        precio_venta: m.precio_venta, precio_costo: m.precio_costo,
        talles: m.modelo_talles.map(t => ({ id: t.id, talle_arg: t.talle_arg, talle_us: t.talle_us, cantidad: t.cantidad }))
      })))
    }
    case 'agregar_stock': {
      await addIngreso(input.modelo_id, input.talle_arg, input.talle_us, input.cantidad_actual, input.cantidad_agregar, input.costo_total ?? 0, input.talle_id)
      return `Stock actualizado: +${input.cantidad_agregar} par${input.cantidad_agregar !== 1 ? 'es' : ''} al talle ARG ${input.talle_arg}`
    }
    case 'actualizar_precio': {
      const updates: Partial<{ precio_venta: number; precio_costo: number }> = {}
      if (input.precio_venta !== undefined) updates.precio_venta = input.precio_venta
      if (input.precio_costo !== undefined) updates.precio_costo = input.precio_costo
      await updateModelo(input.modelo_id, updates)
      return 'Precio actualizado correctamente'
    }
    case 'ver_ventas': {
      const dias = Number(input.dias ?? 7)
      const start = new Date()
      start.setDate(start.getDate() - dias)
      const ventas = await fetchVentas(start.toISOString().split('T')[0])
      return JSON.stringify({
        periodo: `Ultimos ${dias} dias`,
        cantidad_ventas: ventas.length,
        total_facturado: ventas.reduce((s, v) => s + v.precio_venta, 0),
        ganancia_total: ventas.reduce((s, v) => s + v.ganancia, 0),
        ventas: ventas.slice(0, 20).map(v => ({
          fecha: v.fecha?.split('T')[0], modelo: v.modelos?.modelo, marca: v.modelos?.marca,
          talle_arg: v.talle_arg, precio: v.precio_venta, medio_pago: v.medio_pago, ganancia: v.ganancia
        }))
      })
    }
    default: return `Herramienta desconocida: ${name}`
  }
}

export async function sendMessage(
  history: ChatMessage[],
  userText: string,
  onToolCall?: (name: string) => void
): Promise<{ response: string; newApiMessages: ChatMessage[]; dataChanged: boolean }> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  let dataChanged = false
  const messages: ChatMessage[] = [...history, { role: 'user', content: userText }]

  while (true) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools: TOOLS, messages }),
    })

    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)

    const data = await res.json()
    const assistantContent: ContentBlock[] = data.content
    messages.push({ role: 'assistant', content: assistantContent })

    if (data.stop_reason === 'end_turn') {
      const tb = assistantContent.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
      return { response: tb?.text ?? '(sin respuesta)', newApiMessages: messages, dataChanged }
    }

    if (data.stop_reason === 'tool_use') {
      const toolResults: ContentBlock[] = []
      for (const block of assistantContent) {
        if (block.type !== 'tool_use') continue
        onToolCall?.(block.name)
        if (DATA_MUTATING.has(block.name)) dataChanged = true
        try {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: await executeTool(block.name, block.input) })
        } catch (err: any) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${err.message}` })
        }
      }
      messages.push({ role: 'user', content: toolResults })
    }
  }
}
