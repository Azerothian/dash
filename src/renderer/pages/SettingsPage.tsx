import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Plus, X, Loader2 } from 'lucide-react'
import { useSettings, useSettingsMutation } from '../hooks/useSettings'
import { useUiStore } from '../stores/ui-store'
import type { ThemeSetting, WebhookEndpoint, SmtpConfig } from '@shared/entities'

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const mutation = useSettingsMutation()
  const setTheme = useUiStore((s) => s.setTheme)

  if (isLoading || !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      {/* General */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">General</h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <ThemeSelector
            value={settings.theme}
            onChange={(theme) => {
              setTheme(theme)
              mutation.mutate({ key: 'theme', value: theme })
            }}
          />
          <ToggleRow
            label="Minimize to tray"
            checked={settings.minimize_to_tray}
            onChange={(v) => mutation.mutate({ key: 'minimize_to_tray', value: v })}
          />
          <ToggleRow
            label="Show tray icon"
            checked={settings.show_tray_icon}
            onChange={(v) => mutation.mutate({ key: 'show_tray_icon', value: v })}
          />
          <ToggleRow
            label="Close to tray"
            checked={settings.close_to_tray}
            onChange={(v) => mutation.mutate({ key: 'close_to_tray', value: v })}
          />
        </div>
      </section>

      {/* Notifications */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Notifications</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <ToggleRow
            label="Desktop notifications enabled"
            checked={settings.desktop_notifications_enabled}
            onChange={(v) =>
              mutation.mutate({ key: 'desktop_notifications_enabled', value: v })
            }
          />
        </div>
      </section>

      {/* Platform */}
      {typeof process !== 'undefined' && process.platform === 'win32' && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Platform (Windows)</h2>
          <div className="rounded-lg border border-border bg-card p-4">
            <label className="block text-sm font-medium mb-1">WSL Distribution</label>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={settings.wsl_distro || ''}
              placeholder="e.g. Ubuntu-22.04"
              onChange={(e) =>
                mutation.mutate({
                  key: 'wsl_distro',
                  value: e.target.value || null,
                })
              }
            />
          </div>
        </section>
      )}

      {/* Global SMTP */}
      <SmtpSection
        config={settings.smtp_config}
        onSave={(config) => mutation.mutate({ key: 'smtp_config', value: config })}
      />

      {/* Webhook Endpoints */}
      <WebhookSection
        endpoints={settings.webhook_endpoints}
        onSave={(endpoints) =>
          mutation.mutate({ key: 'webhook_endpoints', value: endpoints })
        }
      />

      {/* Global Environment Variables */}
      <EnvVarsSection
        vars={settings.global_env_vars}
        onSave={(vars) => mutation.mutate({ key: 'global_env_vars', value: vars })}
      />
    </div>
  )
}

function ThemeSelector({
  value,
  onChange,
}: {
  value: ThemeSetting
  onChange: (t: ThemeSetting) => void
}) {
  const options: ThemeSetting[] = ['light', 'dark', 'system']
  return (
    <div>
      <label className="block text-sm font-medium mb-2">Theme</label>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`rounded-md px-4 py-2 text-sm capitalize ${
              value === opt
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform mt-0.5 ${
            checked ? 'translate-x-4 ml-0.5' : 'translate-x-0 ml-0.5'
          }`}
        />
      </button>
    </label>
  )
}

function SmtpSection({
  config,
  onSave,
}: {
  config: SmtpConfig | null
  onSave: (c: SmtpConfig | null) => void
}) {
  const [smtp, setSmtp] = useState<SmtpConfig>(
    config || {
      host: '',
      port: 587,
      secure: true,
      auth: { user: '', pass: '' },
      from: '',
      to: [],
    },
  )

  useEffect(() => {
    if (config) setSmtp(config)
  }, [config])

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Global SMTP</h2>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Host</label>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={smtp.host}
              onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
              placeholder="smtp.example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Port</label>
            <input
              type="number"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={smtp.port}
              onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={smtp.auth.user}
              onChange={(e) =>
                setSmtp({ ...smtp, auth: { ...smtp.auth, user: e.target.value } })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={smtp.auth.pass}
              onChange={(e) =>
                setSmtp({ ...smtp, auth: { ...smtp.auth, pass: e.target.value } })
              }
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">From Address</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={smtp.from}
            onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
            placeholder="dash@example.com"
          />
        </div>
        <ToggleRow
          label="Use TLS"
          checked={smtp.secure}
          onChange={(v) => setSmtp({ ...smtp, secure: v })}
        />
        <button
          onClick={() => onSave(smtp.host ? smtp : null)}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Save SMTP
        </button>
      </div>
    </section>
  )
}

function WebhookSection({
  endpoints,
  onSave,
}: {
  endpoints: WebhookEndpoint[]
  onSave: (e: WebhookEndpoint[]) => void
}) {
  const [items, setItems] = useState<WebhookEndpoint[]>(endpoints)

  useEffect(() => {
    setItems(endpoints)
  }, [endpoints])

  const add = () =>
    setItems([...items, { name: '', url: '', method: 'POST', headers: {} }])

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i)
    setItems(next)
    onSave(next)
  }

  const update = (i: number, field: keyof WebhookEndpoint, value: string) => {
    const next = items.map((item, idx) =>
      idx === i ? { ...item, [field]: value } : item,
    )
    setItems(next)
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Webhook Endpoints</h2>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {items.map((ep, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={ep.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              placeholder="Name"
            />
            <input
              type="text"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={ep.url}
              onChange={(e) => update(i, 'url', e.target.value)}
              placeholder="https://..."
            />
            <button
              onClick={() => remove(i)}
              className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={add}
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add Endpoint
          </button>
          {items.length > 0 && (
            <button
              onClick={() => onSave(items)}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function EnvVarsSection({
  vars,
  onSave,
}: {
  vars: Record<string, string>
  onSave: (v: Record<string, string>) => void
}) {
  const [items, setItems] = useState<[string, string][]>(Object.entries(vars))

  useEffect(() => {
    setItems(Object.entries(vars))
  }, [vars])

  const add = () => setItems([...items, ['', '']])

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i)
    setItems(next)
    onSave(Object.fromEntries(next.filter(([k]) => k)))
  }

  const update = (i: number, pos: 0 | 1, value: string) => {
    const next = items.map((item, idx) => {
      if (idx !== i) return item
      const copy: [string, string] = [...item]
      copy[pos] = value
      return copy
    })
    setItems(next)
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Global Environment Variables</h2>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {items.map(([key, val], i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              value={key}
              onChange={(e) => update(i, 0, e.target.value)}
              placeholder="KEY"
            />
            <span className="text-muted-foreground">=</span>
            <input
              type="text"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              value={val}
              onChange={(e) => update(i, 1, e.target.value)}
              placeholder="value"
            />
            <button
              onClick={() => remove(i)}
              className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={add}
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add Variable
          </button>
          {items.length > 0 && (
            <button
              onClick={() => onSave(Object.fromEntries(items.filter(([k]) => k)))}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
