import { useState } from 'react'
import { Truck } from 'lucide-react'
import { EnviosBA } from './EnviosBA'
import './LogisticaBA.css'

const KEY = 'rb_logistica_pin'
const leer = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const guardar = (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY) } catch { /* noop */ } }

// Link /logistica para la logística de la proveedora de Buenos Aires: pide el
// PIN de logística y muestra solo los envíos que salen de su depósito. No
// carga nada del resto de la app.
export function LogisticaPagina() {
  const [pin, setPin] = useState<string | null>(leer())
  const [escrito, setEscrito] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!pin) {
    return (
      <div className="lba-gate">
        <div className="lba-gate-card">
          <Truck size={26} className="lba-gate-icon" />
          <h1>Envíos Right · Buenos Aires</h1>
          <p>Ingresá el PIN de logística.</p>
          <input
            type="password" inputMode="numeric" autoFocus value={escrito}
            onChange={e => setEscrito(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={e => { if (e.key === 'Enter' && escrito) { setError(null); guardar(escrito); setPin(escrito) } }}
            placeholder="PIN"
          />
          {error && <p className="lba-error">{error}</p>}
          <button className="btn btn-primary" disabled={!escrito} onClick={() => { setError(null); guardar(escrito); setPin(escrito) }}>Entrar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="lba-pagina">
      <header className="lba-pagina-head">
        <h1 className="page-title">Envíos Right · Buenos Aires</h1>
        <button className="lba-salir" onClick={() => { guardar(null); setPin(null); setEscrito('') }}>Salir</button>
      </header>
      <EnviosBA
        acceso={{ pin }}
        onSinAcceso={m => { guardar(null); setPin(null); setEscrito(''); setError(m) }}
      />
    </div>
  )
}
