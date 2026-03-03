import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Plus,
  Play,
  Trash2,
  Edit2,
  Loader2,
  CheckCircle,
  XCircle,
  Shield,
  ShieldOff,
  History,
} from 'lucide-react'
import {
  useAlerts,
  useDeleteAlert,
  useRunAlert,
  useAckAlert,
  useClearAckAlert,
  useAlertHistory,
} from '../hooks/useAlerts'
import { AlertForm } from '../components/alert/AlertForm'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import type { Alert, AlertState } from '@shared/entities'

const STATE_STYLES: Record<AlertState, { bg: string; text: string; label: string }> = {
  ok: { bg: 'bg-alert-ok/10', text: 'text-alert-ok', label: 'OK' },
  notice: { bg: 'bg-alert-notice/10', text: 'text-alert-notice', label: 'Notice' },
  warning: { bg: 'bg-alert-warning/10', text: 'text-alert-warning', label: 'Warning' },
  error: { bg: 'bg-alert-error/10', text: 'text-alert-error', label: 'Error' },
}

export function AlertsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: alerts, isLoading } = useAlerts()
  const deleteMutation = useDeleteAlert()
  const runMutation = useRunAlert()
  const ackMutation = useAckAlert()
  const clearAckMutation = useClearAckAlert()

  const [stateFilter, setStateFilter] = useState<AlertState | 'all'>('all')
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [ackDialog, setAckDialog] = useState<string | null>(null)
  const [ackMessage, setAckMessage] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Alert | null>(null)

  if (id) {
    return (
      <AlertForm
        alertId={id === 'new' ? undefined : id}
        onClose={() => navigate('/alerts')}
      />
    )
  }

  if (showHistory) {
    return <AlertHistoryView alertId={showHistory} onClose={() => setShowHistory(null)} />
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const filtered = alerts?.filter(
    (a) => stateFilter === 'all' || a.state === stateFilter,
  ) ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Alerts</h1>
        </div>
        <button
          onClick={() => navigate('/alerts/new')}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Alert
        </button>
      </div>

      <div className="flex gap-2">
        {(['all', 'error', 'warning', 'notice', 'ok'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStateFilter(s)}
            className={`rounded-md px-3 py-1.5 text-xs capitalize ${
              stateFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            }`}
          >
            {s === 'all' ? 'All' : STATE_STYLES[s].label}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <AlertTriangle className="mb-4 h-12 w-12 opacity-20" />
          <p>No alerts{stateFilter !== 'all' ? ` with state "${stateFilter}"` : ''}.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">State</th>
                <th className="px-4 py-3 text-left font-medium">Priority</th>
                <th className="px-4 py-3 text-left font-medium">Ack</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alert) => (
                <tr key={alert.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{alert.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${STATE_STYLES[alert.state].bg} ${STATE_STYLES[alert.state].text}`}>
                      {STATE_STYLES[alert.state].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{alert.priority}</td>
                  <td className="px-4 py-3">
                    {alert.acknowledged ? (
                      <CheckCircle className="h-4 w-4 text-alert-ok" />
                    ) : alert.state !== 'ok' ? (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!alert.acknowledged && alert.state !== 'ok' && (
                        <button
                          onClick={() => { setAckDialog(alert.id); setAckMessage('') }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                          title="Acknowledge"
                        >
                          <Shield className="h-4 w-4" />
                        </button>
                      )}
                      {alert.acknowledged && (
                        <button
                          onClick={() => clearAckMutation.mutate(alert.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                          title="Clear Acknowledgement"
                        >
                          <ShieldOff className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => runMutation.mutate(alert.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                        title="Run Now"
                      >
                        {runMutation.isPending && runMutation.variables === alert.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Play className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setShowHistory(alert.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                        title="History"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/alerts/${alert.id}`)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(alert)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Alert"
          message={`Delete alert "${deleteTarget.name}"?`}
          onConfirm={() => {
            deleteMutation.mutate(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMutation.isPending}
        />
      )}

      {/* Ack Dialog */}
      {ackDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-lg border border-border bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Acknowledge Alert</h3>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] mb-4"
              value={ackMessage}
              onChange={(e) => setAckMessage(e.target.value)}
              placeholder="Acknowledgement message..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAckDialog(null)}
                className="rounded-md px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  ackMutation.mutate({ id: ackDialog, message: ackMessage })
                  setAckDialog(null)
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AlertHistoryView({ alertId, onClose }: { alertId: string; onClose: () => void }) {
  const { data: history, isLoading } = useAlertHistory(alertId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
          ←
        </button>
        <h1 className="text-2xl font-semibold">Alert History</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !history?.length ? (
        <p className="text-center text-muted-foreground py-8">No history entries.</p>
      ) : (
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Previous</th>
                <th className="px-4 py-3 text-left font-medium">New</th>
                <th className="px-4 py-3 text-left font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLES[h.previous_state].bg} ${STATE_STYLES[h.previous_state].text}`}>
                      {STATE_STYLES[h.previous_state].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATE_STYLES[h.new_state].bg} ${STATE_STYLES[h.new_state].text}`}>
                      {STATE_STYLES[h.new_state].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{h.message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
