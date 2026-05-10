import type { Modelo, ModeloFilters } from '../../types'
import './Filters.css'

interface FiltersProps {
  filters: ModeloFilters
  onChange: (filters: ModeloFilters) => void
  modelos: Modelo[]
}

const CATEGORIAS = ['F5', 'F11', 'Futsal', 'Hockey']
const GAMAS = ['Económica', 'Mixto', 'Media', 'Alta']

export function Filters({ filters, onChange, modelos }: FiltersProps) {
  const marcas = [...new Set(modelos.map(m => m.marca))].sort()
  const talles = [
    ...new Set(modelos.flatMap(m => m.modelo_talles.map(t => t.talle_arg))),
  ].sort((a, b) => a - b)

  const update = (key: keyof ModeloFilters, value: string) =>
    onChange({ ...filters, [key]: value })

  const hasFilters =
    filters.marca || filters.categoria || filters.gama ||
    filters.talle || filters.disponibilidad !== 'todos' || filters.search

  return (
    <div className="filters">
      <div className="filters-row">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Modelo o código..."
            value={filters.search}
            onChange={e => update('search', e.target.value)}
          />
        </div>

        <select className="filter-select" value={filters.talle} onChange={e => update('talle', e.target.value)}>
          <option value="">Todos los talles</option>
          {talles.map(t => <option key={t} value={String(t)}>{t} arg</option>)}
        </select>

        <select className="filter-select" value={filters.marca} onChange={e => update('marca', e.target.value)}>
          <option value="">Todas las marcas</option>
          {marcas.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select className="filter-select" value={filters.categoria} onChange={e => update('categoria', e.target.value)}>
          <option value="">Categoría</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="filter-select" value={filters.gama} onChange={e => update('gama', e.target.value)}>
          <option value="">Gama</option>
          {GAMAS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select className="filter-select" value={filters.disponibilidad} onChange={e => update('disponibilidad', e.target.value as ModeloFilters['disponibilidad'])}>
          <option value="todos">Todos</option>
          <option value="disponible">Disponibles</option>
          <option value="agotado">Agotados</option>
        </select>

        {hasFilters && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onChange({ marca: '', categoria: '', gama: '', talle: '', disponibilidad: 'todos', search: '' })}
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
