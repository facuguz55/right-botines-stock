import { useState, useEffect, useCallback, useRef } from 'react'
import { syncTNStock, type SyncResult } from '../services/tnSync'
import { syncTNOrdenes, syncTNClientes, syncTNCupones } from '../services/tnOrdersSync'

const SYNC_INTERVAL = 60 * 60 * 1000 // 1 hora — red de seguridad de respaldo para webhooks perdidos

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
      const [stockRes, ordenesRes, clientesRes, cuponesRes] = await Promise.allSettled([
        syncTNStock(setProgress),
        syncTNOrdenes(),
        syncTNClientes(),
        syncTNCupones(),
      ])

      const result: SyncResult = stockRes.status === 'fulfilled'
        ? stockRes.value
        : { created: 0, updated: 0, imagesAdded: 0, total: 0, errors: [] }

      for (const [label, r] of [['órdenes', ordenesRes], ['clientes', clientesRes], ['cupones', cuponesRes]] as const) {
        if (r.status === 'rejected') {
          result.errors.push(`Sync de ${label}: ${(r.reason as Error)?.message ?? 'error desconocido'}`)
        }
      }

      setLastResult(result)
      setLastSyncAt(new Date())
      if (result.errors.length > 0) console.error('Errores de sync TiendaNube:', result.errors)
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
