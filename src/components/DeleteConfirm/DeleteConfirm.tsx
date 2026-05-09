import type { Modelo } from '../../types'
import { Modal } from '../Modal/Modal'

interface DeleteConfirmProps {
  modelo: Modelo | null
  onClose: () => void
  onConfirm: (id: string) => Promise<void>
}

export function DeleteConfirm({ modelo, onClose, onConfirm }: DeleteConfirmProps) {
  const handleConfirm = async () => {
    if (!modelo) return
    await onConfirm(modelo.id)
    onClose()
  }
  return (
    <Modal isOpen={!!modelo} onClose={onClose} title="Eliminar modelo" maxWidth="380px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          ¿Seguro que querés eliminar <strong style={{ color: 'var(--text-primary)' }}>{modelo?.marca} {modelo?.modelo}</strong>? Se eliminan todos los talles y fotos. Esta acción no se puede deshacer.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" onClick={handleConfirm}>Sí, eliminar</button>
        </div>
      </div>
    </Modal>
  )
}
