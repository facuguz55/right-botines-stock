// Conector MCP de SOLO LECTURA para que el Claude del dueño (Benja) vea todo el
// dashboard de Right Botines Stock. La lógica va acá (pura, con tests); el
// endpoint es api/mcp.ts. Habla MCP "streamable HTTP" sin sesión: cada pedido
// es un JSON-RPC suelto.
//
// Seguridad:
// - Solo se hacen GET contra la REST de Supabase: no hay forma de escribir.
// - Lista blanca de tablas. Quedan afuera las que guardan secretos: PIN del
//   dueño y del creador (app_settings, app_lock), tokens de Gmail
//   (gmail_integration, gmail_oauth_pending), suscripciones push y los
//   dispositivos habilitados.
// - Nombres de columnas, operadores y orden se validan; los valores se
//   codifican, no se pegan crudos en la URL.

export type FilaDb = Record<string, unknown>

export interface AccesoDb {
  /** GET a PostgREST. `path` ya viene armado y codificado, ej. "ventas?select=*&limit=5". */
  leer: (path: string, opciones?: { contar?: boolean }) => Promise<{ filas: FilaDb[]; total: number | null }>
}

export const TABLAS: Record<string, string> = {
  // Vender / stock
  ventas: 'Ventas del local, una fila por prenda (venta_grupo_id agrupa un mismo ticket). fecha, precio, medio de pago, ganancia, empleado.',
  modelos: 'Catálogo de botines: marca, modelo, gama, precios de costo y venta, medidas del paquete, id en TiendaNube.',
  modelo_talles: 'Stock por talle de cada modelo (cantidad total, cantidad_local, cantidad_ba, stock_minimo).',
  modelo_fotos: 'Fotos de cada modelo.',
  ingresos: 'Ingresos de mercadería al stock (modelo, talle, cantidad, costo).',
  historial_precios: 'Cambios de precio de venta por modelo.',
  devoluciones_cambios: 'Devoluciones, cambios y garantías (con diferencia de dinero y si volvió al stock).',
  devoluciones_cambios_fallos: 'Devoluciones/cambios que fallaron al registrarse.',
  clientes_locales: 'Clientes del local físico (nombre, teléfono, DNI, email).',
  // Stock Buenos Aires
  stock_ba_modelos: 'Stock Bs As: modelos que se traen de Buenos Aires (código, descripción, costo, precio).',
  stock_ba_talles: 'Stock Bs As: cantidad por talle.',
  stock_ba_movimientos: 'Stock Bs As: movimientos de entrada/salida (delta, motivo).',
  stock_ba_pedidos: 'Stock Bs As: pedidos al proveedor (número, fecha, unidades, total).',
  // Caja y equipo
  caja_dias: 'Caja diaria: apertura, cierre contado, esperado, diferencia, quién abrió y cerró.',
  caja_gastos: 'Gastos sacados de la caja de cada día.',
  caja_verificaciones: 'Controles de caja a mitad del día (declarado vs esperado).',
  empleados: 'Empleados.',
  fichajes: 'Entradas y salidas de los empleados.',
  valores_hora: 'Valor por hora de cada empleado (con vigencia).',
  configuracion_fichajes: 'Reglas de fichaje (hora de cierre, horas máximas por turno).',
  configuracion_ventas: 'Configuración de ventas (descuento por transferencia).',
  recargos_tarjeta: 'Recargos por tarjeta y cuotas.',
  precio_tiers_tarjeta: 'Precios de tarjeta vs efectivo por escalón.',
  // Compras, costos, rentabilidad
  proveedores: 'Proveedores.',
  compras: 'Compras a proveedores (remito, total).',
  compra_items: 'Ítems de cada compra.',
  compra_pagos: 'Pagos hechos a proveedores por cada compra.',
  costos_config: 'Costos fijos y variables configurados (alquiler, sueldos, comisiones, etc.).',
  costos_unicos: 'Costos únicos puntuales.',
  // Tienda online (TiendaNube)
  tn_ordenes: 'Órdenes de la tienda online (estado, pago, envío, total, cliente, productos, preparada).',
  tn_clientes: 'Clientes de la tienda online (gasto total, cantidad de órdenes).',
  tn_cupones: 'Cupones de la tienda online.',
  conversiones: 'Conversiones por mail/carrito abandonado (orden, total, campaña).',
  clicks_tracking: 'Clicks en mails hacia el checkout.',
  emails_enviados: 'Mails de recuperación enviados.',
  carritos_config: 'Configuración de los mails de carritos.',
  web_eventos: 'Eventos de navegación de la tienda web (visitas, productos vistos, utm, dispositivo, ciudad). Tabla enorme: filtrar siempre por fecha.',
  logistica_acciones: 'Acciones de logística sobre órdenes (despachos, rótulos).',
  logistica_rotulos: 'Rótulos de envío generados.',
  logistica_rotulos_pedidos: 'Pedidos incluidos en cada rótulo (con seguimiento).',
  // CRM de WhatsApp
  wsp_conversaciones: 'Chats de WhatsApp (contacto, categoría, estado, asignado, no leídos, última actividad, búsqueda de talle/modelo, venta detectada).',
  wsp_mensajes: 'Mensajes de WhatsApp (dirección, tipo, contenido, transcripción de audios, estado de entrega). Tabla grande: filtrar por conversacion_id o fecha.',
  wsp_etiquetas: 'Etiquetas del CRM.',
  wsp_conversacion_etiquetas: 'Qué etiqueta tiene cada chat.',
  wsp_reclasificaciones: 'Cambios de categoría de chats.',
  wsp_ia_sugerencias: 'Sugerencias del bot para cada mensaje (intención, respuesta sugerida, si se usó).',
  wsp_envios_fotos: 'Fotos de botines enviadas por chat.',
  crm_clientes: 'Clientes del CRM (nombre, teléfono, DNI, notas).',
  crm_ventas: 'Ventas concretadas por WhatsApp (monto, tipo, quién cerró: bot o persona).',
  crm_aprendizajes: 'Lo que el bot aprendió: pregunta, respuesta del bot, respuesta humana, estado.',
  crm_mensajes_auto: 'Mensajes automáticos del CRM (saludo, fuera de horario, etc.).',
  crm_estado_ia: 'Estado de la IA del CRM (último error).',
  intentos_acceso_fallidos: 'Intentos fallidos de PIN en la app.',
}

