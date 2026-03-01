import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Settings } from '@shared/entities'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => window.api.invoke<Settings>(IPC_CHANNELS.SETTINGS_GET_ALL),
  })
}

export function useSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async <K extends keyof Settings>({
      key,
      value,
    }: {
      key: K
      value: Settings[K]
    }) => {
      return window.api.invoke(IPC_CHANNELS.SETTINGS_SET, key, value)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}
