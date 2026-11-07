import { describe, expect, it, vi } from 'vitest'
import { armarConsulta, armarFiltro, atenderRpc, claveValida, llamarHerramienta, rangoFechas, TABLAS_PERMITIDAS, type AccesoDb, type FilaDb } from './mcpRight'

const dbVacia = (): AccesoDb & { leer: ReturnType<typeof vi.fn> } => ({ leer: vi.fn(async () => ({ filas: [] as FilaDb[], total: 0 })) })

describe('tablas permitidas', () => {
  it('deja afuera las que guardan secretos', () => {
    for (const t of ['app_settings', 'app_lock', 'gmail_integration', 'gmail_oauth_pending', 'push_subscriptions', 'dispositivos_habilitados', 'projects']) {
      expect(TABLAS_PERMITIDAS.has(t)).toBe(false)
    }
  })
  it('incluye las de cada pestaña', () => {
    for (const t of ['ventas', 'modelos', 'caja_dias', 'tn_ordenes', 'wsp_mensajes', 'crm_ventas', 'stock_ba_modelos']) {
      expect(TABLAS_PERMITIDAS.has(t)).toBe(true)
    }
  })
})

describe('armarConsulta', () => {
  it('arma la consulta con filtros, orden y límite', () => {
    const q = armarConsulta({ tabla: 'ventas', columnas: ['fecha', 'precio_venta'], filtros: [{ columna: 'medio_pago', op: 'eq', valor: 'efectivo' }], orden: 'fecha.desc', limite: 10 })
    expect(q.path).toBe('ventas?select=fecha,precio_venta&medio_pago=eq.efectivo&order=fecha.desc&limit=10')
  })
  it('rechaza tablas fuera de la lista (PIN, tokens de Gmail)', () => {
    expect(() => armarConsulta({ tabla: 'app_settings' })).toThrow(/no disponible/)
    expect(() => armarConsulta({ tabla: 'gmail_integration' })).toThrow(/no disponible/)
    expect(() => armarConsulta({ tabla: 'ventas?select=*&x=' })).toThrow(/no disponible/)
  })
  it('rechaza columnas con intentos de meter otros parámetros o embeds', () => {
    expect(() => armarConsulta({ tabla: 'ventas', columnas: ['id,app_settings(owner_pin)'] })).toThrow(/inválida/)
    expect(() => armarConsulta({ tabla: 'ventas', columnas: 'id&limit=9999' })).toThrow(/inválida/)
    expect(() => armarConsulta({ tabla: 'ventas', filtros: [{ columna: 'id=eq.1&select', op: 'eq', valor: 1 }] })).toThrow(/inválida/)
    expect(() => armarConsulta({ tabla: 'ventas', orden: 'fecha;drop' })).toThrow(/orden/)
  })
  it('codifica los valores: no se cuelan parámetros', () => {
    const q = armarConsulta({ tabla: 'modelos', filtros: [{ columna: 'marca', op: 'eq', valor: 'nike&select=owner_pin' }] })
    expect(q.path).toContain('marca=eq.nike%26select%3Downer_pin')
    expect(q.path.match(/select=/g)).toHaveLength(1)
  })
  it('limita las filas a 200', () => {
    expect(armarConsulta({ tabla: 'ventas', limite: 99999 }).limite).toBe(200)
    expect(armarConsulta({ tabla: 'ventas' }).limite).toBe(50)
  })
  it('rechaza operadores desconocidos y demasiados filtros', () => {
    expect(() => armarFiltro({ columna: 'id', op: 'fts', valor: 'x' })).toThrow(/Operador/)
    expect(() => armarConsulta({ tabla: 'ventas', filtros: Array(13).fill({ columna: 'id', op: 'eq', valor: 1 }) })).toThrow(/12/)
  })
  it('in e is', () => {
    expect(armarFiltro({ columna: 'talle_arg', op: 'in', valor: ['40', '41'] })).toBe('talle_arg=in.(%2240%22%2C%2241%22)')
    expect(armarFiltro({ columna: 'hora_salida', op: 'is', valor: 'null' })).toBe('hora_salida=is.null')
    expect(() => armarFiltro({ columna: 'x', op: 'is', valor: 'algo' })).toThrow(/null/)
  })
  it('ilike sin comodín busca "contiene"', () => {
    expect(armarFiltro({ columna: 'marca', op: 'ilike', valor: 'nike' })).toBe('marca=ilike.*nike*')
  })
})

describe('rangoFechas', () => {
  it('usa hora argentina y el día final inclusive', () => {
    const r = rangoFechas('2026-11-01', '2026-11-30')
    expect(r.gte).toBe('2026-11-01T00:00:00-03:00')
    expect(r.lt).toBe('2026-12-01T00:00:00-03:00')
  })
  it('rechaza fechas mal escritas o invertidas', () => {
    expect(() => rangoFechas('01/11/2026', '2026-11-30')).toThrow(/AAAA-MM-DD/)
    expect(() => rangoFechas('2026-11-30', '2026-11-01')).toThrow(/posterior/)
  })
})

