import { useState, useMemo } from 'react'
import { MessageCircle, Mail, Plus, Pencil, Trash2 } from 'lucide-react'
import type { ClienteLocal, Venta } from '../../types'
import { useVentas } from '../../hooks/useVentas'
import { filterClientes } from '../../hooks/useClientesLocales'
import { Modal } from '../Modal/Modal'
import './ClientesLocales.css'

type ClienteInput = Omit<ClienteLocal, 'id' | 'created_at'>

interface ClientesLocalesProps {
  clientes: ClienteLocal[]
  loading: boolean
  addCliente: (input: ClienteInput) => Promise<ClienteLocal>
  editCliente: (id: string, updates: Partial<ClienteInput>) => Promise<ClienteLocal>
  removeCliente: (id: string) => Promise<void>
}

const soloDigitos = (s: string) => s.replace(/\D/g, '')

function fmtFecha(fecha: string) {
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function ClientesLocales({ clientes, loading, addCliente, editCliente, removeCliente }: ClientesLocalesProps) {
  const { ventas } = useVentas()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<ClienteLocal | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ClienteLocal | null>(null)
  const [detailTarget, setDetailTarget] = useState<ClienteLocal | null>(null)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const statsByCliente = useMemo(() => {
    const map = new Map<string, { count: number; total: number; ultima: string }>()
    for (const v of ventas) {
      if (!v.cliente_id) continue
      const cur = map.get(v.cliente_id) ?? { count: 0, total: 0, ultima: v.fecha }
      cur.count += 1
      cur.total += v.precio_venta
      if (new Date(v.fecha) > new Date(cur.ultima)) cur.ultima = v.fecha
      map.set(v.cliente_id, cur)
    }
    return map
  }, [ventas])

  const filtered = useMemo(() => filterClientes(clientes, search), [clientes, search])

  const comprasDetalle = useMemo(() => {
    if (!detailTarget) return []
    const rows = ventas.filter(v => v.cliente_id === detailTarget.id)
    const groups = new Map<string, Venta[]>()
    for (const v of rows) {
      const key = v.venta_grupo_id ?? v.id
      const arr = groups.get(key) ?? []
      arr.push(v)
      groups.set(key, arr)
    }
    return [...groups.entries()]
      .map(([grupoId, items]) => ({
        grupoId,
        fecha: items[0].fecha,
        medioPago: items[0].medio_pago,
        total: items.reduce((s, i) => s + i.precio_venta, 0),
        items,
      }))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  }, [ventas, detailTarget])

  const openNew = () => {
    setEditTarget(null)
    setNombre(''); setTelefono(''); setEmail(''); setNotas(''); setFormError(null)
    setShowForm(true)
  }

  const openEdit = (c: ClienteLocal) => {
    setEditTarget(c)
    setNombre(c.nombre); setTelefono(c.telefono ?? ''); setEmail(c.email ?? ''); setNotas(c.notas ?? '')
    setFormError(null)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!nombre.trim()) return setFormError('Ingresá el nombre del cliente')
    if (!telefono.trim() && !email.trim()) return setFormError('Ingresá al menos un teléfono o un email')
    setSaving(true)
    setFormError(null)
    try {
      const input = { nombre: nombre.trim(), telefono: telefono.trim() || null, email: email.trim() || null, notas: notas.trim() || null }
      if (editTarget) await editCliente(editTarget.id, input)
      else await addCliente(input)
      setShowForm(false)
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await removeCliente(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="clientes-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">
            {loading ? 'Cargando...' : `${filtered.length}${filtered.length !== clientes.length ? ` de ${clientes.length}` : ''} cliente${clientes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nuevo cliente</button>
      </div>

      <div className="clientes-search">
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="clientes-loading"><div className="spinner" /><p>Cargando clientes...</p></div>
      ) : filtered.length === 0 ? (
        <div className="clientes-empty"><span>👥</span><p>No hay clientes registrados todavía.</p></div>
      ) : (
        <div className="clientes-table-wrap">
          <table className="clientes-table">
            <thead>
              <tr>
                <th>Nombre</th><th>Teléfono</th><th>Email</th><th>Compras</th><th>Gastado</th><th>Última compra</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const stats = statsByCliente.get(c.id)
                return (
                  <tr key={c.id} className="clientes-row" onClick={() => setDetailTarget(c)}>
                    <td><strong>{c.nombre}</strong></td>
                    <td>
                      {c.telefono ? (
                        <a
                          className="contact-link"
                          href={`https://wa.me/${soloDigitos(c.telefono)}`}
                          target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                        >
                          <MessageCircle size={13} /> {c.telefono}
                        </a>
                      ) : <span className="cell-muted">—</span>}
                    </td>
                    <td>
                      {c.email ? (
                        <a className="contact-link" href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}>
                          <Mail size={13} /> {c.email}
                        </a>
                      ) : <span className="cell-muted">—</span>}
                    </td>
                    <td>{stats?.count ?? 0}</td>
                    <td className="price-cell">${(stats?.total ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                    <td>{stats ? fmtFecha(stats.ultima) : <span className="cell-muted">—</span>}</td>
                    <td className="clientes-actions">
                      <button className="icon-btn" onClick={e => { e.stopPropagation(); openEdit(c) }} aria-label="Editar"><Pencil size={14} /></button>
                      <button className="icon-btn danger" onClick={e => { e.stopPropagation(); setDeleteTarget(c) }} aria-label="Eliminar"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Alta / edición */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editTarget ? 'Editar cliente' : 'Nuevo cliente'} maxWidth="420px">
        <div className="cliente-form">
          <div className="form-group">
            <label>Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div className="form-group">
            <label>Teléfono (WhatsApp)</label>
            <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="11 2345 6789" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@mail.com" />
          </div>
          <div className="form-group">
            <label>Notas</label>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
          </div>
          {formError && <p className="sell-error">{formError}</p>}
          <div className="sell-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      {/* Confirmar borrado */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar cliente" maxWidth="380px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ¿Seguro que querés eliminar a <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget?.nombre}</strong>? Las ventas ya registradas quedan sin cliente asociado.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={handleDelete}>Sí, eliminar</button>
          </div>
        </div>
      </Modal>

      {/* Historial de compras */}
      <Modal isOpen={!!detailTarget} onClose={() => setDetailTarget(null)} title={detailTarget ? `Compras de ${detailTarget.nombre}` : ''} maxWidth="520px">
        {comprasDetalle.length === 0 ? (
          <p className="cart-empty">Este cliente todavía no tiene compras registradas.</p>
        ) : (
          <div className="compras-list">
            {comprasDetalle.map(grupo => (
              <div key={grupo.grupoId} className="compra-ticket">
                <div className="compra-ticket-header">
                  <span>{fmtFecha(grupo.fecha)}</span>
                  <span className="compra-ticket-pago">{grupo.medioPago}</span>
                  <span className="compra-ticket-total">${grupo.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                </div>
                <ul className="compra-ticket-items">
                  {grupo.items.map(v => (
                    <li key={v.id}>
                      {v.modelos ? <>{v.modelos.marca} {v.modelos.modelo}</> : 'Producto eliminado'} · talle {v.talle_arg}
                      <span className="compra-ticket-item-precio">${v.precio_venta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
