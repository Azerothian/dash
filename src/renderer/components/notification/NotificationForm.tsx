import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { useNotification, useCreateNotification, useUpdateNotification } from '../../hooks/useNotifications'
import { CronInput } from '../shared/CronInput'
import type { NotificationMethod, AlertState, SmtpConfig, WebhookConfig } from '@shared/entities'

interface NotificationFormProps {
  notificationId?: string
  onClose: () => void
}

const METHODS: { value: NotificationMethod; label: string }[] = [
  { value: 'smtp', label: 'Email (SMTP)' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'desktop', label: 'Desktop' },
]

const STATES: { value: AlertState; label: string }[] = [
  { value: 'error', label: 'Error' },
  { value: 'warning', label: 'Warning' },
  { value: 'notice', label: 'Notice' },
  { value: 'ok', label: 'OK' },
]

export function NotificationForm({ notificationId, onClose }: NotificationFormProps) {
  const { data: notification, isLoading } = useNotification(notificationId)
  const createMutation = useCreateNotification()
  const updateMutation = useUpdateNotification()

  const [name, setName] = useState('')
  const [method, setMethod] = useState<NotificationMethod>('smtp')
  const [cronExpression, setCronExpression] = useState('*/5 * * * *')
  const [alertStateFilter, setAlertStateFilter] = useState<AlertState>('error')
  const [minPriority, setMinPriority] = useState(1)
  const [enabled, setEnabled] = useState(true)
  const [ejsTemplate, setEjsTemplate] = useState(
    'Alert: <%= alert.name %>\nState: <%= alert.state %>\nPriority: <%= alert.priority %>',
  )

  // SMTP config
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpTo, setSmtpTo] = useState('')
  const [useGlobal, setUseGlobal] = useState(false)

  // Webhook config
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookMethod, setWebhookMethod] = useState<'POST' | 'PUT'>('POST')

  useEffect(() => {
    if (notification) {
      setName(notification.name)
      setMethod(notification.method)
      setCronExpression(notification.cron_expression)
      setAlertStateFilter(notification.alert_state_filter)
      setMinPriority(notification.min_priority)
      setEnabled(notification.enabled)
      setEjsTemplate(notification.ejs_template)

      if (notification.method === 'smtp') {
        const cfg = notification.config as SmtpConfig
        setSmtpHost(cfg.host || '')
        setSmtpPort(cfg.port || 587)
        setSmtpSecure(cfg.secure || false)
        setSmtpUser(cfg.auth?.user || '')
        setSmtpPass(cfg.auth?.pass || '')
        setSmtpFrom(cfg.from || '')
        setSmtpTo(cfg.to?.join(', ') || '')
        setUseGlobal(cfg.use_global || false)
      } else if (notification.method === 'webhook') {
        const cfg = notification.config as WebhookConfig
        setWebhookUrl(cfg.url || '')
        setWebhookMethod(cfg.method || 'POST')
      }
    }
  }, [notification])

  const buildConfig = () => {
    switch (method) {
      case 'smtp':
        return {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: { user: smtpUser, pass: smtpPass },
          from: smtpFrom,
          to: smtpTo.split(',').map((s) => s.trim()).filter(Boolean),
          use_global: useGlobal,
        }
      case 'webhook':
        return {
          url: webhookUrl,
          method: webhookMethod,
          headers: {},
        }
      case 'desktop':
        return {}
    }
  }

  const handleSubmit = async () => {
    const data = {
      name,
      method,
      config: buildConfig(),
      ejs_template: ejsTemplate,
      cron_expression: cronExpression,
      alert_state_filter: alertStateFilter,
      min_priority: minPriority,
      enabled,
    }
    if (notificationId) {
      await updateMutation.mutateAsync({ id: notificationId, ...data })
    } else {
      await createMutation.mutateAsync(data)
    }
    onClose()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  if (notificationId && isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold">
            {notificationId ? 'Edit Notification' : 'New Notification'}
          </h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isPending || !name}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Critical Alert Email"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Method</label>
          <div className="flex gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  method === m.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Alert State Filter</label>
            <select
              value={alertStateFilter}
              onChange={(e) => setAlertStateFilter(e.target.value as AlertState)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>{s.label} and above</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Min Priority (1=highest)</label>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={minPriority}
              onChange={(e) => setMinPriority(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded" />
          <span className="text-sm font-medium">Enabled</span>
        </div>

        <CronInput value={cronExpression} onChange={setCronExpression} />

        {/* Method-specific config */}
        {method === 'smtp' && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <h4 className="text-sm font-medium">SMTP Configuration</h4>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useGlobal} onChange={(e) => setUseGlobal(e.target.checked)} className="rounded" />
              <span className="text-sm">Use Global SMTP Config</span>
            </label>
            {!useGlobal && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1">Host</label>
                    <input type="text" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                      value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Port</label>
                    <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                      value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1">Username</label>
                    <input type="text" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                      value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Password</label>
                    <input type="password" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                      value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} className="rounded" />
                  <span className="text-xs">Use TLS</span>
                </label>
              </>
            )}
            <div>
              <label className="block text-xs mb-1">From</label>
              <input type="text" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="alerts@example.com" />
            </div>
            <div>
              <label className="block text-xs mb-1">To (comma-separated)</label>
              <input type="text" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} placeholder="admin@example.com, ops@example.com" />
            </div>
          </div>
        )}

        {method === 'webhook' && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <h4 className="text-sm font-medium">Webhook Configuration</h4>
            <div>
              <label className="block text-xs mb-1">URL</label>
              <input type="text" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/..." />
            </div>
            <div>
              <label className="block text-xs mb-1">Method</label>
              <select value={webhookMethod} onChange={(e) => setWebhookMethod(e.target.value as 'POST' | 'PUT')}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </div>
        )}

        {method === 'desktop' && (
          <div className="rounded-md border border-border p-3">
            <p className="text-sm text-muted-foreground">
              Desktop notifications use the system notification API. No additional configuration needed.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Template (EJS)</label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[120px]"
            value={ejsTemplate}
            onChange={(e) => setEjsTemplate(e.target.value)}
            placeholder={'Alert: <%= alert.name %>\nState: <%= alert.state %>'}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Available variables: alert.name, alert.state, alert.priority, alert.description, timestamp
          </p>
        </div>
      </div>
    </div>
  )
}
