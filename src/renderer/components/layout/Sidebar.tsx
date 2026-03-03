import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Activity,
  AlertTriangle,
  Bell,
  Clock,
  Radio,
  Settings,
} from 'lucide-react'
import { useUiStore } from '../../stores/ui-store'

const navItems = [
  { path: '/dashboard', label: 'Dashboards', icon: LayoutDashboard },
  { path: '/sensors', label: 'Sensors', icon: Activity },
  { path: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { path: '/monitors', label: 'Monitors', icon: Radio },
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/cron', label: 'Cron Tasks', icon: Clock },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)

  return (
    <aside
      className={`fixed left-0 top-12 bottom-6 z-30 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path)
          const Icon = item.icon
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
