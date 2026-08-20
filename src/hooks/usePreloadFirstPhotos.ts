import { useEffect, useState } from 'react'
import type { Modelo } from '../types'

// Cuántas fotos se precargan antes de dejar entrar (aprox. lo que entra en
// las primeras pantallas de la grilla) y cuánto se espera como máximo antes
// de dejar pasar igual, para no trabar la entrada si una foto tarda o falla.
const PRELOAD_COUNT = 24
const MAX_WAIT_MS = 3000

// Precarga las primeras fotos del catálogo (una sola vez por sesión) para
// que cuando se muestra la grilla el navegador ya las tenga en caché y no
// se note el trabajo de decodificarlas/pintarlas mientras se scrollea.
export function usePreloadFirstPhotos(modelos: Modelo[], modelosLoading: boolean): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready || modelosLoading) return

    const urls = modelos
      .slice(0, PRELOAD_COUNT)
      .map(m => m.modelo_fotos[0]?.foto_url)
      .filter((u): u is string => !!u)

    if (urls.length === 0) { setReady(true); return }

    let cancelled = false
    let settled = 0
    const finish = () => { if (!cancelled) setReady(true) }
    const timeout = setTimeout(finish, MAX_WAIT_MS)

    const onSettle = () => {
      settled++
      if (settled >= urls.length) { clearTimeout(timeout); finish() }
    }

    for (const url of urls) {
      const img = new Image()
      img.onload = onSettle
      img.onerror = onSettle
      img.src = url
    }

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [modelos, modelosLoading, ready])

  return ready
}
