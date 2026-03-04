import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Monitor, CreateMonitor, UpdateMonitor, CloudflarePagesConfig, CloudflarePagesProjectConfig } from '@shared/entities'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export function useMonitors() {
  return useQuery<Monitor[]>({
    queryKey: ['monitors'],
    queryFn: () => window.api.invoke<Monitor[]>(IPC_CHANNELS.MONITOR_LIST),
  })
}

export function useMonitor(id: string | undefined) {
  return useQuery<Monitor>({
    queryKey: ['monitors', id],
    queryFn: () => window.api.invoke<Monitor>(IPC_CHANNELS.MONITOR_GET, id),
    enabled: !!id,
  })
}

export function useCreateMonitor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateMonitor) =>
      window.api.invoke<Monitor>(IPC_CHANNELS.MONITOR_CREATE, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitors'] }),
  })
}

export function useUpdateMonitor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateMonitor) =>
      window.api.invoke<Monitor>(IPC_CHANNELS.MONITOR_UPDATE, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitors'] }),
  })
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.MONITOR_DELETE, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] })
      queryClient.invalidateQueries({ queryKey: ['sensors'] })
    },
  })
}

export function useRunMonitor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.MONITOR_RUN, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] })
      queryClient.invalidateQueries({ queryKey: ['sensors'] })
      queryClient.invalidateQueries({ queryKey: ['sensor-data'] })
    },
  })
}

export function useDiscoverMonitorProjects(monitorId: string | undefined) {
  return useQuery<{ success: boolean; projects?: { name: string; production_branch: string }[]; error?: string }>({
    queryKey: ['monitor-projects', monitorId],
    queryFn: () => window.api.invoke(IPC_CHANNELS.MONITOR_DISCOVER_PROJECTS, monitorId),
    enabled: !!monitorId,
  })
}

export function useDiscoverProjectsByCredential() {
  return useMutation({
    mutationFn: (credentialId: string) =>
      window.api.invoke<{ success: boolean; projects?: { name: string; production_branch: string }[]; error?: string }>(
        IPC_CHANNELS.MONITOR_DISCOVER_PROJECTS,
        { credentialId },
      ),
  })
}

export function useTestMonitorConnection() {
  return useMutation({
    mutationFn: (config: CloudflarePagesConfig) =>
      window.api.invoke<{ success: boolean; projects?: { name: string; production_branch: string }[]; error?: string }>(
        IPC_CHANNELS.MONITOR_TEST_CONNECTION,
        config,
      ),
  })
}
