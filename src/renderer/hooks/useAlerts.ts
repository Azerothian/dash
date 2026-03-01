import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Alert, AlertHistory, CreateAlert, UpdateAlert } from '@shared/entities'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export function useAlerts() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsub = window.api.on(IPC_CHANNELS.ALERT_STATE_CHANGED, () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    })
    return unsub
  }, [queryClient])

  return useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: () => window.api.invoke<Alert[]>(IPC_CHANNELS.ALERT_LIST),
  })
}

export function useAlert(id: string | undefined) {
  return useQuery<Alert>({
    queryKey: ['alerts', id],
    queryFn: () => window.api.invoke<Alert>(IPC_CHANNELS.ALERT_GET, id),
    enabled: !!id,
  })
}

export function useAlertHistory(alertId: string | undefined, limit = 50) {
  return useQuery<AlertHistory[]>({
    queryKey: ['alert-history', alertId, limit],
    queryFn: () => window.api.invoke<AlertHistory[]>(IPC_CHANNELS.ALERT_HISTORY_LIST, alertId, limit),
    enabled: !!alertId,
  })
}

export function useCreateAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAlert) => window.api.invoke<Alert>(IPC_CHANNELS.ALERT_CREATE, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useUpdateAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateAlert) => window.api.invoke<Alert>(IPC_CHANNELS.ALERT_UPDATE, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useDeleteAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.ALERT_DELETE, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useRunAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.ALERT_RUN, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useAckAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      window.api.invoke(IPC_CHANNELS.ALERT_ACK, id, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useClearAckAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.ALERT_CLEAR_ACK, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}
