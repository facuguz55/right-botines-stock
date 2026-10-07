import { useState } from 'react'
import { MonitorSmartphone, Trash2 } from 'lucide-react'
import { listarDispositivos, quitarDispositivo, type DispositivoHabilitado } from '../../services/dispositivos'

function fecha(iso: string | null): string {
  if (!iso) return 'nunca'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Dispositivos habilitados para usar TiendaNube (ver migración 046). Pide el
// PIN otra vez porque el rol de dueño en la app vive solo en el navegador:
// sin el PIN, cualquiera con la app abierta podría quitar dispositivos.
export function DispositivosSection() {
  const [pin, setPin] = useState('')
  const [lista, setLista] = useState<DispositivoHabilitado[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = async () => {
    setError(null)
    setCargando(true)
    try {
      setLista(await listarDispositivos(pin))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  const quitar = async (d: DispositivoHabilitado) => {
    if (!window.confirm(`¿Quitar "${d.nombre}"? Ese dispositivo va a tener que habilitarse de nuevo para usar TiendaNube.`)) return
    setError(null)
    try {
      await quitarDispositivo(pin, d.id)
      setLista(prev => prev?.filter(x => x.id !== d.id) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="config-section">
      <div className="config-section-header">
        <MonitorSmartphone size={16} />
        <h2 className="config-section-title">Dispositivos habilitados para TiendaNube</h2>
      </div>
      <p className="config-section-desc">
        Las compus y celulares que pueden actualizar la tienda web (stock, productos, órdenes). Cada uno se habilita una vez con
        tu PIN desde el aviso que le aparece arriba. Si se pierde un celular o alguien deja de trabajar, quitalo de acá. Puede
        tardar hasta 5 minutos en dejar de funcionar.
      </p>
      <div className="config-card">
        {lista === null ? (
          <div className="config-row">
            <label className="config-label">Tu PIN</label>
            <div className="config-input-wrap" style={{ maxWidth: 140 }}>
              <input
                type="password" inputMode="numeric" maxLength={4} className="config-input"
                value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter' && pin.length === 4) cargar() }}
                placeholder="••••"
              />
            </div>
            <button className="btn btn-secondary btn-sm" disabled={cargando || pin.length !== 4} onClick={cargar}>
              {cargando ? 'Cargando...' : 'Ver dispositivos'}
            </button>
          </div>
        ) : lista.length === 0 ? (
          <p className="config-section-desc">Todavía no hay dispositivos habilitados.</p>
        ) : (
          <div className="dispositivos-lista">
            {lista.map(d => (
              <div key={d.id} className="dispositivos-fila">
                <div>
                  <p className="dispositivos-nombre">{d.nombre}</p>
                  <p className="dispositivos-meta">Habilitado {fecha(d.created_at)} · último uso {fecha(d.ultimo_uso)}</p>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => quitar(d)}><Trash2 size={13} /> Quitar</button>
              </div>
            ))}
          </div>
        )}
        {error && <p style={{ fontSize: '.8125rem', color: 'var(--danger)' }}>⚠ {error}</p>}
      </div>
    </section>
  )
}
