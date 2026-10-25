import { describe, expect, it } from 'vitest'
import {
  bucketsDeRespuesta, calcularStats, diasDelRango, diaSemana, enArgentina, mediana, tiemposDeRespuesta,
  type DatosStats, type MsgRaw,
} from './crmStatsCalc'

// 2026-10-21 es miércoles. Las horas de abajo son UTC; en Argentina son 3 menos.
const m = (direccion: 'in' | 'out', iso: string, chat = 'c1', extra: Partial<MsgRaw> = {}): MsgRaw =>
  ({ direccion, tipo: 'text', timestamp: iso, conversacion_id: chat, ...extra })

const vacio: DatosStats = {
  inicio: '2026-10-19', fin: '2026-10-21', mensajes: [], conversaciones: [], sugerencias: [], fotos: [],
  aprendizajes: [], etiquetas: [], asignaciones: [], ahora: new Date('2026-10-21T20:00:00Z').getTime(),
}

describe('helpers', () => {
  it('mediana', () => {
    expect(mediana([])).toBe(0)
    expect(mediana([5, 1, 3])).toBe(3)
    expect(mediana([1, 2, 3, 10])).toBe(2.5)
  })
  it('hora y día en Argentina (no UTC)', () => {
    const a = enArgentina('2026-10-22T01:30:00Z') // 22:30 del miércoles 21 en Argentina
    expect(a.getUTCHours()).toBe(22)
    expect(diaSemana(a)).toBe(2) // miércoles
  })
  it('días del rango, ambos incluidos', () => {
    expect(diasDelRango('2026-10-19', '2026-10-21')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
  })
})

describe('tiempo de respuesta', () => {
  it('cuenta desde el primer mensaje sin contestar hasta la primera respuesta', () => {
    const t = tiemposDeRespuesta([
      m('in', '2026-10-21T15:00:00Z'), m('in', '2026-10-21T15:04:00Z'), m('out', '2026-10-21T15:10:00Z'), m('out', '2026-10-21T15:11:00Z'),
    ])
    expect(t).toEqual([10])
  })
  it('ignora automáticos y esperas de más de 48 hs', () => {
    expect(tiemposDeRespuesta([m('in', '2026-10-21T15:00:00Z'), m('out', '2026-10-21T15:01:00Z', 'c1', { automatico: 'bienvenida' })])).toEqual([])
    expect(tiemposDeRespuesta([m('in', '2026-10-15T15:00:00Z'), m('out', '2026-10-21T15:00:00Z')])).toEqual([])
  })
  it('lo que escribe Right primero no cuenta', () => {
    expect(tiemposDeRespuesta([m('out', '2026-10-21T15:00:00Z'), m('in', '2026-10-21T15:05:00Z'), m('out', '2026-10-21T15:07:00Z')])).toEqual([2])
  })
  it('buckets', () => {
    expect(bucketsDeRespuesta([1, 4, 20, 50, 100, 600]).map(b => b.cantidad)).toEqual([2, 1, 1, 1, 1])
  })
})

describe('calcularStats', () => {
  it('cuenta TODOS los mensajes (no se corta en 1000) y separa recibidos y enviados', () => {
    const mensajes: MsgRaw[] = []
    for (let i = 0; i < 1500; i++) mensajes.push(m(i % 3 === 0 ? 'out' : 'in', '2026-10-20T15:00:00Z', `c${i % 7}`))
    const s = calcularStats({ ...vacio, mensajes })
    expect(s.totales.mensajes).toBe(1500)
    expect(s.totales.recibidos + s.totales.enviados).toBe(1500)
    expect(s.totales.chatsConActividad).toBe(7)
  })
  it('mensajes por día incluye los días sin mensajes', () => {
    const s = calcularStats({ ...vacio, mensajes: [m('in', '2026-10-21T15:00:00Z')] })
    expect(s.mensajesPorDia.map(d => d.recibidos)).toEqual([0, 0, 1])
  })
  it('el gráfico arranca en el primer día con mensajes, no en el inicio del rango', () => {
    const s = calcularStats({ ...vacio, inicio: '2020-01-01', mensajes: [m('in', '2026-10-20T15:00:00Z')] })
    expect(s.mensajesPorDia.map(d => d.fecha)).toEqual(['2026-10-20', '2026-10-21'])
  })
  it('mapa de calor y mejor momento en hora de Argentina', () => {
    const s = calcularStats({ ...vacio, mensajes: [m('in', '2026-10-21T19:10:00Z'), m('in', '2026-10-21T19:50:00Z'), m('in', '2026-10-20T13:00:00Z')] })
    expect(s.heatmap[2][16]).toBe(2) // miércoles 16 hs
    expect(s.mejorMomento).toEqual({ dia: 'Miércoles', hora: 16, cantidad: 2 })
  })
  it('sin leer ahora, sin contar spam', () => {
    const base = { estado: 'Sin leer', created_at: '2026-10-01T00:00:00Z' }
    const s = calcularStats({
      ...vacio,
      conversaciones: [
        { id: 'a', categoria: 'Normal', no_leidos: 2, ultimo_mensaje_at: '2026-10-21T10:00:00Z', ...base },
        { id: 'b', categoria: 'Spam', no_leidos: 1, ultimo_mensaje_at: '2026-10-01T10:00:00Z', ...base },
        { id: 'c', categoria: 'Normal', no_leidos: 0, ultimo_mensaje_at: '2026-10-21T10:00:00Z', ...base },
      ],
    })
    expect(s.sinLeer).toEqual({ cantidad: 1, masViejaHoras: 10 })
  })
  it('embudo y conversión', () => {
    const conv = (id: string, estado: string) => ({ id, categoria: 'Normal', estado, created_at: '2026-10-20T15:00:00Z', no_leidos: 0, ultimo_mensaje_at: null })
    const s = calcularStats({
      ...vacio,
      conversaciones: [conv('a', 'Venta concretada'), conv('b', 'Respondido'), conv('c', 'Sin leer')],
      mensajes: [m('in', '2026-10-20T15:00:00Z', 'a'), m('out', '2026-10-20T15:05:00Z', 'a'), m('in', '2026-10-20T15:00:00Z', 'b'), m('in', '2026-10-20T15:00:00Z', 'c')],
      fotos: [{ conversacion_id: 'a', modelo_id: 'm1', modelos: { marca: 'Nike', modelo: 'Tiempo' } }],
    })
    expect(s.embudo.map(e => e.cantidad)).toEqual([3, 1, 1, 1])
    expect(s.conversion).toEqual({ chatsNuevos: 3, concretadas: 1, porcentaje: 33, monto: 0, conMonto: 0, porBot: 0, pedidosWeb: 0, montoWeb: 0 })
    // Con la tabla de ventas: cuenta cada venta del período (aunque el chat ya no esté en "Venta concretada").
    const conVentas = calcularStats({
      ...vacio,
      conversaciones: [conv('a', 'Sin leer'), conv('b', 'Respondido')],
      mensajes: [m('in', '2026-10-20T15:00:00Z', 'a'), m('in', '2026-10-20T15:00:00Z', 'b')],
      ventas: [
        { conversacion_id: 'a', detectada_at: '2026-10-20T16:00:00Z', monto: 85000, atendio: 'bot' },
        { conversacion_id: 'b', detectada_at: '2026-10-20T17:00:00Z', monto: null, atendio: 'humano' },
        { conversacion_id: 'b', detectada_at: '2026-10-20T18:00:00Z', monto: 120000, atendio: 'humano', tipo: 'web' },
      ],
    })
    expect(conVentas.conversion).toMatchObject({ concretadas: 2, porcentaje: 100, monto: 85000, conMonto: 1, porBot: 1, pedidosWeb: 1, montoWeb: 120000 })
    expect(s.productosMasConsultados[0]).toMatchObject({ marca: 'Nike', consultas: 1 })
  })
  it('talles: cada chat cuenta una sola vez por talle', () => {
    const s = calcularStats({
      ...vacio,
      sugerencias: [
        { conversacion_id: 'a', intencion: 'pedido_talle', talle_detectado: 42, tipo_detectado: 'F11' },
        { conversacion_id: 'a', intencion: 'pedido_talle', talle_detectado: 42, tipo_detectado: 'F11' },
        { conversacion_id: 'b', intencion: 'pedido_talle', talle_detectado: 42, tipo_detectado: 'F5' },
        { conversacion_id: 'b', intencion: 'otro', talle_detectado: 40, tipo_detectado: null },
      ],
    })
    expect(s.talles).toEqual([{ talle: 42, chats: 2 }, { talle: 40, chats: 1 }])
    expect(s.tiposBotin).toEqual([{ tipo: 'F11', chats: 1 }, { tipo: 'F5', chats: 1 }])
    expect(s.intenciones[s.intenciones.length - 1].intencion).toBe('otro')
  })
})
