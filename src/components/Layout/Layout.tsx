import { useState } from 'react'
import {
  Package, BarChart2, DollarSign, Settings, List, FolderOpen, Activity,
  ShoppingBag, TrendingUp, ShoppingCart, Users, UserCheck, Tag, MessageCircle, PieChart,
  LogOut, Banknote, UserCog, Menu, X, Truck, RotateCcw, User,
} from 'lucide-react'
import type { ActivePage, Role } from '../../types'
import { AccessAlerts } from '../AccessAlerts/AccessAlerts'
import { FichajeWidget } from '../FichajeWidget/FichajeWidget'
import type { useFichajeActual } from '../../hooks/useFichajeActual'
import './Layout.css'

interface LayoutProps {
  activePage: ActivePage
  onNavigate: (page: ActivePage) => void
  role: Role
  empleadoNombre: string | null
  onLogout: () => void
  fichajeActual: ReturnType<typeof useFichajeActual>
  children: React.ReactNode
}

// Páginas visibles solo para el dueño
export const SOLO_DUENO: ActivePage[] = [
  'configuracion', 'rentabilidad', 'empleados', 'seguimientos', 'tn_dashboard', 'tn_analytics', 'proveedores',
]

type NavItem = { page: ActivePage; label: string; Icon: React.FC<{ size?: number }> }

