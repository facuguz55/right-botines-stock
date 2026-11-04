import { useState } from 'react'
import { TNOrdenes } from '../TNOrdenes/TNOrdenes'
import { EnviosBA } from './EnviosBA'
import { getDeviceToken } from '../../lib/dispositivo'
import './LogisticaBA.css'

// Órdenes con una pestaña "Depósito CABA": lo mismo que ve la logística de la
// proveedora en /logistica (envíos que salen de Buenos Aires). Entra con el
// permiso de este dispositivo (habilitado con el PIN del dueño).
export function OrdenesPagina({ empleadoId }: { empleadoId: string | null }) {
  const [pestana, setPestana] = useState<'todas' | 'caba'>('todas')
  return (
    <>
      <div className="lba-pestanas" role="tablist">
        <button role="tab" aria-selected={pestana === 'todas'} className={`lba-pestana${pestana === 'todas' ? ' on' : ''}`} onClick={() => setPestana('todas')}>Todas las órdenes</button>
        <button role="tab" aria-selected={pestana === 'caba'} className={`lba-pestana${pestana === 'caba' ? ' on' : ''}`} onClick={() => setPestana('caba')}>Depósito CABA</button>
      </div>
      {pestana === 'todas' ? <TNOrdenes empleadoId={empleadoId} /> : (
        <div className="tn-ordenes">
          <div className="page-header">
            <div>
              <h1 className="page-title">Envíos desde Buenos Aires</h1>
              <p className="page-subtitle">Lo mismo que ve la logística de la proveedora</p>
            </div>
          </div>
          <EnviosBA acceso={{ dispositivo: getDeviceToken() }} />
        </div>
      )}
    </>
  )
}
