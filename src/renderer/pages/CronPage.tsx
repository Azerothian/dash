import { Clock, Play, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { useCronTasks, useForceRunCron, useToggleCron } from '../hooks/useCron'
import type { CronTaskType } from '@shared/entities'

const TYPE_LABELS: Record<CronTaskType, string> = {
  sensor: 'Sensor',
  alert: 'Alert',
  notification: 'Notification',
}

const TYPE_COLORS: Record<CronTaskType, string> = {
  sensor: 'bg-blue-500/10 text-blue-500',
  alert: 'bg-amber-500/10 text-amber-500',
  notification: 'bg-purple-500/10 text-purple-500',
}

export function CronPage() {
  const { data: tasks, isLoading } = useCronTasks()
  const forceRunMutation = useForceRunCron()
  const toggleMutation = useToggleCron()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Clock className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Cron Tasks</h1>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
          {tasks?.length ?? 0} tasks
        </span>
      </div>

      {!tasks?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Clock className="mb-4 h-12 w-12 opacity-20" />
          <p>No cron tasks registered. Create sensors, alerts, or notifications to see their scheduled tasks.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Schedule</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Last Run</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{task.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[task.type]}`}>
                      {TYPE_LABELS[task.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {task.cron_expression}
                  </td>
                  <td className="px-4 py-3">
                    {task.running ? (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running
                      </span>
                    ) : task.enabled ? (
                      <span className="text-xs text-alert-ok">Scheduled</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {task.last_run ? new Date(task.last_run).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => toggleMutation.mutate({ taskId: task.id, enabled: !task.enabled })}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                        title={task.enabled ? 'Disable' : 'Enable'}
                      >
                        {task.enabled
                          ? <ToggleRight className="h-4 w-4 text-alert-ok" />
                          : <ToggleLeft className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => forceRunMutation.mutate(task.id)}
                        disabled={task.running}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
                        title="Run Now"
                      >
                        {forceRunMutation.isPending && forceRunMutation.variables === task.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Play className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
