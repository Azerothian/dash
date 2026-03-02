import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Sensor, CreateSensor, UpdateSensor, SensorData, AggregationFunction } from '@shared/entities'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export function useSensors() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsub = window.api.on(IPC_CHANNELS.SENSOR_DATA_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: ['sensors'] })
      queryClient.invalidateQueries({ queryKey: ['sensor-data'] })
    })
    return unsub
  }, [queryClient])

  return useQuery<Sensor[]>({
    queryKey: ['sensors'],
    queryFn: () => window.api.invoke<Sensor[]>(IPC_CHANNELS.SENSOR_LIST),
  })
}

export function useSensor(id: string | undefined) {
  return useQuery<Sensor>({
    queryKey: ['sensors', id],
    queryFn: () => window.api.invoke<Sensor>(IPC_CHANNELS.SENSOR_GET, id),
    enabled: !!id,
  })
}

export function useSensorData(sensorId: string | undefined, limit = 100) {
  return useQuery<SensorData[]>({
    queryKey: ['sensor-data', sensorId, limit],
    queryFn: () => window.api.invoke<SensorData[]>(IPC_CHANNELS.SENSOR_DATA_LIST, sensorId, limit),
    enabled: !!sensorId,
  })
}

export function useSensorDataAggregated(
  sensorId: string | undefined, column: string, aggregation: AggregationFunction, timeWindowMinutes: number
) {
  return useQuery<{ result: number | null }>({
    queryKey: ['sensor-data-agg', sensorId, column, aggregation, timeWindowMinutes],
    queryFn: () => window.api.invoke<{ result: number | null }>(IPC_CHANNELS.SENSOR_DATA_AGGREGATED, sensorId, column, aggregation, timeWindowMinutes),
    enabled: !!sensorId && !!column,
    refetchInterval: 30_000,
  })
}

export function useCreateSensor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateSensor) =>
      window.api.invoke<Sensor>(IPC_CHANNELS.SENSOR_CREATE, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sensors'] }),
  })
}

export function useUpdateSensor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateSensor) =>
      window.api.invoke<Sensor>(IPC_CHANNELS.SENSOR_UPDATE, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sensors'] }),
  })
}

export function useDeleteSensor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.SENSOR_DELETE, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sensors'] }),
  })
}

export function useRunSensor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.invoke(IPC_CHANNELS.SENSOR_RUN, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sensors'] })
      queryClient.invalidateQueries({ queryKey: ['sensor-data'] })
    },
  })
}
