import { useState, useEffect, lazy, Suspense } from 'react'
import type { ActivePage, Modelo, PhotoSlot, TalleRow } from './types'
import { Layout, SOLO_DUENO } from './components/Layout/Layout'
import { Login } from './components/Login/Login'
import { AperturaCajaGate } from './components/AperturaCajaGate/AperturaCajaGate'
import { useAuth } from './hooks/useAuth'
import { Modal } from './components/Modal/Modal'
import { ModelGrid } from './components/ModelGrid/ModelGrid'
import { ModelForm } from './components/ModelForm/ModelForm'
import { SellModal } from './components/SellModal/SellModal'
import { CartModal } from './components/CartModal/CartModal'
import { VentaEnCurso } from './components/VentaEnCurso/VentaEnCurso'
import { IngresoPage } from './components/IngresoPage/IngresoPage'
import { DeleteConfirm } from './components/DeleteConfirm/DeleteConfirm'
import { PriceHistoryModal } from './components/PriceHistoryModal/PriceHistoryModal'
import { ReponerStock } from './components/ReponerStock/ReponerStock'
import { useModelos } from './hooks/useModelos'

// Páginas y modales que no hacen falta en la primera pantalla (Stock): se
// cargan sólo cuando el usuario navega a esa sección o abre ese modal, en
// vez de venir todas juntas en el bundle inicial. No cambia en nada lo que
// ve el usuario — React.lazy + Suspense muestra el mismo contenido apenas
// termina de bajar el chunk, solo que ese chunk no bloquea el primer paint.
const ClientesLocales = lazy(() => import('./components/ClientesLocales/ClientesLocales').then(m => ({ default: m.ClientesLocales })))
const PhotoSearch = lazy(() => import('./components/PhotoSearch/PhotoSearch').then(m => ({ default: m.PhotoSearch })))
const TiendaNubeImport = lazy(() => import('./components/TiendaNubeImport/TiendaNubeImport').then(m => ({ default: m.TiendaNubeImport })))
const ImportFotos = lazy(() => import('./components/ImportFotos/ImportFotos').then(m => ({ default: m.ImportFotos })))
const ImportExcel = lazy(() => import('./components/ImportExcel/ImportExcel').then(m => ({ default: m.ImportExcel })))
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard').then(m => ({ default: m.Dashboard })))
const VentasHistory = lazy(() => import('./components/VentasHistory/VentasHistory').then(m => ({ default: m.VentasHistory })))
const Configuracion = lazy(() => import('./components/Configuracion/Configuracion').then(m => ({ default: m.Configuracion })))
const StockAvanzado = lazy(() => import('./components/StockAvanzado/StockAvanzado').then(m => ({ default: m.StockAvanzado })))
const Carpetas = lazy(() => import('./components/Carpetas/Carpetas').then(m => ({ default: m.Carpetas })))
const Seguimientos = lazy(() => import('./components/Seguimientos/Seguimientos').then(m => ({ default: m.Seguimientos })))
const TNDashboard = lazy(() => import('./components/TNDashboard/TNDashboard').then(m => ({ default: m.TNDashboard })))
const TNAnalytics = lazy(() => import('./components/TNAnalytics/TNAnalytics').then(m => ({ default: m.TNAnalytics })))
const TNOrdenes = lazy(() => import('./components/TNOrdenes/TNOrdenes').then(m => ({ default: m.TNOrdenes })))
const TNPreventa = lazy(() => import('./components/TNPreventa/TNPreventa').then(m => ({ default: m.TNPreventa })))
const TNClientes = lazy(() => import('./components/TNClientes/TNClientes').then(m => ({ default: m.TNClientes })))
const TNCupones = lazy(() => import('./components/TNCupones/TNCupones').then(m => ({ default: m.TNCupones })))
const TNMails = lazy(() => import('./components/TNMails/TNMails').then(m => ({ default: m.TNMails })))
const Rentabilidad = lazy(() => import('./components/Rentabilidad/Rentabilidad').then(m => ({ default: m.Rentabilidad })))
const Empleados = lazy(() => import('./components/Empleados/Empleados').then(m => ({ default: m.Empleados })))
const MisHoras = lazy(() => import('./components/MisHoras/MisHoras').then(m => ({ default: m.MisHoras })))
const Caja = lazy(() => import('./components/Caja/Caja').then(m => ({ default: m.Caja })))
const Proveedores = lazy(() => import('./components/Proveedores/Proveedores').then(m => ({ default: m.Proveedores })))
const Devoluciones = lazy(() => import('./components/Devoluciones/Devoluciones').then(m => ({ default: m.Devoluciones })))
const CrmInbox = lazy(() => import('./components/CRM/CrmInbox/CrmInbox'))
const CrmDashboard = lazy(() => import('./components/CRM/CrmDashboard/CrmDashboard').then(m => ({ default: m.CrmDashboard })))
const PhotoSender = lazy(() => import('./components/CRM/PhotoSender/PhotoSender').then(m => ({ default: m.PhotoSender })))
const AiChat = lazy(() => import('./components/AiChat/AiChat').then(m => ({ default: m.AiChat })))
import { usePreloadFirstPhotos } from './hooks/usePreloadFirstPhotos'
import { useTNSync } from './hooks/useTNSync'
import { useCarrito } from './hooks/useCarrito'
import { useRecargosTarjeta } from './hooks/useRecargosTarjeta'
import { useClientesLocales } from './hooks/useClientesLocales'
import { useEmpleados } from './hooks/useEmpleados'
import { useProveedores } from './hooks/useProveedores'
import { useFichajeActual } from './hooks/useFichajeActual'
import { fetchConfiguracionFichajes } from './services/configuracionFichajes'
import { cerrarFichajesVencidos } from './services/fichajes'
import { cerrarCajaPorCorteDeTurno } from './services/caja'
import { FeedbackButton } from './components/FeedbackButton/FeedbackButton'
import { setupGlobalErrorHandler } from './services/errorReporter'
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
  const { role, empleadoId, empleadoNombre, loginEmpleado, loginAtencion, loginDueno, logout } = useAuth()
  const [activePage, setActivePage] = useState<ActivePage>(() => {
    try {
      // Mismo fallback a localStorage que useAuth.ts (sesión heredada de antes
      // de que la sesión pasara a sessionStorage) — no perder el destino
      // inicial correcto para quien ya estaba logueado como "atencion".
      const savedRole = sessionStorage.getItem('rb_role') ?? localStorage.getItem('rb_role')
      return savedRole === 'atencion' ? 'crm_inbox' : 'stock'
    } catch { return 'stock' }
  })
  const [configTabInicial, setConfigTabInicial] = useState<'general' | 'tiendanube' | 'seguridad' | 'costos'>('general')

  useEffect(() => { restoreAccent() }, [])
  useEffect(() => { setupGlobalErrorHandler() }, [])

  // Barrido de fichajes abandonados y corte de turno (ej. mediodía): cierra
  // fichajes de días anteriores, fichajes de hoy vencidos, y si corresponde
  // corta la caja abierta en la hora de corte configurada — así el turno
  // siguiente no hereda el efectivo acumulado del anterior (ver
  // services/fichajes.ts y services/caja.ts). Corre al abrir la app y cada
  // 5 minutos mientras sigue abierta (la app suele quedar prendida todo el
  // día en el mostrador, así que no alcanza con correr una sola vez al
  // cargar); no depende de ningún cron.
  useEffect(() => {
    const barrer = () => {
      fetchConfiguracionFichajes()
        .then(async cfg => {
          await cerrarFichajesVencidos(cfg.hora_limite_cierre, cfg.horas_maximas_turno, cfg.hora_corte_turno)
          await cerrarCajaPorCorteDeTurno(cfg.hora_corte_turno)
        })
        .catch(() => { /* no bloquea el arranque de la app si falla */ })
    }
    barrer()
    const id = setInterval(barrer, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Si el rol cambia (ej: se pierde el acceso dueño) y la página activa quedó
  // en una sección restringida, volvemos a stock.
  useEffect(() => {
    if (role !== 'dueno' && SOLO_DUENO.includes(activePage)) setActivePage('stock')
  }, [role, activePage])

  const {
    modelos, loading, reload,
    addModelo, editModelo, removeModelo, venderCarrito, ingresarStockBatch, clearAll,
  } = useModelos()

  const photosReady = usePreloadFirstPhotos(modelos, loading)

  const {
    syncNow: syncTNNow,
    syncing: syncingTN,
    progress: tnProgress,
    lastResult: tnLastResult,
    lastSyncAt: tnLastSyncAt,
  } = useTNSync(reload)

  const recargosTarjeta = useRecargosTarjeta()
  const carrito = useCarrito()
  const clientesLocales = useClientesLocales()
  const empleadosHook = useEmpleados()
  const proveedoresHook = useProveedores()
  const fichajeActual = useFichajeActual(empleadoId)
  const [showCart, setShowCart] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Modelo | null>(null)
  const [sellTarget, setSellTarget] = useState<Modelo | null>(null)
  const [ingresoTarget, setIngresoTarget] = useState<Modelo | null>(null)
  const [reponerTarget, setReponerTarget] = useState<Modelo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Modelo | null>(null)
  const [priceHistoryTarget, setPriceHistoryTarget] = useState<Modelo | null>(null)
  const [showPhotoSearch, setShowPhotoSearch] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showImportFotos, setShowImportFotos] = useState(false)
  const [showImportExcel, setShowImportExcel] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [photoSender, setPhotoSender] = useState<{ conversacionId: string; tipo: string | null; talle: number | null } | null>(null)

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
      await editModelo(editTarget.id, data, photos, toDeleteFotoIds, talleRows, tnCategoryId)
    } else {
      await addModelo(data, photos, talleRows, tnCategoryId)
    }
  }

  if (!role) {
    return (
      <Login
        empleados={empleadosHook.empleados.filter(e => e.activo)}
        loadingEmpleados={empleadosHook.loading}
        onLoginEmpleado={loginEmpleado}
        onLoginAtencion={loginAtencion}

        onLoginDueno={loginDueno}
      />
    )
  }

  // El dueño no ficha (puede abrir la caja a mano desde Caja en cualquier
  // momento). Un empleado sin fichaje propio y sin caja abierta es el
  // primero del día: se bloquea todo hasta que abra la caja y fiche entrada
  // en un solo paso.
  if (role === 'empleado' && fichajeActual.loading) {
    return <div className="apertura-gate-loading" />
  }
  if (role === 'empleado' && fichajeActual.requiereApertura) {
    return <AperturaCajaGate empleadoNombre={empleadoNombre} onConfirm={fichajeActual.abrirCajaYFichar} onLogout={logout} />
  }

  // Precarga las primeras fotos del catálogo antes de mostrar la app: así
  // la grilla no aparece con las imágenes "cargándose" en pantalla, que es
  // lo que se siente como que la app se traba apenas se entra.
  if (!photosReady) {
    return (
      <div className="app-preload-screen">
        <div className="spinner" />
        <p>Cargando catálogo...</p>
      </div>
    )
  }

  // El dueño siempre puede vender. Un empleado necesita tener fichada su
  // propia entrada y que haya una caja abierta — cubre el caso de un
  // segundo/tercer empleado que entra a la app sin haber fichado todavía
  // (la caja ya la abrió el primero), y el caso raro de que la caja se haya
  // cerrado mientras seguía con el fichaje abierto.
  // Atención al público no ficha ni depende de la caja (ver useAuth.loginEmpleado).
  const puedeVender = role === 'dueno' || role === 'atencion' || (!!fichajeActual.fichaje && !!fichajeActual.cajaAbierta)
  const motivoBloqueoVenta = puedeVender
    ? null
    : !fichajeActual.fichaje
      ? 'Fichá tu entrada para poder vender.'
      : 'No hay una caja abierta — abrila desde Caja para poder vender.'

  return (
    <Layout activePage={activePage} onNavigate={setActivePage} role={role} empleadoNombre={empleadoNombre} onLogout={logout} fichajeActual={fichajeActual}>
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
            soloVenta={role === 'atencion'}
            puedeVender={puedeVender}
            motivoBloqueoVenta={motivoBloqueoVenta}
            onEdit={handleEdit}
            onDelete={setDeleteTarget}
            onIngreso={setIngresoTarget}
            onReponer={setReponerTarget}
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

      <Suspense fallback={<div className="app-preload-screen"><div className="spinner" /></div>}>
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
      {activePage === 'dashboard' && <Dashboard role={role} />}
      {activePage === 'ventas' && <VentasHistory role={role} />}
      {activePage === 'seguimientos' && <Seguimientos />}
      {activePage === 'stock_avanzado' && (
        <div className="config-page">
          <div className="page-header">
            <h1 className="page-title">Stock avanzado</h1>
          </div>
          <StockAvanzado modelos={modelos} onReload={reload} />
        </div>
      )}
      {activePage === 'configuracion' && role === 'dueno' && (
        <Configuracion modelos={modelos} onReload={reload} tabInicial={configTabInicial} recargosTarjeta={recargosTarjeta} />
      )}
      {activePage === 'empleados' && role === 'dueno' && (
        <Empleados empleadosHook={empleadosHook} />
      )}
      {activePage === 'mis_horas' && role === 'empleado' && (
        <MisHoras empleadoId={empleadoId} />
      )}
      {activePage === 'caja' && (
        <Caja empleadoId={empleadoId} empleadoNombre={empleadoNombre} role={role} />
      )}
      {activePage === 'devoluciones' && (
        <Devoluciones modelos={modelos} empleadoId={empleadoId} />
      )}
      {activePage === 'proveedores' && role === 'dueno' && (
        <Proveedores proveedoresHook={proveedoresHook} modelos={modelos} empleadoId={empleadoId} />
      )}

      {activePage === 'tn_dashboard' && <TNDashboard />}
      {activePage === 'tn_analytics' && <TNAnalytics />}
      {activePage === 'tn_ordenes'   && <TNOrdenes empleadoId={empleadoId} />}
      {activePage === 'tn_preventa'  && <TNPreventa />}
      {activePage === 'tn_clientes'  && <TNClientes />}
      {activePage === 'tn_cupones'   && <TNCupones />}
      {activePage === 'tn_mails'     && <TNMails />}
      {activePage === 'rentabilidad' && role === 'dueno' && (
        <Rentabilidad onConfigurarCostos={() => { setConfigTabInicial('costos'); setActivePage('configuracion') }} />
      )}

      {activePage === 'crm_inbox' && (
        <CrmInbox
          empleadoId={empleadoId}
          onOpenPhotoSender={(conversacionId: string, tipo: string | null, talle: number | null) => setPhotoSender({ conversacionId, tipo, talle })}
          onCreateVenta={() => {}}
          onSendMpLink={() => {}}
        />
      )}
      {activePage === 'crm_dashboard' && role === 'dueno' && <CrmDashboard />}
      </Suspense>

      <ModelForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
        initial={editTarget}
      />

      <SellModal
        modelo={sellTarget}
        onClose={() => setSellTarget(null)}
        onAdd={(modelo, talle, cantidad, precioManual) => carrito.addItem(modelo, talle, cantidad, precioManual)}
      />

      <CartModal
        isOpen={showCart}
        onClose={() => setShowCart(false)}
        items={carrito.items}
        recargos={recargosTarjeta.recargos}
        clear={carrito.clear}
        clientes={clientesLocales.clientes}
        addCliente={clientesLocales.addCliente}
        onSell={(items, medioPago, clienteId, tarjeta, cuotas, recargoPct, montoEfectivo, montoTransferencia, montoRecibidoEfectivo, vueltoEfectivo) =>
          venderCarrito(
            items, medioPago, clienteId, tarjeta, cuotas, recargoPct, empleadoId,
            montoEfectivo, montoTransferencia, montoRecibidoEfectivo, vueltoEfectivo,
          )}
      />

      <VentaEnCurso
        items={carrito.items}
        subtotal={carrito.subtotal}
        onAddMore={() => setActivePage('stock')}
        onStartPayment={() => setShowCart(true)}
        onCancelSale={carrito.clear}
        puedeVender={puedeVender}
        motivoBloqueoVenta={motivoBloqueoVenta}
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

      <ReponerStock
        modelo={reponerTarget ? modelos.find(m => m.id === reponerTarget.id) ?? null : null}
        onClose={() => setReponerTarget(null)}
        onDone={reload}
      />

      {/* Estos 4 modales solo se montan (y por lo tanto solo bajan su chunk)
          la primera vez que se abren, no en la carga inicial de Stock. */}
      <Suspense fallback={null}>
        {showPhotoSearch && (
          <PhotoSearch
            isOpen={showPhotoSearch}
            onClose={() => setShowPhotoSearch(false)}
            modelos={modelos}
            onSelectModelo={m => { setShowPhotoSearch(false); handleEdit(m) }}
          />
        )}

        {showImport && (
          <TiendaNubeImport
            isOpen={showImport}
            onClose={() => setShowImport(false)}
            onImported={reload}
          />
        )}

        {showImportFotos && (
          <ImportFotos
            isOpen={showImportFotos}
            onClose={() => setShowImportFotos(false)}
            modelos={modelos}
            onDone={reload}
          />
        )}

        {showImportExcel && (
          <ImportExcel
            isOpen={showImportExcel}
            onClose={() => setShowImportExcel(false)}
            modelos={modelos}
            onDone={reload}
          />
        )}
      </Suspense>

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
      <Suspense fallback={null}>
        {photoSender && (
          <PhotoSender
            isOpen={true}
            onClose={() => setPhotoSender(null)}
            tipo={photoSender.tipo}
            talle={photoSender.talle}
            conversacionId={photoSender.conversacionId}
            empleadoId={empleadoId}
            onSendPhotos={async () => { setPhotoSender(null) }}
          />
        )}
        <AiChat onReload={reload} />
      </Suspense>
      <FeedbackButton />
    </Layout>
  )
}
