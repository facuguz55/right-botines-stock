import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive, ArchiveRestore, Ban, Bell, BellOff, Eraser, Loader2, Mail, MailOpen, Pencil, Tag, Trash2,
} from 'lucide-react'
import type { CrmEtiqueta, WspConversacion } from '../../../types/crm'
import { SILENCIAR_SIEMPRE, estaSilenciada } from '../../../lib/crmSilencio'
import EtiquetasPicker from '../Etiquetas/EtiquetasPicker'

// Menú de un chat de la lista (mantener apretado en el celular, clic derecho en la
// compu), como el de WhatsApp. Cada acción que necesita más pasos (nombre, cuánto
// silenciar, etiquetas, confirmar un borrado) abre su propio cuadro.

export interface AccionesChat {
  onToggleLeido: (c: WspConversacion) => void
  onRenombrar: (c: WspConversacion, nombre: string) => Promise<void>
  onSilenciar: (c: WspConversacion, hasta: string | null) => Promise<void>
  onArchivar: (c: WspConversacion, archivar: boolean) => Promise<void>
  onBloquear: (c: WspConversacion, bloquear: boolean) => Promise<void>
  onVaciar: (c: WspConversacion) => Promise<void>
  onEliminar: (c: WspConversacion) => Promise<void>
  onToggleEtiqueta: (conversacionId: string, etiquetaId: string) => void
  onCrearEtiqueta: (nombre: string, color: string, conversacionId: string) => Promise<void>
  onEliminarEtiqueta: (etiquetaId: string) => void
}

interface Props {
  conv: WspConversacion
  // Dónde se apretó (para que el menú salga de ahí).
  x: number
  y: number
  etiquetas: CrmEtiqueta[]
  etiquetasDelChat: CrmEtiqueta[]
  acciones: AccionesChat
  onClose: () => void
}

type Paso = 'menu' | 'renombrar' | 'silenciar' | 'etiquetas' | 'bloquear' | 'vaciar' | 'eliminar'

const HORA = 3600 * 1000

export function nombreDeChat(c: WspConversacion): string {
  return c.nombre_personalizado || c.nombre || c.telefono || 'este chat'
}

