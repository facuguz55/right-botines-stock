import { useCallback, useEffect, useRef, useState } from 'react'
import { Link2, Search, ShoppingBag, User, Calendar, Loader2 } from 'lucide-react'
import { fetchCrmCliente, linkClienteLocal, fetchHistorialCompras } from '../../../services/crmClients'
import { supabase } from '../../../lib/supabase'
import type { WspConversacion, CrmCliente } from '../../../types/crm'
import type { ClienteLocal } from '../../../types'
import './ClientCard.css'

interface ClientCardProps {
  conversacion: WspConversacion
  onLinkCliente: (clienteLocalId: string) => void
  onUpdateNotas: (notas: string) => void
}

export function ClientCard({ conversacion, onLinkCliente, onUpdateNotas }: ClientCardProps) {
  const [cliente, setCliente] = useState<CrmCliente | null>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notas, setNotas] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ClienteLocal[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const notasRef = useRef<HTMLTextAreaElement>(null)

  const loadCliente = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCrmCliente(conversacion.id)
      setCliente(data)
      setNotas(data?.notas || '')
      if (data?.cliente_local_id) {
        const compras = await fetchHistorialCompras(data.cliente_local_id)
        setHistorial(compras)
      } else {
        setHistorial([])
      }
    } catch (err) {
      console.error('Error cargando cliente:', err)
    } finally {
      setLoading(false)
    }
  }, [conversacion.id])

  useEffect(() => { loadCliente() }, [loadCliente])

  async function handleNotasBlur() {
    if (!cliente) return
    const trimmed = notas.trim()
    if (trimmed === (cliente.notas || '').trim()) return
    onUpdateNotas(trimmed)
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const { data } = await supabase
        .from('clientes_locales')
        .select('*')
        .or(`telefono.ilike.%${searchQuery}%,dni.ilike.%${searchQuery}%,nombre.ilike.%${searchQuery}%`)
        .limit(5)
      setSearchResults(data || [])
    } catch (err) {
      console.error('Error buscando clientes:', err)
    } finally {
      setSearching(false)
    }
  }

  async function handleLink(clienteLocalId: string) {
    if (!cliente) return
    try {
      await linkClienteLocal(cliente.id, clienteLocalId)
      onLinkCliente(clienteLocalId)
      setShowSearch(false)
      setSearchQuery('')
      setSearchResults([])
      await loadCliente()
    } catch (err) {
      console.error('Error vinculando cliente:', err)
    }
  }

  const createdDate = new Date(conversacion.created_at).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  if (loading) {
    return (
      <div className="client-card">
        <div className="client-card-loading">
          <Loader2 className="client-card-spin" size={20} />
        </div>
      </div>
    )
  }

  return (
    <div className="client-card">
      <div className="client-card-section">
        <div className="client-card-avatar">
          <User size={20} />
        </div>
        <h3 className="client-card-name">
          {conversacion.nombre || 'Sin nombre'}
        </h3>
        {conversacion.telefono && (
          <span className="client-card-phone">{conversacion.telefono}</span>
        )}
      </div>

      <div className="client-card-divider" />

      <div className="client-card-section">
        <div className="client-card-row">
          <Link2 size={14} />
          <span className="client-card-label">Cliente vinculado</span>
        </div>
        {cliente?.clientes_locales ? (
          <div className="client-card-linked">
            <span className="client-card-linked-name">
              {cliente.clientes_locales.nombre}
            </span>
            {cliente.clientes_locales.dni && (
              <span className="client-card-linked-detail">
                DNI: {cliente.clientes_locales.dni}
              </span>
            )}
          </div>
        ) : (
          <div className="client-card-unlinked">
            {showSearch ? (
              <div className="client-card-search">
                <div className="client-card-search-input">
                  <input
                    type="text"
                    placeholder="Buscar por nombre, tel o DNI..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                  />
                  <button onClick={handleSearch} disabled={searching}>
                    {searching ? <Loader2 className="client-card-spin" size={14} /> : <Search size={14} />}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="client-card-search-results">
                    {searchResults.map(cl => (
                      <button
                        key={cl.id}
                        className="client-card-search-result"
                        onClick={() => handleLink(cl.id)}
                      >
                        <span>{cl.nombre}</span>
                        {cl.telefono && <span className="client-card-search-sub">{cl.telefono}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="client-card-cancel-search"
                  onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                className="client-card-link-btn"
                onClick={() => setShowSearch(true)}
              >
                <Link2 size={14} /> Vincular cliente
              </button>
            )}
          </div>
        )}
      </div>

      {historial.length > 0 && (
        <>
          <div className="client-card-divider" />
          <div className="client-card-section">
            <div className="client-card-row">
              <ShoppingBag size={14} />
              <span className="client-card-label">Historial de compras</span>
            </div>
            <div className="client-card-purchases">
              {historial.map((v: any) => (
                <div key={v.id} className="client-card-purchase">
                  <span className="client-card-purchase-model">
                    {v.modelos?.marca} {v.modelos?.modelo}
                  </span>
                  <span className="client-card-purchase-date">
                    {new Date(v.fecha).toLocaleDateString('es-AR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="client-card-divider" />

      <div className="client-card-section">
        <span className="client-card-label">Notas</span>
        <textarea
          ref={notasRef}
          className="client-card-notas"
          value={notas}
          onChange={e => setNotas(e.target.value)}
          onBlur={handleNotasBlur}
          placeholder="Agregar notas sobre este cliente..."
          rows={3}
        />
      </div>

      <div className="client-card-divider" />

      <div className="client-card-section client-card-meta">
        <Calendar size={12} />
        <span>Desde {createdDate}</span>
      </div>
    </div>
  )
}
