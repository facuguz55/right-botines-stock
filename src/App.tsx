import { useState } from 'react'
import type { ActivePage, Modelo, PhotoSlot, TalleRow, MedioPago } from './types'
import { Layout } from './components/Layout/Layout'
import { Modal } from './components/Modal/Modal'
import { ModelGrid } from './components/ModelGrid/ModelGrid'
import { ModelForm } from './components/ModelForm/ModelForm'
import { SellModal } from './components/SellModal/SellModal'
import { IngresoPage } from './components/IngresoPage/IngresoPage'
import { DeleteConfirm } from './components/DeleteConfirm/DeleteConfirm'
import { PriceHistoryModal } from './components/PriceHistoryModal/PriceHistoryModal'
import { PhotoSearch } from './components/PhotoSearch/PhotoSearch'
import { TiendaNubeImport } from './components/TiendaNubeImport/TiendaNubeImport'
import { ImportFotos } from './components/ImportFotos/ImportFotos'
import { ImportExcel } from './components/ImportExcel/ImportExcel'
import { Dashboard } from './components/Dashboard/Dashboard'
import { VentasHistory } from './components/VentasHistory/VentasHistory'
import { useModelos } from './hooks/useModelos'
import { AiChat } from './components/AiChat/AiChat'
import './App.css'

export function App() {
  const [activePage, setActivePage] = useState<ActivePage>('stock')

  const {
    modelos, loading, reload,
    addModelo, editModelo, removeModelo, venderModelo, ingresarStockBatch, clearAll,
  } = useModelos()

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
    talleRows: TalleRow[]
  ) => {
    if (editTarget) {
      await editModelo(editTarget.id, data, photos, toDeleteFotoIds, talleRows)
    } else {
      await addModelo(data, photos, talleRows)
    }
  }

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
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
          />
        )
      )}

      {activePage === 'dashboard' && <Dashboard />}
      {activePage === 'ventas' && <VentasHistory />}

      <ModelForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
        initial={editTarget}
      />

      <SellModal
        modelo={sellTarget}
        onClose={() => setSellTarget(null)}
        onConfirm={(m: Modelo, talleId: string, medioPago: MedioPago) => venderModelo(m, talleId, medioPago)}
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
