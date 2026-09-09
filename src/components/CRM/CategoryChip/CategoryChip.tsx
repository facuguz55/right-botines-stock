import { CATEGORIA_COLORS, type CrmCategoria } from '../../../types/crm'
import './CategoryChip.css'

interface CategoryChipProps {
  categoria: CrmCategoria
  size?: 'sm' | 'md'
  onClick?: () => void
}

export default function CategoryChip({ categoria, size = 'sm', onClick }: CategoryChipProps) {
  const color = CATEGORIA_COLORS[categoria]

  return (
    <span
      className={`cat-chip cat-chip--${size}${onClick ? ' cat-chip--clickable' : ''}`}
      style={{ backgroundColor: `${color}22`, color }}
      onClick={onClick}
    >
      {categoria}
    </span>
  )
}
