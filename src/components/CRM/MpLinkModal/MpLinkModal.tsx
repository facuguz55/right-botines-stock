import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '../../Modal/Modal'
import './MpLinkModal.css'

interface MpLinkModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (mensaje: string) => Promise<void>
}

// Arma un link de pago de Mercado Pago (api/crm-mp-link, que ya pegaba a la
// preferencia de MP pero nadie lo llamaba desde el frontend) y lo manda como
// mensaje de texto al chat — reusa el mismo envío por WhatsApp que cualquier
// otro mensaje, así queda en el historial y sale por la API real.
export function MpLinkModal({ isOpen, onClose, onSend }: MpLinkModalProps) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    if (loading) return
    setConcepto('')
    setMonto('')
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const price = Number(monto.replace(',', '.'))
    if (!concepto.trim() || !price || price <= 0) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/crm-mp-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: concepto.trim(), price }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.link) {
        throw new Error(data?.error?.message || data?.error || 'No se pudo generar el link de pago')
      }
      const mensaje = `Te paso el link para pagar ${concepto.trim()} ($${price.toLocaleString('es-AR')}):\n${data.link}`
      await onSend(mensaje)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el link de pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Mandar link de pago" maxWidth="400px">
      <form className="mp-link-form" onSubmit={handleSubmit}>
        <label className="mp-link-field">
          <span>Concepto</span>
          <input
            type="text"
            placeholder="Ej: Par Nike Mercurial talle 42"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="mp-link-field">
          <span>Monto (ARS)</span>
          <input
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            placeholder="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
        </label>
        {error && <p className="mp-link-error">{error}</p>}
        <div className="mp-link-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Loader2 size={16} className="mp-link-spinner" /> : 'Generar y mandar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
