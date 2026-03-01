import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { StatusBar } from './StatusBar'
import { useUiStore } from '../../stores/ui-store'

export function AdminLayout() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main
          className={`flex-1 overflow-auto bg-background transition-all duration-200 ${
            sidebarCollapsed ? 'ml-16' : 'ml-56'
          }`}
        >
          <div className="h-full p-4">
            <Outlet />
          </div>
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
