import { useCallback, useEffect, useState } from 'react'
import type { CrmStatsData } from '../types/crm'
import { fetchCrmStats } from '../services/crmStats'

export function useCrmStats() {
  const [stats, setStats] = useState<CrmStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const end = now.toISOString().slice(0, 10)
    return { start, end }
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCrmStats(range.start, range.end)
      setStats(data)
    } catch (err) {
      console.error('Error cargando stats CRM:', err)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  return { stats, loading, range, setRange, reload: load }
}
