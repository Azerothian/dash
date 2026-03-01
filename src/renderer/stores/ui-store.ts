import { create } from 'zustand'
import type { ThemeSetting } from '@shared/entities'

interface UiState {
  sidebarCollapsed: boolean
  theme: ThemeSetting
  editMode: boolean
  activeDashboardId: string | null

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setTheme: (theme: ThemeSetting) => void
  setEditMode: (editMode: boolean) => void
  setActiveDashboardId: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  theme: (localStorage.getItem('dash-theme') as ThemeSetting) || 'system',
  editMode: false,
  activeDashboardId: null,

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setTheme: (theme) => {
    localStorage.setItem('dash-theme', theme)
    set({ theme })
  },
  setEditMode: (editMode) => set({ editMode }),
  setActiveDashboardId: (id) => set({ activeDashboardId: id }),
}))
