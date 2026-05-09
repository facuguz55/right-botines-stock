import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { DashboardData, TopModelo } from '../types'

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        // Queries simples — sin joins anidados de tres niveles
        const [
          { data: tallesData, error: e1 },
          { data: modelosData, error: e2 },
          // Solo campos planos de ventas, sin join con modelo_fotos
          { data: ventasMesData, error: e3 },
          { data: allVentas, error: e4 },
          { data: modelosAlerta, error: e5 },
        ] = await Promise.all([
          supabase.from('modelo_talles').select('cantidad'),
          supabase.from('modelos').select('id'),
          supabase
            .from('ventas')
            .select('modelo_id, precio_venta, ganancia, modelos(id, marca, modelo, codigo_base)')
            .gte('fecha', startOfMonth),
          supabase
            .from('ventas')
            .select('fecha')
            .order('fecha', { ascending: true }),
          supabase
            .from('modelos')
            .select('id, marca, modelo, categoria, gama, precio_venta, precio_costo, codigo_base, notas, created_at, modelo_talles(*), modelo_fotos(id, modelo_id, foto_url, orden, created_at)'),
        ])

        const firstError = e1 || e2 || e3 || e4 || e5
        if (firstError) throw new Error(firstError.message ?? 'Error al cargar datos')

        // Métricas básicas
        const totalModelos = modelosData?.length ?? 0
        const totalPares = (tallesData ?? []).reduce((s, t) => s + (t.cantidad ?? 0), 0)
        const ventasMes = ventasMesData?.length ?? 0
        const totalFacturadoMes = (ventasMesData ?? []).reduce((s, v) => s + (v.precio_venta ?? 0), 0)
        const gananciaMes = (ventasMesData ?? []).reduce((s, v) => s + (v.ganancia ?? 0), 0)

        // Top 5 modelos más vendidos del mes
        // Construir mapa con datos del join simple (sin fotos)
        const countMap: Record<string, { count: number; raw: any }> = {}
        ;(ventasMesData ?? []).forEach((v: any) => {
          if (!v.modelo_id || !v.modelos) return
          if (!countMap[v.modelo_id]) countMap[v.modelo_id] = { count: 0, raw: v.modelos }
          countMap[v.modelo_id].count++
        })

        // Buscar fotos desde modelosAlerta (ya cargado, sin join problemático)
        const modeloFotosMap: Record<string, string | null> = {}
        ;(modelosAlerta ?? []).forEach((m: any) => {
          const fotos = (m.modelo_fotos ?? []).sort((a: any, b: any) => a.orden - b.orden)
          modeloFotosMap[m.id] = fotos[0]?.foto_url ?? null
        })

        const topModelos: TopModelo[] = Object.entries(countMap)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([modelo_id, { count, raw }]) => ({
            modelo_id,
            marca: raw.marca ?? '',
            nombre: raw.modelo ?? '',
            codigo_base: raw.codigo_base ?? '',
            cantidadVendida: count,
            foto_url: modeloFotosMap[modelo_id] ?? null,
          }))

        // Ventas por semana — últimas 4 semanas
        const ventasPorSemana = buildWeeklySales(allVentas ?? [], 4)

        // Alertas de stock mínimo
        const alertasStock = (modelosAlerta ?? [])
          .map((m: any) => {
            const talles = (m.modelo_talles ?? []).sort((a: any, b: any) => a.talle_arg - b.talle_arg)
            const fotos = (m.modelo_fotos ?? []).sort((a: any, b: any) => a.orden - b.orden)
            const tallesAlerta = talles.filter((t: any) => t.cantidad > 0 && t.cantidad <= t.stock_minimo)
            if (tallesAlerta.length === 0) return null
            return {
              modelo: { ...m, precio_costo: m.precio_costo ?? 0, modelo_talles: talles, modelo_fotos: fotos },
              tallesAlerta,
            }
          })
          .filter(Boolean) as DashboardData['alertasStock']

        setData({
          totalModelos, totalPares, ventasMes, totalFacturadoMes,
          gananciaMes, ventasPorSemana, topModelos, alertasStock,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido al cargar el dashboard'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { data, loading, error }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d
}

function buildWeeklySales(ventas: { fecha: string }[], weeks: number): { semana: string; ventas: number }[] {
  const map: Record<string, number> = {}
  ventas.forEach(v => {
    const key = getWeekStart(new Date(v.fecha)).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    map[key] = (map[key] || 0) + 1
  })
  return Object.entries(map).slice(-weeks).map(([semana, ventas]) => ({ semana, ventas }))
}
