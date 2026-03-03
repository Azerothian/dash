import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Radio,
  Plus,
  Play,
  Trash2,
  Edit2,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { useMonitors, useDeleteMonitor, useRunMonitor } from '../hooks/useMonitors'
import { MonitorForm } from '../components/monitor/MonitorForm'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import type { Monitor, MonitorType } from '@shared/entities'

export function MonitorsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: monitors, isLoading } = useMonitors()
  const deleteMutation = useDeleteMonitor()
  const runMutation = useRunMonitor()
  const [showForm, setShowForm] = useState(!!id)
  const [deleteTarget, setDeleteTarget] = useState<Monitor | null>(null)

  if (id || showForm) {
    return (
      <MonitorForm
        monitorId={id === 'new' ? undefined : id}
        onClose={() => {
          setShowForm(false)
          navigate('/monitors')
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
          <Radio className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Monitors</h1>
        </div>
        <button
          onClick={() => navigate('/monitors/new')}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Monitor
        </button>
      </div>

      {!monitors?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Radio className="mb-4 h-12 w-12 opacity-20" />
          <p>No monitors yet. Create one to start monitoring external services.</p>
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
              {monitors.map((monitor) => (
                <MonitorRow
                  key={monitor.id}
                  monitor={monitor}
                  onEdit={() => navigate(`/monitors/${monitor.id}`)}
                  onRun={() => runMutation.mutate(monitor.id)}
                  onDelete={() => setDeleteTarget(monitor)}
                  isRunning={runMutation.isPending && runMutation.variables === monitor.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Monitor"
          message={`Delete monitor "${deleteTarget.name}"? This will also delete all managed sensors and their data.`}
          onConfirm={() => {
            deleteMutation.mutate(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  )
}

const typeLabels: Record<MonitorType, string> = {
  cloudflare_pages: 'Cloudflare Pages',
}

function MonitorRow({
  monitor,
  onEdit,
  onRun,
  onDelete,
  isRunning,
}: {
  monitor: Monitor
  onEdit: () => void
  onRun: () => void
  onDelete: () => void
  isRunning: boolean
}) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3 font-medium">{monitor.name}</td>
      <td className="px-4 py-3">
        <span className="rounded bg-secondary px-2 py-0.5 text-xs">
          {typeLabels[monitor.monitor_type] || monitor.monitor_type}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {monitor.cron_expression}
      </td>
      <td className="px-4 py-3">
        {monitor.enabled ? (
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
