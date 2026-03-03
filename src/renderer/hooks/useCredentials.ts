import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Credential, CreateCredential, UpdateCredential } from '@shared/entities'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export function useCredentials() {
  return useQuery<Credential[]>({
    queryKey: ['credentials'],
    queryFn: () => window.api.invoke<Credential[]>(IPC_CHANNELS.CREDENTIAL_LIST),
  })
}

export function useCredential(id: string | undefined) {
  return useQuery<Credential>({
    queryKey: ['credentials', id],
    queryFn: () => window.api.invoke<Credential>(IPC_CHANNELS.CREDENTIAL_GET, id),
    enabled: !!id,
  })
}

export function useCreateCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCredential) =>
      window.api.invoke<Credential>(IPC_CHANNELS.CREDENTIAL_CREATE, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials'] }),
  })
}

export function useUpdateCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateCredential) =>
      window.api.invoke<Credential>(IPC_CHANNELS.CREDENTIAL_UPDATE, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials'] }),
  })
}

export function useDeleteCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.CREDENTIAL_DELETE, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials'] }),
  })
}