export const TABLAS_PERMITIDAS = new Set(Object.keys(TABLAS))

const COLUMNA = /^[a-z_][a-z0-9_]{0,62}$/
const ORDEN = /^[a-z_][a-z0-9_]{0,62}(\.(asc|desc))?$/
const OPERADORES = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'])

export const LIMITE_DEFECTO = 50
export const LIMITE_MAX = 200
const TOPE_FILAS_RESUMEN = 20000
const TOPE_RESPUESTA = 60000
const HUSO = '-03:00'

class ErrorHerramienta extends Error {}

// ───────────────────────── armado de consultas ─────────────────────────

export interface Filtro {
  columna: string
  op: string
  valor?: unknown
}

function valorIn(v: unknown): string {
  const lista = Array.isArray(v) ? v : String(v).split(',')
  if (lista.length === 0 || lista.length > 200) throw new ErrorHerramienta('"in" necesita entre 1 y 200 valores')
  return `(${lista.map(x => `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`
}

export function armarFiltro(f: Filtro): string {
  if (!f || typeof f.columna !== 'string' || !COLUMNA.test(f.columna)) throw new ErrorHerramienta(`Columna inválida: ${String(f?.columna)}`)
  if (!OPERADORES.has(f.op)) throw new ErrorHerramienta(`Operador inválido: ${String(f.op)}. Usá: ${[...OPERADORES].join(', ')}`)
  let valor: string
  if (f.op === 'in') valor = valorIn(f.valor)
  else if (f.op === 'is') {
    const v = String(f.valor).toLowerCase()
    if (!['null', 'true', 'false'].includes(v)) throw new ErrorHerramienta('"is" acepta null, true o false')
    valor = v
  } else {
    if (f.valor === undefined || f.valor === null || typeof f.valor === 'object') throw new ErrorHerramienta(`Falta el valor del filtro sobre ${f.columna}`)
    valor = String(f.valor)
    if ((f.op === 'like' || f.op === 'ilike') && !valor.includes('*') && !valor.includes('%')) valor = `*${valor}*`
    valor = valor.replace(/%/g, '*')
  }
  return `${encodeURIComponent(f.columna)}=${f.op}.${encodeURIComponent(valor)}`
}

export interface ConsultaArgs {
  tabla?: unknown
  columnas?: unknown
  filtros?: unknown
  orden?: unknown
  limite?: unknown
  desde?: unknown
}

export function armarConsulta(a: ConsultaArgs): { path: string; tabla: string; limite: number } {
  const tabla = String(a.tabla ?? '')
  if (!TABLAS_PERMITIDAS.has(tabla)) throw new ErrorHerramienta(`Tabla no disponible: "${tabla}". Usá listar_tablas para ver las que hay.`)

  const partes: string[] = []
  let cols = '*'
  if (a.columnas !== undefined && a.columnas !== null && a.columnas !== '') {
    const lista = Array.isArray(a.columnas) ? a.columnas : String(a.columnas).split(',')
    const limpias = lista.map(c => String(c).trim()).filter(Boolean)
    for (const c of limpias) if (!COLUMNA.test(c)) throw new ErrorHerramienta(`Columna inválida: ${c}`)
    if (limpias.length) cols = limpias.join(',')
  }
  partes.push(`select=${cols}`)

  if (a.filtros !== undefined && a.filtros !== null) {
    if (!Array.isArray(a.filtros)) throw new ErrorHerramienta('"filtros" tiene que ser una lista de {columna, op, valor}')
    if (a.filtros.length > 12) throw new ErrorHerramienta('Máximo 12 filtros')
    for (const f of a.filtros) partes.push(armarFiltro(f as Filtro))
  }

  if (a.orden !== undefined && a.orden !== null && a.orden !== '') {
    const o = String(a.orden).trim()
    if (!ORDEN.test(o)) throw new ErrorHerramienta('"orden" tiene que ser columna o columna.desc / columna.asc')
    partes.push(`order=${o}`)
  }

  const n = a.limite === undefined || a.limite === null ? LIMITE_DEFECTO : Number(a.limite)
  if (!Number.isFinite(n) || n < 1) throw new ErrorHerramienta('"limite" tiene que ser un número mayor a 0')
  const limite = Math.min(Math.floor(n), LIMITE_MAX)
  partes.push(`limit=${limite}`)

  if (a.desde !== undefined && a.desde !== null) {
    const d = Math.floor(Number(a.desde))
    if (!Number.isFinite(d) || d < 0) throw new ErrorHerramienta('"desde" tiene que ser un número (cantidad de filas a saltear)')
    if (d > 0) partes.push(`offset=${d}`)
  }
  return { path: `${tabla}?${partes.join('&')}`, tabla, limite }
}

// ───────────────────────── fechas ─────────────────────────

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function hoyAr(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

/** Rango [desde, hasta] inclusive en hora argentina; por defecto, el mes en curso. */
export function rangoFechas(desde?: unknown, hasta?: unknown): { desde: string; hasta: string; gte: string; lt: string } {
  const hoy = hoyAr()
  const d = desde ? String(desde) : `${hoy.slice(0, 7)}-01`
  const h = hasta ? String(hasta) : hoy
  if (!FECHA.test(d) || !FECHA.test(h)) throw new ErrorHerramienta('Las fechas van como AAAA-MM-DD')
  if (d > h) throw new ErrorHerramienta('"desde" no puede ser posterior a "hasta"')
  return { desde: d, hasta: h, gte: `${d}T00:00:00${HUSO}`, lt: `${sumarDias(h, 1)}T00:00:00${HUSO}` }
}

function diaAr(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

async function leerTodo(db: AccesoDb, base: string): Promise<FilaDb[]> {
  const filas: FilaDb[] = []
  for (let off = 0; off < TOPE_FILAS_RESUMEN; off += 1000) {
    const r = await db.leer(`${base}&limit=1000&offset=${off}`)
    filas.push(...r.filas)
    if (r.filas.length < 1000) return filas
  }
  throw new ErrorHerramienta(`El período tiene más de ${TOPE_FILAS_RESUMEN} filas: acotá las fechas.`)
}

// ───────────────────────── herramientas ─────────────────────────

const esquemaFechas = {
  desde: { type: 'string', description: 'Fecha inicial AAAA-MM-DD (hora Argentina). Por defecto: primer día del mes en curso.' },
  hasta: { type: 'string', description: 'Fecha final AAAA-MM-DD, inclusive. Por defecto: hoy.' },
}

export const HERRAMIENTAS = [
  {
    name: 'listar_tablas',
    description: 'Lista todas las tablas del dashboard de Right Botines Stock (ventas, stock, caja, empleados, tienda online, CRM de WhatsApp, etc.) con qué guarda cada una. Empezá por acá.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'describir_tabla',
    description: 'Muestra las columnas de una tabla, cuántas filas tiene y una fila de ejemplo.',
    inputSchema: { type: 'object', properties: { tabla: { type: 'string' } }, required: ['tabla'], additionalProperties: false },
  },
  {
    name: 'consultar',
    description: 'Trae filas de cualquier tabla (solo lectura). Filtros: lista de {columna, op, valor} con op = eq, neq, gt, gte, lt, lte, like, ilike, is (null/true/false) o in. Las fechas son timestamptz: usá por ejemplo gte "2026-11-01T00:00:00-03:00". Devuelve hasta 200 filas por llamada; usá "desde" para paginar.',
    inputSchema: {
      type: 'object',
      properties: {
        tabla: { type: 'string' },
        columnas: { type: 'array', items: { type: 'string' }, description: 'Columnas a traer. Por defecto todas.' },
        filtros: {
          type: 'array',
          items: {
            type: 'object',
            properties: { columna: { type: 'string' }, op: { type: 'string', enum: [...OPERADORES] }, valor: {} },
            required: ['columna', 'op'],
          },
        },
        orden: { type: 'string', description: 'Ej: "fecha.desc"' },
        limite: { type: 'integer', description: `Máximo ${LIMITE_MAX}. Por defecto ${LIMITE_DEFECTO}.` },
        desde: { type: 'integer', description: 'Filas a saltear (para paginar).' },
      },
      required: ['tabla'],
      additionalProperties: false,
    },
  },
  {
    name: 'contar',
    description: 'Cuenta filas de una tabla con los mismos filtros que "consultar".',
    inputSchema: {
      type: 'object',
      properties: {
        tabla: { type: 'string' },
        filtros: { type: 'array', items: { type: 'object', properties: { columna: { type: 'string' }, op: { type: 'string' }, valor: {} }, required: ['columna', 'op'] } },
      },
      required: ['tabla'],
      additionalProperties: false,
    },
  },
  {
    name: 'resumen_ventas',
    description: 'Resumen de ventas del local en un período: tickets, prendas, facturado, ganancia, y desglose por día, medio de pago o modelo. Los tickets se cuentan por venta_grupo_id.',
    inputSchema: {
      type: 'object',
      properties: { ...esquemaFechas, agrupar: { type: 'string', enum: ['dia', 'medio_pago', 'modelo', 'empleado'], description: 'Cómo desglosar. Por defecto: dia.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'stock_actual',
    description: 'Stock actual de botines por modelo y talle (local y Buenos Aires). Se puede buscar por marca/modelo/código y filtrar los que están bajo el stock mínimo o agotados.',
    inputSchema: {
      type: 'object',
      properties: {
        buscar: { type: 'string', description: 'Texto a buscar en marca, modelo o código base.' },
        solo_bajo_minimo: { type: 'boolean', description: 'Solo talles con stock menor o igual al mínimo.' },
        limite: { type: 'integer', description: 'Cantidad de modelos (máximo 100, por defecto 30).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'resumen_crm',
    description: 'Resumen del CRM de WhatsApp en un período: mensajes recibidos/enviados, chats con movimiento, ventas concretadas (monto, por bot o persona), sugerencias del bot usadas.',
    inputSchema: { type: 'object', properties: { ...esquemaFechas }, additionalProperties: false },
  },
  {
    name: 'resumen_tienda_online',
    description: 'Resumen de la tienda online (TiendaNube) en un período: órdenes, facturado, por estado y por medio de pago, más visitas web.',
    inputSchema: { type: 'object', properties: { ...esquemaFechas }, additionalProperties: false },
  },
] as const

type Args = Record<string, unknown>

async function listarTablas(): Promise<unknown> {
  return {
    nota: 'Todas las tablas son de solo lectura. Usá describir_tabla para ver columnas y consultar para traer filas.',
    tablas: Object.entries(TABLAS).map(([nombre, descripcion]) => ({ nombre, descripcion })),
  }
}

async function describirTabla(db: AccesoDb, a: Args): Promise<unknown> {
  const tabla = String(a.tabla ?? '')
  if (!TABLAS_PERMITIDAS.has(tabla)) throw new ErrorHerramienta(`Tabla no disponible: "${tabla}".`)
  const r = await db.leer(`${tabla}?select=*&limit=1`, { contar: true })
  const ejemplo = r.filas[0] ?? null
  return {
    tabla,
    descripcion: TABLAS[tabla],
    filas: r.total,
    columnas: ejemplo ? Object.keys(ejemplo) : '(tabla vacía)',
    ejemplo,
  }
}

async function consultar(db: AccesoDb, a: Args): Promise<unknown> {
  const q = armarConsulta(a)
  const r = await db.leer(q.path, { contar: true })
  return {
    tabla: q.tabla,
    devueltas: r.filas.length,
    total_que_coinciden: r.total,
    hay_mas: r.total !== null ? r.total > r.filas.length + Number(a.desde ?? 0) : r.filas.length === q.limite,
    filas: r.filas,
  }
}

async function contar(db: AccesoDb, a: Args): Promise<unknown> {
  const q = armarConsulta({ tabla: a.tabla, columnas: 'id', filtros: a.filtros, limite: 1 })
  const r = await db.leer(q.path, { contar: true })
  return { tabla: q.tabla, cantidad: r.total }
}

async function resumenVentas(db: AccesoDb, a: Args): Promise<unknown> {
  const rg = rangoFechas(a.desde, a.hasta)
  const agrupar = String(a.agrupar ?? 'dia')
  if (!['dia', 'medio_pago', 'modelo', 'empleado'].includes(agrupar)) throw new ErrorHerramienta('agrupar: dia, medio_pago, modelo o empleado')
  const filas = await leerTodo(db, `ventas?select=modelo_id,fecha,precio_venta,medio_pago,ganancia,venta_grupo_id,empleado_id&fecha=gte.${encodeURIComponent(rg.gte)}&fecha=lt.${encodeURIComponent(rg.lt)}&order=fecha.asc`)

  let nombres: Map<string, string> | null = null
  if (agrupar === 'modelo') {
    const ids = [...new Set(filas.map(f => String(f.modelo_id)))]
    nombres = new Map()
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100)
      const m = await db.leer(`modelos?select=id,marca,modelo&id=in.${encodeURIComponent(`(${lote.join(',')})`)}&limit=100`)
      for (const x of m.filas) nombres.set(String(x.id), `${x.marca} ${x.modelo}`)
    }
  }
  if (agrupar === 'empleado') {
    nombres = new Map()
    const e = await db.leer('empleados?select=id,nombre&limit=200')
    for (const x of e.filas) nombres.set(String(x.id), String(x.nombre))
  }

  const total = { tickets: new Set<string>(), prendas: 0, facturado: 0, ganancia: 0 }
  const grupos = new Map<string, { tickets: Set<string>; prendas: number; facturado: number; ganancia: number }>()
  filas.forEach((f, i) => {
    const ticket = String(f.venta_grupo_id ?? `solo-${i}`)
    const clave =
      agrupar === 'dia' ? diaAr(String(f.fecha))
      : agrupar === 'medio_pago' ? String(f.medio_pago ?? 'sin dato')
      : agrupar === 'modelo' ? nombres!.get(String(f.modelo_id)) ?? String(f.modelo_id)
      : f.empleado_id ? nombres!.get(String(f.empleado_id)) ?? String(f.empleado_id) : 'sin empleado'
    const g = grupos.get(clave) ?? { tickets: new Set<string>(), prendas: 0, facturado: 0, ganancia: 0 }
    const precio = Number(f.precio_venta) || 0
    const gan = Number(f.ganancia) || 0
    g.tickets.add(ticket); g.prendas += 1; g.facturado += precio; g.ganancia += gan
    grupos.set(clave, g)
    total.tickets.add(ticket); total.prendas += 1; total.facturado += precio; total.ganancia += gan
  })

  const detalle = [...grupos.entries()]
    .map(([clave, g]) => ({ [agrupar]: clave, tickets: g.tickets.size, prendas: g.prendas, facturado: redondear(g.facturado), ganancia: redondear(g.ganancia) }))
    .sort((x, y) => (agrupar === 'dia' ? String(x.dia).localeCompare(String(y.dia)) : y.facturado - x.facturado))

  return {
    periodo: { desde: rg.desde, hasta: rg.hasta },
    total: { tickets: total.tickets.size, prendas: total.prendas, facturado: redondear(total.facturado), ganancia: redondear(total.ganancia) },
    nota: 'facturado = suma de precio_venta de las prendas; ganancia ya descuenta el costo según la app. Son ventas del local físico (la tienda online va aparte).',
    [`por_${agrupar}`]: detalle.slice(0, 200),
  }
}

async function stockActual(db: AccesoDb, a: Args): Promise<unknown> {
  const limite = Math.min(Math.max(Math.floor(Number(a.limite ?? 30)) || 30, 1), 100)
  const partes = ['select=id,marca,modelo,gama,codigo_base,precio_venta,precio_efectivo,modelo_talles(talle_arg,talle_us,cantidad,cantidad_local,cantidad_ba,stock_minimo)', 'order=marca.asc,modelo.asc', `limit=${limite}`]
  const buscar = a.buscar ? String(a.buscar).trim().replace(/[(),*%]/g, ' ').trim() : ''
  if (buscar) {
    const t = encodeURIComponent(`*${buscar}*`)
    partes.push(`or=(marca.ilike.${t},modelo.ilike.${t},codigo_base.ilike.${t})`)
  }
  const r = await db.leer(`modelos?${partes.join('&')}`)
  let modelos = r.filas.map(m => {
    const talles = ((m.modelo_talles as FilaDb[] | undefined) ?? [])
      .map(t => ({ talle: t.talle_arg, cantidad: Number(t.cantidad) || 0, local: Number(t.cantidad_local) || 0, buenos_aires: Number(t.cantidad_ba) || 0, minimo: Number(t.stock_minimo) || 0 }))
      .sort((x, y) => Number(x.talle) - Number(y.talle))
    return { marca: m.marca, modelo: m.modelo, gama: m.gama, codigo_base: m.codigo_base, precio_venta: m.precio_venta, precio_efectivo: m.precio_efectivo, total_pares: talles.reduce((s, t) => s + t.cantidad, 0), talles }
  })
  if (a.solo_bajo_minimo) {
    modelos = modelos
      .map(m => ({ ...m, talles: m.talles.filter(t => t.cantidad <= t.minimo) }))
      .filter(m => m.talles.length > 0)
  }
  return { modelos: modelos.length, resultado: modelos }
}

async function resumenCrm(db: AccesoDb, a: Args): Promise<unknown> {
  const rg = rangoFechas(a.desde, a.hasta)
  const g = encodeURIComponent(rg.gte)
  const l = encodeURIComponent(rg.lt)
  const [recibidos, enviados, chats, ventas, sugerencias, sugUsadas] = await Promise.all([
    db.leer(`wsp_mensajes?select=id&direccion=eq.in&timestamp=gte.${g}&timestamp=lt.${l}&limit=1`, { contar: true }),
    db.leer(`wsp_mensajes?select=id&direccion=eq.out&timestamp=gte.${g}&timestamp=lt.${l}&limit=1`, { contar: true }),
    db.leer(`wsp_conversaciones?select=id&ultimo_mensaje_at=gte.${g}&ultimo_mensaje_at=lt.${l}&limit=1`, { contar: true }),
    leerTodo(db, `crm_ventas?select=monto,origen,tipo,atendio&detectada_at=gte.${g}&detectada_at=lt.${l}`),
    db.leer(`wsp_ia_sugerencias?select=id&created_at=gte.${g}&created_at=lt.${l}&limit=1`, { contar: true }),
    db.leer(`wsp_ia_sugerencias?select=id&usada=eq.true&created_at=gte.${g}&created_at=lt.${l}&limit=1`, { contar: true }),
  ])
  const porOrigen: Record<string, { ventas: number; monto: number }> = {}
  let monto = 0
  for (const v of ventas) {
    const o = String(v.origen ?? 'sin dato')
    porOrigen[o] ??= { ventas: 0, monto: 0 }
    porOrigen[o].ventas += 1
    porOrigen[o].monto += Number(v.monto) || 0
    monto += Number(v.monto) || 0
  }
  for (const o of Object.values(porOrigen)) o.monto = redondear(o.monto)
  return {
    periodo: { desde: rg.desde, hasta: rg.hasta },
    mensajes_recibidos: recibidos.total,
    mensajes_enviados: enviados.total,
    chats_con_movimiento: chats.total,
    ventas_concretadas: { cantidad: ventas.length, monto: redondear(monto), por_origen: porOrigen },
    sugerencias_del_bot: { generadas: sugerencias.total, usadas: sugUsadas.total },
  }
}

async function resumenTienda(db: AccesoDb, a: Args): Promise<unknown> {
  const rg = rangoFechas(a.desde, a.hasta)
  const g = encodeURIComponent(rg.gte)
  const l = encodeURIComponent(rg.lt)
  const ordenes = await leerTodo(db, `tn_ordenes?select=number,status,payment_status,total,payment_method&tn_created_at=gte.${g}&tn_created_at=lt.${l}`)
  const porEstado: Record<string, { ordenes: number; total: number }> = {}
  const porPago: Record<string, { ordenes: number; total: number }> = {}
  let total = 0
  for (const o of ordenes) {
    const t = Number(o.total) || 0
    const e = `${o.status ?? '?'} / pago ${o.payment_status ?? '?'}`
    const p = String(o.payment_method ?? 'sin dato')
    porEstado[e] ??= { ordenes: 0, total: 0 }; porEstado[e].ordenes += 1; porEstado[e].total += t
    porPago[p] ??= { ordenes: 0, total: 0 }; porPago[p].ordenes += 1; porPago[p].total += t
    total += t
  }
  for (const x of [...Object.values(porEstado), ...Object.values(porPago)]) x.total = redondear(x.total)
  const tipos = ['page_view', 'product_view', 'talle_select', 'add_to_cart', 'checkout_start']
  const conteos = await Promise.all(
    tipos.map(t => db.leer(`web_eventos?select=id&tipo=eq.${t}&created_at=gte.${g}&created_at=lt.${l}&limit=1`, { contar: true }).catch(() => ({ filas: [], total: null }))),
  )
  const web: Record<string, number | null> = {}
  tipos.forEach((t, i) => { web[t] = conteos[i].total })
  return {
    periodo: { desde: rg.desde, hasta: rg.hasta },
    ordenes: ordenes.length,
    total_ordenes: redondear(total),
    nota: 'El total incluye todas las órdenes creadas (también canceladas o sin pagar): mirá por_estado para separar.',
    por_estado: porEstado,
    por_medio_de_pago: porPago,
    web_eventos_por_tipo: web,
  }
}

export async function llamarHerramienta(db: AccesoDb, nombre: string, args: Args): Promise<unknown> {
  switch (nombre) {
    case 'listar_tablas': return listarTablas()
    case 'describir_tabla': return describirTabla(db, args)
    case 'consultar': return consultar(db, args)
    case 'contar': return contar(db, args)
    case 'resumen_ventas': return resumenVentas(db, args)
    case 'stock_actual': return stockActual(db, args)
    case 'resumen_crm': return resumenCrm(db, args)
    case 'resumen_tienda_online': return resumenTienda(db, args)
    default: throw new ErrorHerramienta(`Herramienta desconocida: ${nombre}`)
  }
}

// ───────────────────────── protocolo MCP (JSON-RPC) ─────────────────────────

const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05']

interface PedidoRpc { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
type RespuestaRpc = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } }

function recortar(texto: string): string {
  if (texto.length <= TOPE_RESPUESTA) return texto
  return `${texto.slice(0, TOPE_RESPUESTA)}\n…[recortado: la respuesta era más larga. Pedí menos columnas, más filtros o menos filas]`
}

/** Procesa un mensaje JSON-RPC. Devuelve null cuando es una notificación (no se responde). */
export async function atenderRpc(db: AccesoDb, pedido: PedidoRpc): Promise<RespuestaRpc | null> {
  const id = pedido.id ?? null
  const esNotificacion = pedido.id === undefined || pedido.id === null
  const ok = (result: unknown): RespuestaRpc | null => (esNotificacion ? null : { jsonrpc: '2.0', id, result })
  const error = (code: number, message: string): RespuestaRpc | null => (esNotificacion ? null : { jsonrpc: '2.0', id, error: { code, message } })

  switch (pedido.method) {
    case 'initialize': {
      const pedida = String(pedido.params?.protocolVersion ?? '')
      return ok({
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'right-botines-stock', version: '1.0.0' },
        instructions: 'Dashboard de Right Botines Stock (solo lectura). Empezá con listar_tablas o con los resúmenes (resumen_ventas, stock_actual, resumen_crm, resumen_tienda_online). Las fechas son hora Argentina.',
      })
    }
    case 'ping': return ok({})
    case 'tools/list': return ok({ tools: HERRAMIENTAS })
    case 'tools/call': {
      const nombre = String(pedido.params?.name ?? '')
      const args = (pedido.params?.arguments ?? {}) as Args
      try {
        const resultado = await llamarHerramienta(db, nombre, args)
        return ok({ content: [{ type: 'text', text: recortar(JSON.stringify(resultado, null, 1)) }] })
      } catch (e) {
        const msg = e instanceof ErrorHerramienta ? e.message : 'No se pudo leer la base. Probá de nuevo.'
        return ok({ content: [{ type: 'text', text: msg }], isError: true })
      }
    }
    default:
      if (pedido.method?.startsWith('notifications/')) return null
      return error(-32601, `Método no soportado: ${String(pedido.method)}`)
  }
}

// ───────────────────────── acceso a la clave ─────────────────────────

/** Compara en tiempo constante contra la lista de claves (separadas por coma). */
export function claveValida(recibida: string | null, configuradas: string | undefined): boolean {
  if (!recibida || !configuradas) return false
  let ok = false
  for (const c of configuradas.split(',').map(s => s.trim()).filter(s => s.length >= 24)) {
    if (c.length !== recibida.length) continue
    let diff = 0
    for (let i = 0; i < c.length; i++) diff |= c.charCodeAt(i) ^ recibida.charCodeAt(i)
    if (diff === 0) ok = true
  }
  return ok
}
