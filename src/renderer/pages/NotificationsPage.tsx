import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Bell, Plus, Trash2, Edit2, Loader2, Send, History,
  Mail, Globe, Monitor,
} from 'lucide-react'
import {
  useNotifications, useDeleteNotification, useTestNotification, useNotificationHistory,
} from '../hooks/useNotifications'
import { NotificationForm } from '../components/notification/NotificationForm'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import type { Notification, NotificationMethod } from '@shared/entities'

const METHOD_ICONS: Record<NotificationMethod, typeof Mail> = {
  smtp: Mail,
  webhook: Globe,
  desktop: Monitor,
}

const METHOD_LABELS: Record<NotificationMethod, string> = {
  smtp: 'Email',
  webhook: 'Webhook',
  desktop: 'Desktop',
}

export function NotificationsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: notifications, isLoading } = useNotifications()
  const deleteMutation = useDeleteNotification()
  const testMutation = useTestNotification()

  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Notification | null>(null)

  if (id) {
    return (
      <NotificationForm
        notificationId={id === 'new' ? undefined : id}
        onClose={() => navigate('/notifications')}
      />
    )
  }

  if (showHistory) {
    return <NotificationHistoryView notificationId={showHistory} onClose={() => setShowHistory(null)} />
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
          <Bell className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Notifications</h1>
        </div>
        <button
          onClick={() => navigate('/notifications/new')}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Notification
        </button>
      </div>

      {!notifications?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="mb-4 h-12 w-12 opacity-20" />
          <p>No notifications configured.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-left font-medium">Filter</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => {
                const Icon = METHOD_ICONS[n.method]
                return (
                  <tr key={n.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{n.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {METHOD_LABELS[n.method]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {n.alert_state_filter}+ (p≤{n.min_priority})
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                        n.enabled
                          ? 'bg-alert-ok/10 text-alert-ok'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {n.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => testMutation.mutate(n.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                          title="Test Send"
                        >
                          {testMutation.isPending && testMutation.variables === n.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Send className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => setShowHistory(n.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                          title="History"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => navigate(`/notifications/${n.id}`)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(n)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Notification"
          message={`Delete notification "${deleteTarget.name}"?`}
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

function NotificationHistoryView({ notificationId, onClose }: { notificationId: string; onClose: () => void }) {
  const { data: history, isLoading } = useNotificationHistory(notificationId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
          ←
        </button>
        <h1 className="text-2xl font-semibold">Notification History</h1>
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
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(h.sent_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      h.status === 'sent'
                        ? 'bg-alert-ok/10 text-alert-ok'
                        : 'bg-alert-error/10 text-alert-error'
                    }`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{h.error_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
