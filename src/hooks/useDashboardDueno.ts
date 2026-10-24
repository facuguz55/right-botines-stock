import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeRentabilidadMes } from '../services/rentabilidadService'
import { fetchAnalisisProductos, type AnalisisProductos } from '../services/trafico'
import { hoyLocal } from '../utils/fecha'
import type { RentabilidadMes } from '../types'

// Dashboard del dueño: no solo qué pasó, sino qué hacer (qué comprar, qué
// liquidar, qué empujar). Junta ventas del local (`ventas`) y de la web
// (`tn_ordenes`) por modelo y por talle.

const DIA = 86400_000
const VENTANA = 60 // días que se usan para medir a qué ritmo se vende cada talle
const COBERTURA = 30 // al reponer, cuántos días de venta conviene cubrir

export interface FotoModelo { id: string; marca: string; modelo: string; codigo_base: string; foto: string | null }

export interface Reponer extends FotoModelo {
  talles: { talle: number; stock: number; vendidos: number; diasRestantes: number | null; comprar: number }[]
  urgencia: number // días hasta que se acaba el talle más urgente (0 = ya agotado)
  comprarTotal: number
}

export interface Parado extends FotoModelo { pares: number; capital: number | null; ultimaVenta: string | null; precio: number }

export interface RankingModelo extends FotoModelo { pares: number; facturado: number; ganancia: number | null; margen: number | null }

export interface Empujar extends FotoModelo { pares: number; margen: number; motivo: string }

export interface ClienteVolver { nombre: string; contacto: string | null; compras: number; gastado: number; ultima: string; canal: 'Local' | 'Web' }

export interface DashboardDueno {
  mes: RentabilidadMes | null
  mesAnterior: RentabilidadMes | null
  proyeccion: number | null
  paresMes: { local: number; web: number }
  modelosSinCosto: { cantidad: number; facturado: number; ejemplos: string[] }
  reponer: Reponer[]
  demandaSinStock: { nombre: string; talle: string; busquedas: number }[]
  curvaTalles: { talle: number; pares: number }[]
  parados: Parado[]
  capitalParado: number
  ranking: RankingModelo[]
  empujar: Empujar[]
  loMiranNoLoCompran: { nombre: string; vistas: number; carritos: number; ordenes: number }[]
  clientes: { conCompra: number; repiten: number; volver: ClienteVolver[] }
  semanas: { semana: string; local: number; web: number }[]
}

