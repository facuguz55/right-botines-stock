import type { CrmEtiqueta } from '../../../types/crm'
import './Etiquetas.css'

interface EtiquetaChipProps {
  etiqueta: CrmEtiqueta
  size?: 'sm' | 'md'
}

export default function EtiquetaChip({ etiqueta, size = 'sm' }: EtiquetaChipProps) {
  return (
    <span
      className={`etiqueta-chip etiqueta-chip--${size}`}
      style={{ backgroundColor: `${etiqueta.color}22`, color: etiqueta.color, borderColor: `${etiqueta.color}55`, ['--chip-color' as string]: etiqueta.color }}
    >
      {etiqueta.nombre}
    </span>
  )
}
