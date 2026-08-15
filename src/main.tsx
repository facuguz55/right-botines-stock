import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { initPwaUpdate } from './pwaUpdate'
import { CreatorLockPanel } from './components/CreatorLockPanel/CreatorLockPanel'
import { AppBlocked } from './components/AppBlocked/AppBlocked'
import { getAppLockStatus } from './services/creatorLock'

initPwaUpdate()

// Ruta secreta del panel de creadores: no se linkea desde ningún lado de la
// UI, solo se llega escribiendo esta URL a mano. Además pide su propio pin
// server-side, así que conocer la URL sola no alcanza para nada.
const CREATOR_PANEL_PATH = '/panel-e497cc20af25ea91015647aae28a24e9'

function Root() {
  const isCreatorPanel = window.location.pathname === CREATOR_PANEL_PATH
  const [checked, setChecked] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (isCreatorPanel) return
    getAppLockStatus()
      .then(status => {
        setBlocked(status.locked)
        setMensaje(status.mensaje)
      })
      .catch(() => { /* si falla la consulta, no bloqueamos a nadie por error de red */ })
      .finally(() => setChecked(true))
  }, [isCreatorPanel])

  if (isCreatorPanel) return <CreatorLockPanel />
  if (!checked) return null
  if (blocked) return <AppBlocked mensaje={mensaje} />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
