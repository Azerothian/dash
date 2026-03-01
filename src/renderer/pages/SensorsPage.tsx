import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Activity,
  Plus,
  Play,
  Trash2,
  Edit2,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { useSensors, useDeleteSensor, useRunSensor } from '../hooks/useSensors'
import { SensorForm } from '../components/sensor/SensorForm'
import type { Sensor, ExecutionType } from '@shared/entities'

export function SensorsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: sensors, isLoading } = useSensors()
  const deleteMutation = useDeleteSensor()
  const runMutation = useRunSensor()
  const [showForm, setShowForm] = useState(!!id)

  if (id || showForm) {
    return (
      <SensorForm
        sensorId={id === 'new' ? undefined : id}
        onClose={() => {
          setShowForm(false)
          navigate('/sensors')
        }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Sensors</h1>
        </div>
        <button
          onClick={() => navigate('/sensors/new')}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Sensor
        </button>
      </div>

      {!sensors?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Activity className="mb-4 h-12 w-12 opacity-20" />
          <p>No sensors yet. Create one to start collecting data.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Cron</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((sensor) => (
                <SensorRow
                  key={sensor.id}
                  sensor={sensor}
                  onEdit={() => navigate(`/sensors/${sensor.id}`)}
                  onRun={() => runMutation.mutate(sensor.id)}
                  onDelete={() => {
                    if (confirm(`Delete sensor "${sensor.name}"?`)) {
                      deleteMutation.mutate(sensor.id)
                    }
                  }}
                  isRunning={runMutation.isPending && runMutation.variables === sensor.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SensorRow({
  sensor,
  onEdit,
  onRun,
  onDelete,
  isRunning,
}: {
  sensor: Sensor
  onEdit: () => void
  onRun: () => void
  onDelete: () => void
  isRunning: boolean
}) {
  const typeLabels: Record<ExecutionType, string> = {
    typescript: 'TS',
    bash: 'Bash',
    docker: 'Docker',
    powershell: 'PS',
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3 font-medium">{sensor.name}</td>
      <td className="px-4 py-3">
        <span className="rounded bg-secondary px-2 py-0.5 text-xs">
          {typeLabels[sensor.execution_type]}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {sensor.cron_expression}
      </td>
      <td className="px-4 py-3">
        {sensor.enabled ? (
          <span className="flex items-center gap-1 text-alert-ok">
            <CheckCircle className="h-3.5 w-3.5" />
            Active
          </span>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <XCircle className="h-3.5 w-3.5" />
            Paused
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            title="Run Now"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="Edit"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}
