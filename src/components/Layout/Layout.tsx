import {
  Package, BarChart2, DollarSign, Settings, List, FolderOpen, Activity,
  ShoppingBag, TrendingUp, ShoppingCart, Users, UserCheck, Tag, MessageCircle, PieChart,
  LogOut,
} from 'lucide-react'
import type { ActivePage, Role } from '../../types'
import { AccessAlerts } from '../AccessAlerts/AccessAlerts'
import './Layout.css'

interface LayoutProps {
  activePage: ActivePage
  onNavigate: (page: ActivePage) => void
  role: Role
  onLogout: () => void
  children: React.ReactNode
}

// Páginas visibles solo para el dueño
export const SOLO_DUENO: ActivePage[] = ['configuracion', 'rentabilidad']

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
  { page: 'configuracion',  label: 'Ajustes',       Icon: Settings     },
  { page: 'tn_dashboard',   label: 'Dashboard',     Icon: ShoppingBag  },
  { page: 'tn_analytics',   label: 'Análisis',      Icon: TrendingUp   },
  { page: 'tn_ordenes',     label: 'Órdenes',       Icon: ShoppingCart },
  { page: 'tn_clientes',    label: 'Clientes',      Icon: Users        },
  { page: 'tn_cupones',     label: 'Cupones',       Icon: Tag          },
  { page: 'tn_mails',       label: 'Mensajes',      Icon: MessageCircle},
  { page: 'rentabilidad',   label: 'Rentabilidad',  Icon: PieChart     },
]

export function Layout({ activePage, onNavigate, role, onLogout, children }: LayoutProps) {
  const nav = (page: ActivePage) => ALL_NAV.find(n => n.page === page)!
  const esDueno = role === 'dueno'

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Right Botines" className="brand-logo" onClick={() => window.location.reload()} />
        </div>
        <nav className="sidebar-nav">

          {/* ── LOCAL ── */}
          <p className="nav-universe-label">Local</p>

          <p className="nav-group-label">Análisis</p>
          <NavBtn item={nav('dashboard')} active={activePage === 'dashboard'} onClick={() => onNavigate('dashboard')} />
          <NavBtn item={nav('seguimientos')} active={activePage === 'seguimientos'} onClick={() => onNavigate('seguimientos')} />

          <p className="nav-group-label">Gestión</p>
          {(['stock', 'carpetas', 'ventas', 'stock_avanzado', 'clientes_locales'] as ActivePage[]).map(p => (
            <NavBtn key={p} item={nav(p)} active={activePage === p} onClick={() => onNavigate(p)} />
          ))}

          {esDueno && (
            <>
              <div className="nav-gap" />
              <NavBtn item={nav('configuracion')} active={activePage === 'configuracion'} onClick={() => onNavigate('configuracion')} />
            </>
          )}

          {/* ── TIENDA ONLINE ── */}
          <div className="nav-divider" />
          <p className="nav-universe-label">Tienda Online</p>

          <p className="nav-group-label">Análisis</p>
          {(['tn_dashboard', 'tn_analytics'] as ActivePage[]).map(p => (
            <NavBtn key={p} item={nav(p)} active={activePage === p} onClick={() => onNavigate(p)} />
          ))}

          <p className="nav-group-label">Gestión</p>
          {(['tn_ordenes', 'tn_clientes', 'tn_cupones'] as ActivePage[]).map(p => (
            <NavBtn key={p} item={nav(p)} active={activePage === p} onClick={() => onNavigate(p)} />
          ))}

          <p className="nav-group-label">Mensajes</p>
          <NavBtn item={nav('tn_mails')} active={activePage === 'tn_mails'} onClick={() => onNavigate('tn_mails')} />

          {/* ── RENTABILIDAD ── */}
          {esDueno && (
            <>
              <div className="nav-divider" />
              <NavBtn item={nav('rentabilidad')} active={activePage === 'rentabilidad'} onClick={() => onNavigate('rentabilidad')} />
            </>
          )}

        </nav>

        <div className="sidebar-footer">
          {esDueno && <AccessAlerts />}
          <button className="sidebar-logout" onClick={onLogout} title="Cerrar sesión">
            <LogOut size={15} />
            <span>{esDueno ? 'Dueño' : 'Empleado'} · Salir</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div key={activePage} className="page-enter">{children}</div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="bottom-nav">
        {(['stock', 'dashboard', 'seguimientos', 'tn_ordenes', 'tn_dashboard'] as ActivePage[]).map(p => {
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
      </nav>
    </div>
  )
}
