import { useState, useEffect } from 'react'
import type { ActivePage, Modelo, PhotoSlot, TalleRow } from './types'
import { Layout, SOLO_DUENO } from './components/Layout/Layout'
import { Login } from './components/Login/Login'
import { useAuth } from './hooks/useAuth'
import { Modal } from './components/Modal/Modal'
import { ModelGrid } from './components/ModelGrid/ModelGrid'
import { ModelForm } from './components/ModelForm/ModelForm'
import { SellModal } from './components/SellModal/SellModal'
import { CartModal } from './components/CartModal/CartModal'
import { VentaEnCurso } from './components/VentaEnCurso/VentaEnCurso'
import { ClientesLocales } from './components/ClientesLocales/ClientesLocales'
import { IngresoPage } from './components/IngresoPage/IngresoPage'
import { DeleteConfirm } from './components/DeleteConfirm/DeleteConfirm'
import { PriceHistoryModal } from './components/PriceHistoryModal/PriceHistoryModal'
import { PhotoSearch } from './components/PhotoSearch/PhotoSearch'
import { TiendaNubeImport } from './components/TiendaNubeImport/TiendaNubeImport'
import { ImportFotos } from './components/ImportFotos/ImportFotos'
import { ImportExcel } from './components/ImportExcel/ImportExcel'
import { Dashboard } from './components/Dashboard/Dashboard'
import { VentasHistory } from './components/VentasHistory/VentasHistory'
import { Configuracion } from './components/Configuracion/Configuracion'
import { StockAvanzado } from './components/StockAvanzado/StockAvanzado'
import { Carpetas } from './components/Carpetas/Carpetas'
import { Seguimientos } from './components/Seguimientos/Seguimientos'
import { TNDashboard } from './components/TNDashboard/TNDashboard'
import { TNAnalytics } from './components/TNAnalytics/TNAnalytics'
import { TNOrdenes } from './components/TNOrdenes/TNOrdenes'
import { TNProductos } from './components/TNProductos/TNProductos'
import { TNClientes } from './components/TNClientes/TNClientes'
import { TNCupones } from './components/TNCupones/TNCupones'
import { TNMails } from './components/TNMails/TNMails'
import { Rentabilidad } from './components/Rentabilidad/Rentabilidad'
import { useModelos } from './hooks/useModelos'
import { useTNSync } from './hooks/useTNSync'
import { useCarrito } from './hooks/useCarrito'
import { useClientesLocales } from './hooks/useClientesLocales'
import { AiChat } from './components/AiChat/AiChat'
import './App.css'

const ACCENT_KEY = 'rb_accent'
const ACCENTS = [
  { value: '#00d46a', hover: '#00b559', dim: 'rgba(0,212,106,0.12)' },
  { value: '#ff6b00', hover: '#e05f00', dim: 'rgba(255,107,0,0.12)' },
  { value: '#3b82f6', hover: '#2563eb', dim: 'rgba(59,130,246,0.12)' },
  { value: '#8b5cf6', hover: '#7c3aed', dim: 'rgba(139,92,246,0.12)' },
  { value: '#ef4444', hover: '#dc2626', dim: 'rgba(239,68,68,0.12)' },
]

function restoreAccent() {
  try {
    const saved = localStorage.getItem(ACCENT_KEY)
    if (!saved) return
    const found = ACCENTS.find(a => a.value === saved)
    if (!found) return
    const root = document.documentElement
    root.style.setProperty('--accent', found.value)
    root.style.setProperty('--accent-hover', found.hover)
    root.style.setProperty('--accent-dim', found.dim)
  } catch { /* noop */ }
}

