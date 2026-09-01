import { useState } from 'react'
import type { Modelo } from '../../types'
import { Modal } from '../Modal/Modal'
import { reponerStockLocal } from '../../services/modelos'
import './ReponerStock.css'

interface ReponerStockProps {
  modelo: Modelo | null
  onClose: () => void
  onDone: () => void
}

// Mover pares del depósito al local para reponer el mostrador. No es un
// ingreso de mercadería nueva (eso sigue siendo "+ Stock") — es mover algo
// que ya está contado en el total, del depósito al local.
export function ReponerStock({ modelo, onClose, onDone }: ReponerStockProps) {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!modelo) return null

  const handleReponer = async (talleId: string, disponible: number) => {
    const n = Number(valores[talleId])
    if (!(n > 0) || n > disponible) return
    setError(null)
    setEnviando(talleId)
    try {
      await reponerStockLocal(talleId, n)
      setValores(v => ({ ...v, [talleId]: '' }))
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(null)
    }
  }

  return (
    <Modal isOpen={!!modelo} onClose={onClose} title="Reponer stock en el local" maxWidth="480px">
      <div className="sell-modal">
        <div className="sell-product-info">
          <div>
            <p className="sell-marca">{modelo.marca}</p>
            <p className="sell-modelo">{modelo.modelo}</p>
          </div>
        </div>

        <p className="reponer-hint">
          Mové pares del depósito al local — no suma stock nuevo, solo mueve lo que ya tenés cargado.
        </p>

        {modelo.modelo_talles.length === 0 ? (
          <p className="reponer-hint">Este modelo no tiene talles cargados.</p>
        ) : (
          <div className="reponer-lista">
            {modelo.modelo_talles.map(t => {
              const disponible = Math.max(0, t.cantidad - (t.cantidad_local ?? 0))
              const valor = valores[t.id] ?? ''
              const valorNum = Number(valor)
              const esValido = valor !== '' && valorNum > 0 && valorNum <= disponible
              return (
                <div key={t.id} className="reponer-fila">
                  <div className="reponer-talle">
                    <span className="reponer-talle-arg">{t.talle_arg}</span>
                    <span className="reponer-talle-detalle">
                      {t.cantidad_local ?? 0} en el local · {disponible} en depósito
                    </span>
                  </div>
                  <div className="reponer-accion">
                    <input
                      type="number" min={0} max={disponible}
                      className="reponer-input"
                      placeholder="0"
                      disabled={disponible === 0 || enviando === t.id}
                      value={valor}
                      onChange={e => setValores(v => ({ ...v, [t.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && esValido && handleReponer(t.id, disponible)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!esValido || enviando === t.id}
                      onClick={() => handleReponer(t.id, disponible)}
                    >
                      {enviando === t.id ? 'Moviendo...' : 'Reponer'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && <p className="sell-error">{error}</p>}

        <div className="sell-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </Modal>
  )
}
