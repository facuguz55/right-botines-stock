import { useState, useEffect, useCallback, useRef } from 'react'
import { syncTNStock, type SyncResult } from '../services/tnSync'

const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutos

export function useTNSync(onSynced?: () => void) {
  const [syncing, setSyncing]       = useState(false)
  const [progress, setProgress]     = useState('')
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)

  // Refs para evitar closures stale en el interval
  const syncingRef  = useRef(false)
  const onSyncedRef = useRef(onSynced)
  useEffect(() => { onSyncedRef.current = onSynced }, [onSynced])

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setProgress('Iniciando sincronización...')
    try {
      const result = await syncTNStock(setProgress)
      setLastResult(result)
      setLastSyncAt(new Date())
      onSyncedRef.current?.()
    } catch (err) {
      setLastResult({
        created: 0, updated: 0, imagesAdded: 0, total: 0,
        errors: [(err as Error).message ?? 'Error desconocido'],
      })
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setProgress('')
    }
  }, []) // estable — usa refs internamente

  // Auto-sync cada 5 minutos mientras la app está abierta
  useEffect(() => {
    const timer = window.setInterval(syncNow, SYNC_INTERVAL)
    return () => clearInterval(timer)
  }, [syncNow])

  return { syncNow, syncing, progress, lastResult, lastSyncAt }
}