describe('claveValida', () => {
  const clave = 'a'.repeat(40)
  it('acepta la clave correcta y rechaza el resto', () => {
    expect(claveValida(clave, clave)).toBe(true)
    expect(claveValida(clave, `${'b'.repeat(40)},${clave}`)).toBe(true)
    expect(claveValida('b'.repeat(40), clave)).toBe(false)
    expect(claveValida(null, clave)).toBe(false)
    expect(claveValida(clave, undefined)).toBe(false)
  })
  it('una clave corta configurada no vale (evita dejarla débil)', () => {
    expect(claveValida('1234', '1234')).toBe(false)
  })
})

describe('protocolo MCP', () => {
  it('initialize devuelve capacidades de herramientas', async () => {
    const r = await atenderRpc(dbVacia(), { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    expect(r?.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} } })
  })
  it('las notificaciones no se responden', async () => {
    expect(await atenderRpc(dbVacia(), { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })
  it('tools/list expone solo herramientas de lectura', async () => {
    const r = await atenderRpc(dbVacia(), { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const nombres = (r?.result as { tools: { name: string }[] }).tools.map(t => t.name)
    expect(nombres).toEqual(expect.arrayContaining(['listar_tablas', 'consultar', 'resumen_ventas', 'stock_actual', 'resumen_crm']))
    expect(nombres.some(n => /^(insert|update|delete|borrar|crear|escribir|modificar|editar)/i.test(n))).toBe(false)
  })
  it('un error de herramienta vuelve como isError, sin filtrar detalles internos', async () => {
    const db = { leer: vi.fn(async () => { throw new Error('Supabase 500 con detalle secreto') }) }
    const r = await atenderRpc(db, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'consultar', arguments: { tabla: 'ventas' } } })
    const res = r?.result as { isError: boolean; content: { text: string }[] }
    expect(res.isError).toBe(true)
    expect(res.content[0].text).not.toContain('secreto')
  })
  it('método desconocido da error', async () => {
    const r = await atenderRpc(dbVacia(), { jsonrpc: '2.0', id: 4, method: 'resources/list' })
    expect(r?.error?.code).toBe(-32601)
  })
})

describe('herramientas', () => {
  it('solo hace lecturas a la tabla pedida', async () => {
    const db = dbVacia()
    await llamarHerramienta(db, 'consultar', { tabla: 'caja_dias', orden: 'fecha.desc', limite: 5 })
    expect(db.leer).toHaveBeenCalledWith('caja_dias?select=*&order=fecha.desc&limit=5', { contar: true })
  })
  it('resumen_ventas cuenta tickets por venta_grupo_id y agrupa por día en hora argentina', async () => {
    const filas: FilaDb[] = [
      { modelo_id: 'm1', fecha: '2026-11-02T01:30:00Z', precio_venta: 100, medio_pago: 'efectivo', ganancia: 40, venta_grupo_id: 'g1' }, // 1/11 22:30 AR
      { modelo_id: 'm2', fecha: '2026-11-02T01:30:00Z', precio_venta: 50, medio_pago: 'efectivo', ganancia: 10, venta_grupo_id: 'g1' },
      { modelo_id: 'm1', fecha: '2026-11-03T15:00:00Z', precio_venta: 200, medio_pago: 'tarjeta', ganancia: 80, venta_grupo_id: 'g2' },
    ]
    const db: AccesoDb = { leer: vi.fn(async () => ({ filas, total: 3 })) }
    const r = (await llamarHerramienta(db, 'resumen_ventas', { desde: '2026-11-01', hasta: '2026-11-30' })) as {
      total: Record<string, number>; por_dia: { dia: string; tickets: number; facturado: number }[]
    }
    expect(r.total).toEqual({ tickets: 2, prendas: 3, facturado: 350, ganancia: 130 })
    expect(r.por_dia).toEqual([
      { dia: '2026-11-01', tickets: 1, prendas: 2, facturado: 150, ganancia: 50 },
      { dia: '2026-11-03', tickets: 1, prendas: 1, facturado: 200, ganancia: 80 },
    ])
  })
  it('stock_actual filtra los talles bajo el mínimo', async () => {
    const filas: FilaDb[] = [{
      marca: 'Nike', modelo: 'Phantom', gama: 'alta', codigo_base: 'NP1', precio_venta: 1, precio_efectivo: 1,
      modelo_talles: [
        { talle_arg: '40', cantidad: 0, cantidad_local: 0, cantidad_ba: 0, stock_minimo: 1 },
        { talle_arg: '41', cantidad: 5, cantidad_local: 5, cantidad_ba: 0, stock_minimo: 1 },
      ],
    }]
    const db: AccesoDb = { leer: vi.fn(async () => ({ filas, total: 1 })) }
    const r = (await llamarHerramienta(db, 'stock_actual', { solo_bajo_minimo: true })) as { resultado: { talles: { talle: string }[] }[] }
    expect(r.resultado[0].talles.map(t => t.talle)).toEqual(['40'])
  })
  it('stock_actual limpia el texto de búsqueda', async () => {
    const db = dbVacia()
    await llamarHerramienta(db, 'stock_actual', { buscar: 'nike),select=owner_pin' })
    const path = String(db.leer.mock.calls[0][0])
    expect(path).not.toContain('owner_pin),')
    expect(path).toContain('or=(marca.ilike.')
  })
})