type ModeloRow = {
  id: string; marca: string; modelo: string; codigo_base: string; precio_costo: number | null; precio_venta: number | null
  tn_product_id: number | null; created_at: string
  modelo_talles: { talle_arg: number; cantidad: number; tn_variant_id: number | null }[]
  modelo_fotos: { foto_url: string; orden: number }[]
}
type VentaRow = { modelo_id: string | null; talle_arg: number; fecha: string; precio_venta: number; ganancia: number | null; cliente_id: string | null; clientes_locales: { nombre: string; telefono: string | null } | null }
type OrdenRow = { tn_created_at: string; total: number; customer_email: string | null; customer_name: string | null; contact_phone: string | null; products: { product_id?: number; variant_id?: number; quantity: number; price: string; name: string }[] | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todas<T>(armar: (desde: number) => PromiseLike<{ data: any; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar(desde)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return out
  }
}

const mesStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const lunesDe = (d: Date) => { const x = new Date(d); const dia = x.getDay(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (dia === 0 ? 6 : dia - 1)); return x }

export function useDashboardDueno() {
  const [data, setData] = useState<DashboardDueno | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        const ahora = new Date()
        const desde180 = new Date(Date.now() - 180 * DIA).toISOString()
        const hoy = hoyLocal()
        const hace30 = new Date(Date.now() - 30 * DIA).toISOString().slice(0, 10)
        const anterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)

        const [modelos, ventas, ordenes, mes, mesAnt, analisis] = await Promise.all([
          todas<ModeloRow>((d) => supabase.from('modelos')
            .select('id, marca, modelo, codigo_base, precio_costo, precio_venta, tn_product_id, created_at, modelo_talles(talle_arg, cantidad, tn_variant_id), modelo_fotos(foto_url, orden)')
            .order('id').range(d, d + 999)),
          todas<VentaRow>((d) => supabase.from('ventas')
            .select('modelo_id, talle_arg, fecha, precio_venta, ganancia, cliente_id, clientes_locales(nombre, telefono)')
            .gte('fecha', desde180).order('fecha').range(d, d + 999)),
          todas<OrdenRow>((d) => supabase.from('tn_ordenes')
            .select('tn_created_at, total, customer_email, customer_name, contact_phone, products')
            .in('payment_status', ['paid', 'authorized']).neq('status', 'cancelled')
            .gte('tn_created_at', desde180).order('tn_created_at').range(d, d + 999)),
          computeRentabilidadMes(mesStr(ahora)).catch(() => null),
          computeRentabilidadMes(mesStr(anterior)).catch(() => null),
          fetchAnalisisProductos(hace30, hoy).catch(() => null as AnalisisProductos | null),
        ])

        // ── Índices ──
        const porId = new Map(modelos.map((m) => [m.id, m]))
        const porProducto = new Map(modelos.filter((m) => m.tn_product_id != null).map((m) => [Number(m.tn_product_id), m]))
        const porVariante = new Map<number, { modelo: ModeloRow; talle: number }>()
        for (const m of modelos) for (const t of m.modelo_talles ?? []) if (t.tn_variant_id != null) porVariante.set(Number(t.tn_variant_id), { modelo: m, talle: t.talle_arg })
        const foto = (m: ModeloRow): FotoModelo => ({
          id: m.id, marca: m.marca, modelo: m.modelo, codigo_base: m.codigo_base,
          foto: [...(m.modelo_fotos ?? [])].sort((a, b) => a.orden - b.orden)[0]?.foto_url ?? null,
        })
        const costo = (m: ModeloRow | undefined) => (m && Number(m.precio_costo) > 0 ? Number(m.precio_costo) : null)

        // Cada par vendido, venga del local o de la web, con su modelo y talle.
        type Par = { modelo: ModeloRow | undefined; talle: number | null; fecha: string; precio: number; ganancia: number | null; canal: 'local' | 'web' }
        const pares: Par[] = []
        for (const v of ventas) {
          const m = v.modelo_id ? porId.get(v.modelo_id) : undefined
          const c = costo(m)
          pares.push({ modelo: m, talle: v.talle_arg, fecha: v.fecha, precio: Number(v.precio_venta) || 0, ganancia: c == null ? null : Number(v.ganancia ?? 0), canal: 'local' })
        }
        for (const o of ordenes) {
          for (const p of o.products ?? []) {
            const vari = p.variant_id != null ? porVariante.get(Number(p.variant_id)) : undefined
            const m = vari?.modelo ?? (p.product_id != null ? porProducto.get(Number(p.product_id)) : undefined)
            const precio = parseFloat(p.price) || 0
            const c = costo(m)
            for (let i = 0; i < (Number(p.quantity) || 0); i++) {
              pares.push({ modelo: m, talle: vari?.talle ?? null, fecha: o.tn_created_at, precio, ganancia: c == null ? null : precio - c, canal: 'web' })
            }
          }
        }

        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime()
        const corteVentana = Date.now() - VENTANA * DIA
        const delMes = pares.filter((p) => Date.parse(p.fecha) >= inicioMes)
        const recientes = pares.filter((p) => Date.parse(p.fecha) >= corteVentana)

        // ── Modelos vendidos este mes sin costo cargado (la ganancia no es real) ──
        const sinCosto = new Map<string, { nombre: string; facturado: number }>()
        for (const p of delMes) {
          if (!p.modelo || costo(p.modelo) != null) continue
          const f = sinCosto.get(p.modelo.id) ?? { nombre: `${p.modelo.marca} ${p.modelo.modelo}`, facturado: 0 }
          f.facturado += p.precio
          sinCosto.set(p.modelo.id, f)
        }
        const sinCostoLista = [...sinCosto.values()].sort((a, b) => b.facturado - a.facturado)

        // ── Qué comprar: talles que se venden y se están por acabar ──
        const vendidosTalle = new Map<string, number>()
        for (const p of recientes) if (p.modelo && p.talle != null) {
          const k = `${p.modelo.id}|${p.talle}`
          vendidosTalle.set(k, (vendidosTalle.get(k) ?? 0) + 1)
        }
        const reponer: Reponer[] = []
        for (const m of modelos) {
          const talles = (m.modelo_talles ?? []).map((t) => {
            const vendidos = vendidosTalle.get(`${m.id}|${t.talle_arg}`) ?? 0
            const ritmo = vendidos / VENTANA
            const diasRestantes = ritmo > 0 ? Math.floor(t.cantidad / ritmo) : null
            return { talle: t.talle_arg, stock: t.cantidad, vendidos, diasRestantes, comprar: Math.max(0, Math.ceil(ritmo * COBERTURA - t.cantidad)) }
          }).filter((t) => t.vendidos >= 2 && t.diasRestantes != null && t.diasRestantes <= 21)
            .sort((a, b) => a.talle - b.talle)
          if (!talles.length) continue
          reponer.push({ ...foto(m), talles, urgencia: Math.min(...talles.map((t) => t.diasRestantes ?? 99)), comprarTotal: talles.reduce((s, t) => s + t.comprar, 0) })
        }
        reponer.sort((a, b) => a.urgencia - b.urgencia || b.comprarTotal - a.comprarTotal)

        // Talles agotados que la gente buscó en la web.
        const demandaSinStock = (analisis?.talles_agotados ?? [])
          .map((t) => { const m = porProducto.get(Number(t.tn_product_id)); return { nombre: m ? `${m.marca} ${m.modelo}` : `Producto ${t.tn_product_id}`, talle: String(t.talle), busquedas: t.sesiones } })
          .sort((a, b) => b.busquedas - a.busquedas).slice(0, 8)

        // ── Curva de talles ──
        const curva = new Map<number, number>()
        for (const p of recientes) if (p.talle != null) curva.set(p.talle, (curva.get(p.talle) ?? 0) + 1)
        const curvaTalles = [...curva.entries()].map(([talle, n]) => ({ talle, pares: n })).sort((a, b) => a.talle - b.talle)

        // ── Qué liquidar: stock parado ──
        const ultimaVenta = new Map<string, string>()
        for (const p of pares) if (p.modelo) { const u = ultimaVenta.get(p.modelo.id); if (!u || p.fecha > u) ultimaVenta.set(p.modelo.id, p.fecha) }
        const parados: Parado[] = []
        for (const m of modelos) {
          const stock = (m.modelo_talles ?? []).reduce((s, t) => s + (t.cantidad > 0 ? t.cantidad : 0), 0)
          if (stock <= 0 || Date.parse(m.created_at) > corteVentana) continue
          const u = ultimaVenta.get(m.id) ?? null
          if (u && Date.parse(u) >= corteVentana) continue
          const c = costo(m)
          parados.push({ ...foto(m), pares: stock, capital: c == null ? null : c * stock, ultimaVenta: u, precio: Number(m.precio_venta) || 0 })
        }
        parados.sort((a, b) => (b.capital ?? b.precio * b.pares * 0.6) - (a.capital ?? a.precio * a.pares * 0.6))
        const capitalParado = parados.reduce((s, p) => s + (p.capital ?? 0), 0)

        // ── Qué deja más plata (últimos 30 días) ──
        const corte30 = Date.now() - 30 * DIA
        const rank = new Map<string, { m: ModeloRow; pares: number; facturado: number; ganancia: number; sinCosto: boolean }>()
        for (const p of pares) {
          if (!p.modelo || Date.parse(p.fecha) < corte30) continue
          const f = rank.get(p.modelo.id) ?? { m: p.modelo, pares: 0, facturado: 0, ganancia: 0, sinCosto: false }
          f.pares += 1; f.facturado += p.precio
          if (p.ganancia == null) f.sinCosto = true; else f.ganancia += p.ganancia
          rank.set(p.modelo.id, f)
        }
        const filas = [...rank.values()]
        const ranking: RankingModelo[] = filas
          .map((f) => ({ ...foto(f.m), pares: f.pares, facturado: f.facturado, ganancia: f.sinCosto ? null : f.ganancia, margen: f.sinCosto || !f.facturado ? null : (f.ganancia / f.facturado) * 100 }))
          .sort((a, b) => (b.ganancia ?? -1) - (a.ganancia ?? -1) || b.facturado - a.facturado).slice(0, 8)

        // ── Qué empujar: mucho stock, buen margen y pocas ventas ──
        const margenes = modelos.filter((m) => costo(m) != null && Number(m.precio_venta) > 0).map((m) => (Number(m.precio_venta) - costo(m)!) / Number(m.precio_venta))
        const margenMedio = margenes.length ? margenes.reduce((a, b) => a + b, 0) / margenes.length : 0
        const vendidosModelo = new Map<string, number>()
        for (const p of recientes) if (p.modelo) vendidosModelo.set(p.modelo.id, (vendidosModelo.get(p.modelo.id) ?? 0) + 1)
        const empujar: Empujar[] = modelos
          .map((m) => {
            const stock = (m.modelo_talles ?? []).reduce((s, t) => s + (t.cantidad > 0 ? t.cantidad : 0), 0)
            const c = costo(m), pv = Number(m.precio_venta) || 0
            const margen = c != null && pv > 0 ? (pv - c) / pv : null
            return { m, stock, margen, vendidos: vendidosModelo.get(m.id) ?? 0 }
          })
          .filter((x) => x.margen != null && x.margen >= margenMedio && x.stock >= 6 && x.vendidos <= 3)
          .sort((a, b) => b.stock * b.margen! - a.stock * a.margen!)
          .slice(0, 6)
          .map((x) => ({ ...foto(x.m), pares: x.stock, margen: x.margen! * 100, motivo: x.vendidos === 0 ? 'sin ventas en 60 días' : `${x.vendidos} vendidos en 60 días` }))

        const loMiranNoLoCompran = (analisis?.productos ?? [])
          .filter((p) => p.vistas >= 20 && p.ordenes <= Math.max(1, p.vistas * 0.01))
          .sort((a, b) => b.vistas - a.vistas).slice(0, 6)
          .map((p) => { const m = porProducto.get(Number(p.tn_product_id)); return { nombre: m ? `${m.marca} ${m.modelo}` : p.nombre ?? `Producto ${p.tn_product_id}`, vistas: p.vistas, carritos: p.carritos, ordenes: p.ordenes } })

        // ── Clientes: quién vuelve y a quién escribirle ──
        type Cli = { nombre: string; contacto: string | null; compras: Set<string>; gastado: number; ultima: string; canal: 'Local' | 'Web' }
        const clis = new Map<string, Cli>()
        for (const v of ventas) {
          if (!v.cliente_id) continue
          const c = clis.get(`l${v.cliente_id}`) ?? { nombre: v.clientes_locales?.nombre ?? 'Cliente', contacto: v.clientes_locales?.telefono ?? null, compras: new Set<string>(), gastado: 0, ultima: v.fecha, canal: 'Local' as const }
          c.compras.add(v.fecha.slice(0, 10)); c.gastado += Number(v.precio_venta) || 0; if (v.fecha > c.ultima) c.ultima = v.fecha
          clis.set(`l${v.cliente_id}`, c)
        }
        for (const o of ordenes) {
          if (!o.customer_email) continue
          const k = `w${o.customer_email.toLowerCase()}`
          const c = clis.get(k) ?? { nombre: o.customer_name ?? o.customer_email, contacto: o.contact_phone ?? o.customer_email, compras: new Set<string>(), gastado: 0, ultima: o.tn_created_at, canal: 'Web' as const }
          c.compras.add(o.tn_created_at); c.gastado += Number(o.total) || 0; if (o.tn_created_at > c.ultima) c.ultima = o.tn_created_at
          clis.set(k, c)
        }
        const listaCli = [...clis.values()]
        const volver: ClienteVolver[] = listaCli
          .filter((c) => Date.now() - Date.parse(c.ultima) > VENTANA * DIA)
          .sort((a, b) => b.gastado - a.gastado).slice(0, 8)
          .map((c) => ({ nombre: c.nombre, contacto: c.contacto, compras: c.compras.size, gastado: c.gastado, ultima: c.ultima, canal: c.canal }))

        // ── Pares por semana, local y web (últimas 10 semanas) ──
        const semanas: DashboardDueno['semanas'] = []
        const lunes = lunesDe(ahora)
        for (let i = 9; i >= 0; i--) {
          const d = new Date(lunes); d.setDate(d.getDate() - i * 7)
          semanas.push({ semana: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), local: 0, web: 0 })
        }
        const primerLunes = lunesDe(new Date(lunes.getTime() - 9 * 7 * DIA)).getTime()
        for (const p of pares) {
          const t = Date.parse(p.fecha)
          if (t < primerLunes) continue
          const i = Math.floor((lunesDe(new Date(t)).getTime() - primerLunes) / (7 * DIA))
          if (semanas[i]) semanas[i][p.canal] += 1
        }

        const diaDelMes = ahora.getDate()
        const diasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate()
        const proyeccion = mes && diaDelMes >= 3 ? (mes.total.facturado / diaDelMes) * diasMes : null

        if (!vivo) return
        setData({
          mes, mesAnterior: mesAnt, proyeccion,
          paresMes: { local: delMes.filter((p) => p.canal === 'local').length, web: delMes.filter((p) => p.canal === 'web').length },
          modelosSinCosto: { cantidad: sinCostoLista.length, facturado: sinCostoLista.reduce((s, x) => s + x.facturado, 0), ejemplos: sinCostoLista.slice(0, 4).map((x) => x.nombre) },
          reponer: reponer.slice(0, 12), demandaSinStock, curvaTalles,
          parados: parados.slice(0, 10), capitalParado,
          ranking, empujar, loMiranNoLoCompran,
          clientes: { conCompra: listaCli.length, repiten: listaCli.filter((c) => c.compras.size >= 2).length, volver },
          semanas,
        })
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el dashboard')
      } finally {
        if (vivo) setLoading(false)
      }
    }
    cargar()
    return () => { vivo = false }
  }, [])

  return { data, loading, error }
}
