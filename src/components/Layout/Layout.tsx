import { Package, BarChart2, DollarSign, Settings, List } from 'lucide-react'
import type { ActivePage } from '../../types'
import './Layout.css'

interface LayoutProps {
  activePage: ActivePage
  onNavigate: (page: ActivePage) => void
  children: React.ReactNode
}

const NAV_ITEMS: { page: ActivePage; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { page: 'stock',          label: 'Stock',     Icon: Package    },
  { page: 'dashboard',      label: 'Dashboard', Icon: BarChart2  },
  { page: 'ventas',         label: 'Ventas',    Icon: DollarSign },
  { page: 'stock_avanzado', label: 'Avanzado',  Icon: List       },
  { page: 'configuracion',  label: 'Ajustes',   Icon: Settings   },
]

export function Layout({ activePage, onNavigate, children }: LayoutProps) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Right Botines" className="brand-logo" onClick={() => window.location.reload()} />
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ page, label, Icon }) => (
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
        {NAV_ITEMS.map(({ page, label, Icon }) => (
          <button
            key={page}
            className={`bottom-nav-item${activePage === page ? ' active' : ''}`}
            onClick={() => onNavigate(page)}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
