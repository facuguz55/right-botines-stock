import {
  Package, BarChart2, DollarSign, Settings, List, FolderOpen,
  ShoppingBag, TrendingUp, ShoppingCart, Box, Users, Tag, Mail,
} from 'lucide-react'
import type { ActivePage } from '../../types'
import './Layout.css'

interface LayoutProps {
  activePage: ActivePage
  onNavigate: (page: ActivePage) => void
  children: React.ReactNode
}

const LOCAL_NAV: { page: ActivePage; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { page: 'stock',          label: 'Stock',     Icon: Package    },
  { page: 'carpetas',       label: 'Carpetas',  Icon: FolderOpen },
  { page: 'dashboard',      label: 'Dashboard', Icon: BarChart2  },
  { page: 'ventas',         label: 'Ventas',    Icon: DollarSign },
  { page: 'stock_avanzado', label: 'Avanzado',  Icon: List       },
  { page: 'configuracion',  label: 'Ajustes',   Icon: Settings   },
]

const TN_NAV: { page: ActivePage; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { page: 'tn_dashboard', label: 'Dashboard TN', Icon: ShoppingBag  },
  { page: 'tn_analytics', label: 'Análisis',     Icon: TrendingUp   },
  { page: 'tn_ordenes',   label: 'Órdenes',      Icon: ShoppingCart },
  { page: 'tn_productos', label: 'Productos TN', Icon: Box          },
  { page: 'tn_clientes',  label: 'Clientes',     Icon: Users        },
  { page: 'tn_cupones',   label: 'Cupones',      Icon: Tag          },
  { page: 'tn_mails',     label: 'Mails',        Icon: Mail         },
]

const ALL_NAV = [...LOCAL_NAV, ...TN_NAV]

export function Layout({ activePage, onNavigate, children }: LayoutProps) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Right Botines" className="brand-logo" onClick={() => window.location.reload()} />
        </div>
        <nav className="sidebar-nav">
          <p className="nav-section-label">Local</p>
          {LOCAL_NAV.map(({ page, label, Icon }) => (
            <button
              key={page}
              className={`nav-item${activePage === page ? ' active' : ''}`}
              onClick={() => onNavigate(page)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}

          <div className="nav-divider" />
          <p className="nav-section-label">Tienda Online</p>

          {TN_NAV.map(({ page, label, Icon }) => (
            <button
              key={page}
              className={`nav-item${activePage === page ? ' active' : ''}`}
              onClick={() => onNavigate(page)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="main-content">{children}</main>

      <nav className="bottom-nav">
        {ALL_NAV.map(({ page, label, Icon }) => (
          <button
            key={page}
            className={`bottom-nav-item${activePage === page ? ' active' : ''}`}
            onClick={() => onNavigate(page)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
