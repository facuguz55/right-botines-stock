// Números del Dashboard del local para un período elegido (hoy, ayer, semana,
// un mes...). Funciones puras: reciben los pares vendidos (local + web) ya
// armados y devuelven lo que la pantalla muestra, así se pueden probar solas.
import { mesAnteriorISO, mesDelRango, rangoDeMes, sumarDiasISO, type RangoCrm } from './crmRango'
import { toISOLocal } from '../utils/fecha'

export interface FotoPar { id: string; marca: string; modelo: string; codigo_base: string; foto: string | null }

// Un par vendido. `ganancia` es null si el modelo no tiene el costo cargado.
export interface ParVendido {
  fecha: string // ISO
  precio: number
  ganancia: number | null
  canal: 'local' | 'web'
  modelo: FotoPar | null
}

export interface RankingPar extends FotoPar { pares: number; facturado: number; ganancia: number | null; margen: number | null }

export interface ResumenPeriodo {
  facturado: { local: number; web: number; total: number }
  pares: { local: number; web: number }
  // Suma de (precio - costo) de los pares con costo cargado. No descuenta
  // gastos ni sueldos: la ganancia neta real solo existe por mes completo.
  gananciaBruta: number
  sinCosto: { cantidad: number; facturado: number; ejemplos: string[] }
  ranking: RankingPar[]
}

const diaAR = (iso: string) => toISOLocal(new Date(iso))

export function dentroDelRango(iso: string, r: RangoCrm): boolean {
  const d = diaAR(iso)
  return d >= r.start && d <= r.end
}

export function resumirPeriodo(pares: ParVendido[], r: RangoCrm, topRanking = 8): ResumenPeriodo {
  const facturado = { local: 0, web: 0, total: 0 }
  const cuenta = { local: 0, web: 0 }
  let gananciaBruta = 0
  const sinCosto = new Map<string, { nombre: string; facturado: number }>()
  const rank = new Map<string, { m: FotoPar; pares: number; facturado: number; ganancia: number; sinCosto: boolean }>()

  for (const p of pares) {
    if (!dentroDelRango(p.fecha, r)) continue
    facturado[p.canal] += p.precio
    facturado.total += p.precio
    cuenta[p.canal] += 1
    if (p.ganancia != null) gananciaBruta += p.ganancia
    if (!p.modelo) continue
    if (p.ganancia == null) {
      const f = sinCosto.get(p.modelo.id) ?? { nombre: `${p.modelo.marca} ${p.modelo.modelo}`, facturado: 0 }
      f.facturado += p.precio
      sinCosto.set(p.modelo.id, f)
    }
    const f = rank.get(p.modelo.id) ?? { m: p.modelo, pares: 0, facturado: 0, ganancia: 0, sinCosto: false }
    f.pares += 1
    f.facturado += p.precio
    if (p.ganancia == null) f.sinCosto = true
    else f.ganancia += p.ganancia
    rank.set(p.modelo.id, f)
  }

  const sinCostoLista = [...sinCosto.values()].sort((a, b) => b.facturado - a.facturado)
  const ranking: RankingPar[] = [...rank.values()]
    .map(f => ({
      ...f.m, pares: f.pares, facturado: f.facturado,
      ganancia: f.sinCosto ? null : f.ganancia,
      margen: f.sinCosto || !f.facturado ? null : (f.ganancia / f.facturado) * 100,
    }))
    .sort((a, b) => (b.ganancia ?? -1) - (a.ganancia ?? -1) || b.facturado - a.facturado)
    .slice(0, topRanking)

  return {
    facturado, pares: cuenta, gananciaBruta,
    sinCosto: {
      cantidad: sinCostoLista.length,
      facturado: sinCostoLista.reduce((s, x) => s + x.facturado, 0),
      ejemplos: sinCostoLista.slice(0, 4).map(x => x.nombre),
    },
    ranking,
  }
}

// El período contra el que se compara: si es un mes, el mes anterior completo;
// si no, la misma cantidad de días justo antes.
export function rangoAnterior(r: RangoCrm, hoy: string): RangoCrm {
  const mes = mesDelRango(r, hoy)
  if (mes) return rangoDeMes(mesAnteriorISO(mes), hoy)
  const dias = Math.round((new Date(`${r.end}T12:00:00Z`).getTime() - new Date(`${r.start}T12:00:00Z`).getTime()) / 86_400_000) + 1
  return { start: sumarDiasISO(r.start, -dias), end: sumarDiasISO(r.start, -1) }
}

// Etiqueta corta del período para títulos ("hoy", "ayer", "Octubre 2026"...).
export function etiquetaPeriodo(r: RangoCrm, hoy: string, nombreMes: (mes: string) => string): string {
  const mes = mesDelRango(r, hoy)
  if (mes) return nombreMes(mes)
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
  if (r.start === r.end) {
    if (r.start === hoy) return 'hoy'
    if (r.start === sumarDiasISO(hoy, -1)) return 'ayer'
    return f(r.start)
  }
  return `${f(r.start)} al ${f(r.end)}`
}
