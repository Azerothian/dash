import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Dashboard, CreateDashboard, UpdateDashboard, Panel, CreatePanel, UpdatePanel, GridstackConfig } from '@shared/entities'

export function useDashboards() {
  return useQuery<Dashboard[]>({
    queryKey: ['dashboards'],
    queryFn: () => window.api.invoke(IPC_CHANNELS.DASHBOARD_LIST),
  })
}

export function useDashboard(id?: string) {
  return useQuery<Dashboard>({
    queryKey: ['dashboard', id],
    queryFn: () => window.api.invoke(IPC_CHANNELS.DASHBOARD_GET, id),
    enabled: !!id,
  })
}

export function useCreateDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateDashboard) => window.api.invoke(IPC_CHANNELS.DASHBOARD_CREATE, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

export function useUpdateDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateDashboard) => window.api.invoke(IPC_CHANNELS.DASHBOARD_UPDATE, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
      qc.invalidateQueries({ queryKey: ['dashboard', variables.id] })
    },
  })
}

export function useDeleteDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.DASHBOARD_DELETE, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

export function useSetPrimaryDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.DASHBOARD_SET_PRIMARY, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

export function useReorderDashboards() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => window.api.invoke(IPC_CHANNELS.DASHBOARD_REORDER, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

// Panel mutations
export function useCreatePanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePanel) => window.api.invoke(IPC_CHANNELS.PANEL_CREATE, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['dashboard', variables.dashboard_id] })
    },
  })
}

export function useUpdatePanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePanel) => window.api.invoke(IPC_CHANNELS.PANEL_UPDATE, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

export function useDeletePanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.PANEL_DELETE, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}

export function useBatchUpdatePanels() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (updates: { id: string; gridstack_config: GridstackConfig }[]) =>
      window.api.invoke(IPC_CHANNELS.PANEL_BATCH_UPDATE, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] })
    },
  })
}