function NavBtn({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`nav-item${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <item.Icon size={15} />
      <span>{item.label}</span>
    </button>
  )
}

const ALL_NAV: NavItem[] = [
  { page: 'dashboard',      label: 'Dashboard',    Icon: BarChart2    },
  { page: 'seguimientos',   label: 'Seguimientos', Icon: Activity     },
  { page: 'stock',          label: 'Stock',         Icon: Package      },
  { page: 'carpetas',       label: 'Carpetas',      Icon: FolderOpen   },
  { page: 'ventas',         label: 'Ventas',        Icon: DollarSign   },
  { page: 'stock_avanzado', label: 'Avanzado',      Icon: List         },
  { page: 'clientes_locales', label: 'Clientes',    Icon: UserCheck    },
  { page: 'caja',           label: 'Caja',          Icon: Banknote     },
  { page: 'devoluciones',   label: 'Devoluciones',  Icon: RotateCcw    },
  { page: 'empleados',      label: 'Empleados',     Icon: UserCog      },
  { page: 'proveedores',    label: 'Proveedores',   Icon: Truck        },
  { page: 'configuracion',  label: 'Ajustes',       Icon: Settings     },
  { page: 'tn_dashboard',   label: 'Dashboard',     Icon: ShoppingBag  },
  { page: 'tn_analytics',   label: 'Análisis',      Icon: TrendingUp   },
  { page: 'tn_ordenes',     label: 'Órdenes',       Icon: ShoppingCart },
  { page: 'tn_clientes',    label: 'Clientes',      Icon: Users        },
  { page: 'tn_cupones',     label: 'Cupones',       Icon: Tag          },
  { page: 'tn_mails',       label: 'Mensajes',      Icon: MessageCircle},
  { page: 'rentabilidad',   label: 'Rentabilidad',  Icon: PieChart     },
]

// Páginas del perfil "Atención al público": solo lo justo para vender y
// mandar fotos por WhatsApp, sin fichaje/caja ni ninguna otra sección.
const NAV_ATENCION: ActivePage[] = ['stock', 'carpetas', 'ventas']

export function Layout({ activePage, onNavigate, role, empleadoNombre, onLogout, fichajeActual, children }: LayoutProps) {
  const nav = (page: ActivePage) => ALL_NAV.find(n => n.page === page)!
  const esDueno = role === 'dueno'
  const esAtencion = role === 'atencion'
  const quienSoy = esDueno ? 'Dueño' : (empleadoNombre ?? 'Empleado')
  const [menuOpen, setMenuOpen] = useState(false)

  const renderNavAtencion = (onNav: (page: ActivePage) => void) => (
    <>
      <p className="nav-universe-label">Atención al público</p>
      {NAV_ATENCION.map(p => (
        <NavBtn key={p} item={nav(p)} active={activePage === p} onClick={() => onNav(p)} />
      ))}
    </>
  )

  const renderNavGroups = (onNav: (page: ActivePage) => void) => (
    <>
      {/* ── LOCAL ── */}
      <p className="nav-universe-label">Local</p>

      <p className="nav-group-label">Análisis</p>
      <NavBtn item={nav('dashboard')} active={activePage === 'dashboard'} onClick={() => onNav('dashboard')} />
      {esDueno && (
        <NavBtn item={nav('seguimientos')} active={activePage === 'seguimientos'} onClick={() => onNav('seguimientos')} />
      )}

      <p className="nav-group-label">Gestión</p>
      {(['stock', 'carpetas', 'ventas', 'stock_avanzado', 'clientes_locales'] as ActivePage[]).map(p => (
        <NavBtn key={p} item={nav(p)} active={activePage === p} onClick={() => onNav(p)} />
      ))}

      <p className="nav-group-label">Personal</p>
      <NavBtn item={nav('caja')} active={activePage === 'caja'} onClick={() => onNav('caja')} />
      <NavBtn item={nav('devoluciones')} active={activePage === 'devoluciones'} onClick={() => onNav('devoluciones')} />
      {esDueno && (
        <NavBtn item={nav('empleados')} active={activePage === 'empleados'} onClick={() => onNav('empleados')} />
      )}

      {esDueno && (
        <>
          <p className="nav-group-label">Compras</p>
          <NavBtn item={nav('proveedores')} active={activePage === 'proveedores'} onClick={() => onNav('proveedores')} />
        </>
      )}

      {esDueno && (
        <>
          <div className="nav-gap" />
          <NavBtn item={nav('configuracion')} active={activePage === 'configuracion'} onClick={() => onNav('configuracion')} />
        </>
      )}

      {/* ── TIENDA ONLINE ── */}
      <div className="nav-divider" />
      <p className="nav-universe-label">Tienda Online</p>

      {esDueno && (
        <>
          <p className="nav-group-label">Análisis</p>
          {(['tn_dashboard', 'tn_analytics'] as ActivePage[]).map(p => (
            <NavBtn key={p} item={nav(p)} active={activePage === p} onClick={() => onNav(p)} />
          ))}
        </>
      )}

      <p className="nav-group-label">Gestión</p>
      {(['tn_ordenes', 'tn_clientes', 'tn_cupones'] as ActivePage[]).map(p => (
        <NavBtn key={p} item={nav(p)} active={activePage === p} onClick={() => onNav(p)} />
      ))}

      <p className="nav-group-label">Mensajes</p>
      <NavBtn item={nav('tn_mails')} active={activePage === 'tn_mails'} onClick={() => onNav('tn_mails')} />

      {/* ── RENTABILIDAD ── */}
      {esDueno && (
        <>
          <div className="nav-divider" />
          <NavBtn item={nav('rentabilidad')} active={activePage === 'rentabilidad'} onClick={() => onNav('rentabilidad')} />
        </>
      )}
    </>
  )

  const handleMobileNav = (page: ActivePage) => {
    onNavigate(page)
    setMenuOpen(false)
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Right Botines" className="brand-logo" onClick={() => window.location.reload()} />
        </div>
        <div className="sidebar-user"><User size={13} /> {quienSoy}</div>
        <nav className="sidebar-nav">
          {esAtencion ? renderNavAtencion(onNavigate) : renderNavGroups(onNavigate)}
        </nav>

        {role === 'empleado' && <FichajeWidget fichajeHook={fichajeActual} />}
        <div className="sidebar-footer">
          {esDueno && <AccessAlerts />}
          <button className="sidebar-logout" onClick={onLogout} title="Cerrar sesión">
            <LogOut size={15} />
            <span>{quienSoy} · Salir</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div key={activePage} className="page-enter">{children}</div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="bottom-nav">
        {(esDueno
          ? (['stock', 'caja', 'dashboard', 'seguimientos'] as ActivePage[])
          : esAtencion
            ? NAV_ATENCION
            : (['stock', 'caja', 'dashboard', 'tn_ordenes'] as ActivePage[])
        ).map(p => {
          const item = nav(p)
          return (
            <button
              key={p}
              className={`bottom-nav-item${activePage === p ? ' active' : ''}`}
              onClick={() => onNavigate(p)}
            >
              <item.Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
        <button
          className={`bottom-nav-item${menuOpen ? ' active' : ''}`}
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={20} />
          <span>Más</span>
        </button>
      </nav>

      {/* Drawer mobile con todo el menú */}
      {menuOpen && (
        <div className="nav-drawer-overlay" onClick={() => setMenuOpen(false)}>
          <div className="nav-drawer" onClick={e => e.stopPropagation()}>
            <div className="nav-drawer-header">
              <span className="nav-drawer-quien"><User size={14} /> {quienSoy}</span>
              <button className="nav-drawer-close" onClick={() => setMenuOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <nav className="sidebar-nav nav-drawer-nav">
              {esAtencion ? renderNavAtencion(handleMobileNav) : renderNavGroups(handleMobileNav)}
            </nav>
            {role === 'empleado' && <FichajeWidget fichajeHook={fichajeActual} />}
            <div className="sidebar-footer">
              <button className="sidebar-logout" onClick={onLogout} title="Cerrar sesión">
                <LogOut size={15} />
                <span>{quienSoy} · Salir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