export function App() {
  const { role, loginEmpleado, loginDueno, logout } = useAuth()
  const [activePage, setActivePage] = useState<ActivePage>('stock')

  useEffect(() => { restoreAccent() }, [])

  // Si el rol cambia (ej: se pierde el acceso dueño) y la página activa quedó
  // en una sección restringida, volvemos a stock.
  useEffect(() => {
    if (role !== 'dueno' && SOLO_DUENO.includes(activePage)) setActivePage('stock')
  }, [role, activePage])

  const {
    modelos, loading, reload,
    addModelo, editModelo, removeModelo, venderCarrito, ingresarStockBatch, clearAll,
  } = useModelos()

  const {
    syncNow: syncTNNow,
    syncing: syncingTN,
    progress: tnProgress,
    lastResult: tnLastResult,
    lastSyncAt: tnLastSyncAt,
  } = useTNSync(reload)

  const carrito = useCarrito()
  const clientesLocales = useClientesLocales()
  const [showCart, setShowCart] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Modelo | null>(null)
  const [sellTarget, setSellTarget] = useState<Modelo | null>(null)
  const [ingresoTarget, setIngresoTarget] = useState<Modelo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Modelo | null>(null)
  const [priceHistoryTarget, setPriceHistoryTarget] = useState<Modelo | null>(null)
  const [showPhotoSearch, setShowPhotoSearch] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showImportFotos, setShowImportFotos] = useState(false)
  const [showImportExcel, setShowImportExcel] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  const handleAdd = () => { setEditTarget(null); setShowForm(true) }
  const handleEdit = (m: Modelo) => { setEditTarget(m); setShowForm(true) }

  const handleSave = async (
    data: Omit<Modelo, 'id' | 'created_at' | 'modelo_talles' | 'modelo_fotos'>,
    photos: PhotoSlot[],
    toDeleteFotoIds: string[],
    talleRows: TalleRow[],
    tnCategoryId: number | null
  ) => {
    if (editTarget) {
      await editModelo(editTarget.id, data, photos, toDeleteFotoIds, talleRows)
    } else {
      await addModelo(data, photos, talleRows, tnCategoryId)
    }
  }

  if (!role) {
    return <Login onLoginEmpleado={loginEmpleado} onLoginDueno={loginDueno} />
  }

  return (
    <Layout activePage={activePage} onNavigate={setActivePage} role={role} onLogout={logout}>
      {activePage === 'stock' && (
        ingresoTarget ? (
          <IngresoPage
            modelo={ingresoTarget}
            onCancel={() => setIngresoTarget(null)}
            onSave={(changes, newTalle, costoTotal) =>
              ingresarStockBatch(ingresoTarget.id, changes, newTalle, costoTotal)
                .then(() => setIngresoTarget(null))
            }
          />
        ) : (
          <ModelGrid
            modelos={modelos}
            loading={loading}
            onSell={setSellTarget}
            onEdit={handleEdit}
            onDelete={setDeleteTarget}
            onIngreso={setIngresoTarget}
            onPriceHistory={setPriceHistoryTarget}
            onAdd={handleAdd}
            onPhotoSearch={() => setShowPhotoSearch(true)}
            onImport={() => setShowImport(true)}
            onImportFotos={() => setShowImportFotos(true)}
            onImportExcel={() => setShowImportExcel(true)}
            onClearAll={() => setShowClearConfirm(true)}
            onSyncTN={syncTNNow}
            syncingTN={syncingTN}
            tnProgress={tnProgress}
            tnLastResult={tnLastResult}
            tnLastSyncAt={tnLastSyncAt}
          />
        )
      )}

      {activePage === 'carpetas' && <Carpetas modelos={modelos} />}
      {activePage === 'clientes_locales' && (
        <ClientesLocales
          clientes={clientesLocales.clientes}
          loading={clientesLocales.loading}
          addCliente={clientesLocales.addCliente}
          editCliente={clientesLocales.editCliente}
          removeCliente={clientesLocales.removeCliente}
        />
      )}
      {activePage === 'dashboard' && <Dashboard />}
      {activePage === 'ventas' && <VentasHistory />}
      {activePage === 'seguimientos' && <Seguimientos />}
      {activePage === 'stock_avanzado' && (
        <div className="config-page">
          <div className="page-header">
            <h1 className="page-title">Stock avanzado</h1>
          </div>
          <StockAvanzado modelos={modelos} onReload={reload} />
        </div>
      )}
      {activePage === 'configuracion' && role === 'dueno' && <Configuracion modelos={modelos} onReload={reload} />}

      {activePage === 'tn_dashboard' && <TNDashboard />}
      {activePage === 'tn_analytics' && <TNAnalytics />}
      {activePage === 'tn_ordenes'   && <TNOrdenes />}
      {activePage === 'tn_productos' && <TNProductos />}
      {activePage === 'tn_clientes'  && <TNClientes />}
      {activePage === 'tn_cupones'   && <TNCupones />}
      {activePage === 'tn_mails'     && <TNMails />}
      {activePage === 'rentabilidad' && role === 'dueno' && <Rentabilidad />}

      <ModelForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
        initial={editTarget}
      />

      <SellModal
        modelo={sellTarget}
        onClose={() => setSellTarget(null)}
        onAdd={(modelo, talle, cantidad) => carrito.addItem(modelo, talle, cantidad)}
      />

      <CartModal
        isOpen={showCart}
        onClose={() => setShowCart(false)}
        items={carrito.items}
        clear={carrito.clear}
        clientes={clientesLocales.clientes}
        addCliente={clientesLocales.addCliente}
        onSell={venderCarrito}
      />

      <VentaEnCurso
        items={carrito.items}
        subtotal={carrito.subtotal}
        onAddMore={() => setActivePage('stock')}
        onStartPayment={() => setShowCart(true)}
        onCancelSale={carrito.clear}
      />

      <DeleteConfirm
        modelo={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeModelo}
      />

      <PriceHistoryModal
        modelo={priceHistoryTarget}
        onClose={() => setPriceHistoryTarget(null)}
      />

      <PhotoSearch
        isOpen={showPhotoSearch}
        onClose={() => setShowPhotoSearch(false)}
        modelos={modelos}
        onSelectModelo={m => { setShowPhotoSearch(false); handleEdit(m) }}
      />

      <TiendaNubeImport
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={reload}
      />

      <ImportFotos
        isOpen={showImportFotos}
        onClose={() => setShowImportFotos(false)}
        modelos={modelos}
        onDone={reload}
      />

      <ImportExcel
        isOpen={showImportExcel}
        onClose={() => setShowImportExcel(false)}
        modelos={modelos}
        onDone={reload}
      />

      <Modal
        isOpen={showClearConfirm}
        onClose={() => !clearing && setShowClearConfirm(false)}
        title="Borrar todo el stock"
        maxWidth="400px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Esto va a eliminar los <strong style={{ color: 'var(--text-primary)' }}>{modelos.length} modelo{modelos.length !== 1 ? 's' : ''}</strong> del stock y todas sus fotos. Esta acción <strong style={{ color: 'var(--danger)' }}>no se puede deshacer</strong>.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setShowClearConfirm(false)} disabled={clearing}>Cancelar</button>
            <button className="btn btn-danger" disabled={clearing} onClick={async () => {
              setClearing(true)
              try { await clearAll(); setShowClearConfirm(false) }
              finally { setClearing(false) }
            }}>
              {clearing ? 'Borrando...' : 'Sí, borrar todo'}
            </button>
          </div>
        </div>
      </Modal>
      <AiChat onReload={reload} />
    </Layout>
  )
}
