import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Notification, NotificationHistory, CreateNotification, UpdateNotification } from '@shared/entities'

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => window.api.invoke(IPC_CHANNELS.NOTIFICATION_LIST),
  })
}

export function useNotification(id?: string) {
  return useQuery<Notification>({
    queryKey: ['notification', id],
    queryFn: () => window.api.invoke(IPC_CHANNELS.NOTIFICATION_GET, id),
    enabled: !!id,
  })
}

export function useNotificationHistory(notificationId?: string, limit = 50) {
  return useQuery<NotificationHistory[]>({
    queryKey: ['notification-history', notificationId, limit],
    queryFn: () => window.api.invoke(IPC_CHANNELS.NOTIFICATION_HISTORY_LIST, notificationId, limit),
    enabled: !!notificationId,
  })
}

export function useCreateNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateNotification) => window.api.invoke(IPC_CHANNELS.NOTIFICATION_CREATE, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useUpdateNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateNotification) => window.api.invoke(IPC_CHANNELS.NOTIFICATION_UPDATE, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.NOTIFICATION_DELETE, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useTestNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke<{ success: boolean; error?: string }>(IPC_CHANNELS.NOTIFICATION_TEST, id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['notification-history', variables] })
    },
  })
}