export default function ChatMenu({ conv, x, y, etiquetas, etiquetasDelChat, acciones, onClose }: Props) {
  const [paso, setPaso] = useState<Paso>('menu')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState(conv.nombre_personalizado || conv.nombre || '')
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; origen: string }>({ left: x, top: y, origen: '0 0' })

  const noLeido = (conv.no_leidos || 0) === 0 // "marcar como no leído" si hoy está leído
  const silenciada = estaSilenciada(conv)

  // El menú sale desde donde se apretó, sin salirse de la pantalla.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || paso !== 'menu') return
    // offsetWidth/Height: no cuentan la animación (que arranca achicada).
    const ancho = window.visualViewport?.width ?? window.innerWidth
    const alto = window.visualViewport?.height ?? window.innerHeight
    const width = el.offsetWidth
    const height = el.offsetHeight
    const left = Math.max(8, Math.min(x, ancho - width - 8))
    const top = Math.max(8, Math.min(y, alto - height - 8))
    setPos({ left, top, origen: `${Math.round(x - left)}px ${Math.round(y - top)}px` })
  }, [x, y, paso])

  useLayoutEffect(() => {
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', alTecla)
    return () => document.removeEventListener('keydown', alTecla)
  }, [onClose])

  const ejecutar = async (fn: () => Promise<void>) => {
    setTrabajando(true); setError('')
    try { await fn(); onClose() }
    catch (err) { console.error(err); setError('No se pudo. Probá de nuevo.'); setTrabajando(false) }
  }

  const item = (icono: React.ReactNode, texto: string, alTocar: () => void, peligro = false) => (
    <button role="menuitem" className={peligro ? 'conv-menu-peligro' : ''} onClick={alTocar}>{icono}{texto}</button>
  )

  return createPortal(
    // El fondo tapa la lista: tocar afuera cierra el menú y ese toque NO llega a ningún chat.
    <div
      className="conv-backdrop"
      onPointerDown={e => { e.preventDefault(); e.stopPropagation() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onContextMenu={e => { e.preventDefault(); if (e.target === e.currentTarget) onClose() }}
    >
      {paso === 'menu' && (
        <div
          ref={menuRef}
          className="conv-menu"
          role="menu"
          style={{ left: pos.left, top: pos.top, transformOrigin: pos.origen }}
        >
          {item(noLeido ? <Mail size={17} /> : <MailOpen size={17} />, noLeido ? 'Marcar como no leído' : 'Marcar como leído',
            () => { acciones.onToggleLeido(conv); onClose() })}
          {item(<Tag size={17} />, 'Etiquetas', () => setPaso('etiquetas'))}
          {item(<Pencil size={17} />, 'Cambiar nombre', () => setPaso('renombrar'))}
          {silenciada
            ? item(<Bell size={17} />, 'Dejar de silenciar', () => { void ejecutar(() => acciones.onSilenciar(conv, null)) })
            : item(<BellOff size={17} />, 'Silenciar', () => setPaso('silenciar'))}
          {item(conv.archivada ? <ArchiveRestore size={17} /> : <Archive size={17} />, conv.archivada ? 'Desarchivar' : 'Archivar',
            () => { void ejecutar(() => acciones.onArchivar(conv, !conv.archivada)) })}
          {conv.bloqueada
            ? item(<Ban size={17} />, 'Desbloquear', () => { void ejecutar(() => acciones.onBloquear(conv, false)) })
            : item(<Ban size={17} />, 'Bloquear', () => setPaso('bloquear'))}
          <div className="conv-menu-sep" />
          {item(<Eraser size={17} />, 'Vaciar chat', () => setPaso('vaciar'), true)}
          {item(<Trash2 size={17} />, 'Eliminar chat', () => setPaso('eliminar'), true)}
        </div>
      )}

      {paso === 'etiquetas' && (
        <div className="conv-dialog conv-dialog--etiquetas">
          <EtiquetasPicker
            etiquetas={etiquetas}
            seleccionadas={new Set(etiquetasDelChat.map(e => e.id))}
            onToggle={id => acciones.onToggleEtiqueta(conv.id, id)}
            onCrear={(n, c) => acciones.onCrearEtiqueta(n, c, conv.id)}
            onEliminar={acciones.onEliminarEtiqueta}
            onClose={onClose}
          />
        </div>
      )}

      {paso === 'renombrar' && (
        <div className="conv-dialog" role="dialog" aria-label="Cambiar nombre">
          <h3>Cambiar nombre</h3>
          <input
            autoFocus
            value={nombre}
            maxLength={60}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void ejecutar(() => acciones.onRenombrar(conv, nombre)) }}
            placeholder={conv.nombre || conv.telefono || 'Nombre'}
          />
          <p className="conv-dialog-nota">Si lo dejás vacío, vuelve al nombre que tiene en WhatsApp.</p>
          {error && <p className="conv-dialog-error">{error}</p>}
          <div className="conv-dialog-botones">
            <button onClick={onClose}>Cancelar</button>
            <button className="conv-dialog-ok" disabled={trabajando} onClick={() => ejecutar(() => acciones.onRenombrar(conv, nombre))}>
              {trabajando ? <Loader2 size={15} className="conv-list-spin" /> : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {paso === 'silenciar' && (
        <div className="conv-dialog" role="dialog" aria-label="Silenciar">
          <h3>Silenciar {nombreDeChat(conv)}</h3>
          <p className="conv-dialog-nota">No te llegan avisos al celular de este chat. Los mensajes igual aparecen.</p>
          {([
            ['8 horas', () => new Date(Date.now() + 8 * HORA).toISOString()],
            ['1 semana', () => new Date(Date.now() + 7 * 24 * HORA).toISOString()],
            ['Siempre', () => SILENCIAR_SIEMPRE],
          ] as [string, () => string][]).map(([texto, hasta]) => (
            <button key={texto} className="conv-dialog-opcion" disabled={trabajando} onClick={() => ejecutar(() => acciones.onSilenciar(conv, hasta()))}>
              {texto}
            </button>
          ))}
          {error && <p className="conv-dialog-error">{error}</p>}
          <div className="conv-dialog-botones"><button onClick={onClose}>Cancelar</button></div>
        </div>
      )}

      {(paso === 'bloquear' || paso === 'vaciar' || paso === 'eliminar') && (
        <div className="conv-dialog" role="alertdialog" aria-label="Confirmar">
          <h3>
            {paso === 'bloquear' && `¿Bloquear a ${nombreDeChat(conv)}?`}
            {paso === 'vaciar' && '¿Vaciar este chat?'}
            {paso === 'eliminar' && '¿Eliminar este chat?'}
          </h3>
          <p className="conv-dialog-nota">
            {paso === 'bloquear' && 'Sus mensajes se guardan pero no avisan, no se le sugiere ni se le contesta nada, y el chat sale de la lista (queda en "Bloqueados"). No bloquea el número en WhatsApp.'}
            {paso === 'vaciar' && `Se borran todos los mensajes con ${nombreDeChat(conv)}. El chat queda en la lista, vacío. No se puede deshacer.`}
            {paso === 'eliminar' && `Se borra el chat con ${nombreDeChat(conv)} y todos sus mensajes. No se puede deshacer. Lo que el bot aprendió de este chat se conserva.`}
          </p>
          {error && <p className="conv-dialog-error">{error}</p>}
          <div className="conv-dialog-botones">
            <button onClick={onClose}>Cancelar</button>
            <button
              className="conv-dialog-peligro"
              disabled={trabajando}
              onClick={() => ejecutar(() =>
                paso === 'bloquear' ? acciones.onBloquear(conv, true)
                  : paso === 'vaciar' ? acciones.onVaciar(conv)
                  : acciones.onEliminar(conv))}
            >
              {trabajando ? <Loader2 size={15} className="conv-list-spin" /> : paso === 'bloquear' ? 'Bloquear' : paso === 'vaciar' ? 'Vaciar chat' : 'Eliminar chat'}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
