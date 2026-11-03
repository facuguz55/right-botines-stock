import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Modal } from '../Modal/Modal'
import { crearModeloBA, subirFotoBA } from '../../services/stockBA'

const TALLES = ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']

interface Props {
  isOpen: boolean
  empleadoId: string | null
  verCosto: boolean
  onClose: () => void
  onCreado: () => Promise<void>
}

// Cargar un modelo a mano, sin PDF (ej: llegó mercadería que no vino en un pedido).
export function AltaModeloBA({ isOpen, empleadoId, verCosto, onClose, onCreado }: Props) {
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [costo, setCosto] = useState('')
  const [precio, setPrecio] = useState('')
  const [cant, setCant] = useState<Record<string, string>>({})
  const [foto, setFoto] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputFoto = useRef<HTMLInputElement>(null)

  const talles = TALLES.map(t => ({ talle: t, cantidad: parseInt(cant[t] ?? '', 10) || 0 })).filter(t => t.cantidad > 0)
  const pares = talles.reduce((a, t) => a + t.cantidad, 0)

  const elegirFoto = (f: File | undefined) => {
    if (!f) return
    setFoto(f)
    if (previa) URL.revokeObjectURL(previa)
    setPrevia(URL.createObjectURL(f))
  }

  const limpiar = () => {
    setCodigo(''); setNombre(''); setCosto(''); setPrecio(''); setCant({}); setFoto(null); setError(null)
    if (previa) URL.revokeObjectURL(previa)
    setPrevia(null)
  }

  const guardar = async () => {
    setError(null)
    if (!codigo.trim()) return setError('Poné el código del modelo.')
    if (!nombre.trim()) return setError('Poné el nombre del modelo.')
    if (pares === 0) return setError('Cargá al menos un talle con pares.')
    setGuardando(true)
    try {
      const fotoUrl = foto ? await subirFotoBA(foto, codigo.trim()) : null
      await crearModeloBA({
        codigo: codigo.trim(), descripcion: nombre.trim(),
        costo: costo ? Number(costo) : null, precioVenta: precio ? Number(precio) : null,
        fotoUrl, talles,
      }, empleadoId)
      await onCreado()
      limpiar()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => !guardando && onClose()} title="Agregar modelo a mano" maxWidth="560px">
      <div className="sba-form">
        <button type="button" className="sba-foto-subir" onClick={() => inputFoto.current?.click()}>
          {previa ? <img src={previa} alt="Foto del modelo" /> : <><Camera size={22} /><span>Sacar o subir foto</span></>}
        </button>
        <input ref={inputFoto} type="file" accept="image/*" hidden onChange={e => { elegirFoto(e.target.files?.[0]); e.target.value = '' }} />

        <div className="sba-form-fila">
          <label>Código<input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="1231" inputMode="numeric" /></label>
          <label className="grande">Nombre<input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Phantom fucsia/blanco chulo negro" /></label>
        </div>
        <div className="sba-form-fila">
          {verCosto && <label>Costo ($)<input value={costo} onChange={e => setCosto(e.target.value)} inputMode="decimal" placeholder="69" /></label>}
          <label>Precio de venta ($)<input value={precio} onChange={e => setPrecio(e.target.value)} inputMode="decimal" placeholder="opcional" /></label>
        </div>

        <p className="sba-form-titulo">Pares por talle</p>
        <div className="sba-talles-grid">
          {TALLES.map(t => (
            <label key={t} className={cant[t] ? 'con' : ''}>
              <span>{t}</span>
              <input value={cant[t] ?? ''} onChange={e => setCant({ ...cant, [t]: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="0" />
            </label>
          ))}
        </div>
        <p className="sba-previa-nota">¿Un talle con medio (42.5)? Cargalo después con “Agregar talle” en el modelo.</p>

        {error && <p className="sba-error">{error}</p>}
        <div className="sba-previa-botones">
          <button className="btn btn-secondary" disabled={guardando} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : `Guardar${pares ? ` (${pares} pares)` : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
