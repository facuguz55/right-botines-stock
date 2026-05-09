import { Download } from 'lucide-react'
import type { Modelo } from '../../types'

interface ExportButtonProps { modelos: Modelo[] }

function toCSV(modelos: Modelo[]): string {
  const headers = ['Código', 'Marca', 'Modelo', 'Categoría', 'Gama', 'Talle ARG', 'Talle US', 'Stock', 'Stock Mínimo', 'Precio Costo', 'Precio Venta', 'Margen', 'Notas']
  const rows: (string | number)[][] = []
  for (const m of modelos) {
    for (const t of m.modelo_talles) {
      rows.push([
        m.codigo_base, m.marca, m.modelo, m.categoria, m.gama,
        t.talle_arg, t.talle_us, t.cantidad, t.stock_minimo,
        m.precio_costo, m.precio_venta, m.precio_venta - m.precio_costo,
        m.notas ?? '',
      ])
    }
  }
  const esc = (v: string | number) => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
}

export function ExportButton({ modelos }: ExportButtonProps) {
  const handleExport = () => {
    const csv = toCSV(modelos)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `stock-right-botines-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
  return (
    <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={modelos.length === 0}>
      <Download size={14} /> Exportar CSV
    </button>
  )
}
