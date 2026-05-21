import { useState } from 'react'
import { ShoppingBag, Key, Store, ExternalLink, Check } from 'lucide-react'
import { saveTNCredentials } from '../../services/tiendanubeService'
import './TNSetup.css'

interface TNSetupProps {
  onConfigured: () => void
}

export function TNSetup({ onConfigured }: TNSetupProps) {
  const [storeId, setStoreId] = useState('')
  const [token, setToken]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const handleSave = async () => {
    if (!storeId.trim() || !token.trim()) {
      setError('Completá ambos campos para continuar.')
      return
    }
    setSaving(true)
    setError('')
    try {
      saveTNCredentials(storeId.trim(), token.trim())
      onConfigured()
    } catch {
      setError('Hubo un error al guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tn-setup">
      <div className="tn-setup-card">
        <div className="tn-setup-icon">
          <ShoppingBag size={32} />
        </div>
        <h1 className="tn-setup-title">Conectar TiendaNube</h1>
        <p className="tn-setup-desc">
          Ingresá tus credenciales de API de TiendaNube para ver métricas, gestionar órdenes, productos y clientes desde acá.
        </p>

        <div className="tn-setup-steps">
          <div className="tn-setup-step">
            <span className="tn-step-num">1</span>
            <span>Entrá a tu panel de TiendaNube →{' '}
              <a href="https://www.tiendanube.com/admin/apps" target="_blank" rel="noreferrer">
                Mis aplicaciones <ExternalLink size={11} />
              </a>
            </span>
          </div>
          <div className="tn-setup-step">
            <span className="tn-step-num">2</span>
            <span>Buscá la sección "API tokens" y generá un token</span>
          </div>
          <div className="tn-setup-step">
            <span className="tn-step-num">3</span>
            <span>Copiá tu ID de tienda (un número de 7-8 dígitos) y el token</span>
          </div>
        </div>

        <div className="tn-setup-form">
          <div className="form-group">
            <label><Store size={12} /> ID de tienda</label>
            <input
              type="text"
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              placeholder="Ej: 1234567"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label><Key size={12} /> Token de acceso</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Pegá tu token acá"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          {error && <p className="tn-setup-error">{error}</p>}

          <button
            className="btn btn-primary tn-setup-btn"
            onClick={handleSave}
            disabled={saving || !storeId || !token}
          >
            {saving ? 'Conectando...' : <><Check size={15} /> Conectar TiendaNube</>}
          </button>
        </div>

        <p className="tn-setup-note">
          Las credenciales se guardan solo en este dispositivo.
        </p>
      </div>
    </div>
  )
}
