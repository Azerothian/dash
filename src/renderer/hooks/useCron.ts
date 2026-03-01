import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { CronTask } from '@shared/entities'

export function useCronTasks() {
  const qc = useQueryClient()

  useEffect(() => {
    const unsub = window.api.on(IPC_CHANNELS.CRON_TASK_STATUS, () => {
      qc.invalidateQueries({ queryKey: ['cron-tasks'] })
    })
    return unsub
  }, [qc])

  return useQuery<CronTask[]>({
    queryKey: ['cron-tasks'],
    queryFn: () => window.api.invoke(IPC_CHANNELS.CRON_LIST),
    refetchInterval: 10000,
  })
}

export function useForceRunCron() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => window.api.invoke(IPC_CHANNELS.CRON_FORCE_RUN, taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron-tasks'] }),
  })
}

export function useToggleCron() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, enabled }: { taskId: string; enabled: boolean }) =>
      window.api.invoke(IPC_CHANNELS.CRON_TOGGLE, taskId, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron-tasks'] }),
  })
}
