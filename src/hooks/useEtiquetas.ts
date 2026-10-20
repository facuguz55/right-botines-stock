import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CrmEtiqueta } from '../types/crm'
import {
  fetchEtiquetas, fetchAsignaciones, crearEtiqueta, eliminarEtiqueta, asignarEtiqueta, quitarEtiqueta,
} from '../services/crmEtiquetas'

type Asignacion = { conversacion_id: string; etiqueta_id: string }

// Se usa una sola vez (en CrmInbox) y se pasa por props — no instanciarlo en
// más de un componente para que todos vean el mismo estado.
export function useEtiquetas() {
  const [etiquetas, setEtiquetas] = useState<CrmEtiqueta[]>([])
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])

  const load = useCallback(async () => {
    try {
      const [e, a] = await Promise.all([fetchEtiquetas(), fetchAsignaciones()])
      setEtiquetas(e)
      setAsignaciones(a)
    } catch (err) {
      // Sin la migración 053 las tablas no existen: el CRM sigue andando sin etiquetas.
      console.error('Error cargando etiquetas (¿falta la migración 053?):', err)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('crm-etiquetas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wsp_etiquetas' }, () => { load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wsp_conversacion_etiquetas' }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const porConversacion = useMemo(() => {
    const byId = new Map(etiquetas.map(e => [e.id, e]))
    const map: Record<string, CrmEtiqueta[]> = {}
    for (const a of asignaciones) {
      const e = byId.get(a.etiqueta_id)
      if (e) (map[a.conversacion_id] ??= []).push(e)
    }
    return map
  }, [etiquetas, asignaciones])

  // Optimista: se ve al toque y, si falla el guardado, se recarga lo real.
  const toggle = useCallback(async (conversacionId: string, etiquetaId: string) => {
    const tiene = asignaciones.some(a => a.conversacion_id === conversacionId && a.etiqueta_id === etiquetaId)
    setAsignaciones(prev => tiene
      ? prev.filter(a => !(a.conversacion_id === conversacionId && a.etiqueta_id === etiquetaId))
      : [...prev, { conversacion_id: conversacionId, etiqueta_id: etiquetaId }])
    try {
      await (tiene ? quitarEtiqueta(conversacionId, etiquetaId) : asignarEtiqueta(conversacionId, etiquetaId))
    } catch (err) {
      console.error('Error actualizando etiqueta:', err)
      alert('No se pudo guardar la etiqueta.')
      load()
    }
  }, [asignaciones, load])

  // Crea la etiqueta y, si se pasa un chat, se la pone en el mismo paso.
  const crear = useCallback(async (nombre: string, color: string, conversacionId?: string) => {
    const nueva = await crearEtiqueta(nombre, color)
    setEtiquetas(prev => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    if (conversacionId) {
      setAsignaciones(prev => [...prev, { conversacion_id: conversacionId, etiqueta_id: nueva.id }])
      await asignarEtiqueta(conversacionId, nueva.id).catch(err => { console.error(err); load() })
    }
  }, [load])

  const eliminar = useCallback(async (etiquetaId: string) => {
    setEtiquetas(prev => prev.filter(e => e.id !== etiquetaId))
    setAsignaciones(prev => prev.filter(a => a.etiqueta_id !== etiquetaId))
    try {
      await eliminarEtiqueta(etiquetaId)
    } catch (err) {
      console.error('Error borrando etiqueta:', err)
      alert('No se pudo borrar la etiqueta.')
      load()
    }
  }, [load])

  return { etiquetas, porConversacion, toggle, crear, eliminar }
}
