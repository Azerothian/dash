import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Loader2, Wifi, WifiOff } from 'lucide-react'
import { useMonitor, useCreateMonitor, useUpdateMonitor, useTestMonitorConnection } from '../../hooks/useMonitors'
import { useSensors } from '../../hooks/useSensors'
import { CronInput } from '../shared/CronInput'
import type { MonitorType, CloudflarePagesConfig } from '@shared/entities'

interface MonitorFormProps {
  monitorId?: string
  onClose: () => void
}

export function MonitorForm({ monitorId, onClose }: MonitorFormProps) {
  const { data: monitor, isLoading } = useMonitor(monitorId)
  const { data: sensors } = useSensors()
  const createMutation = useCreateMonitor()
  const updateMutation = useUpdateMonitor()
  const testMutation = useTestMonitorConnection()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [monitorType, setMonitorType] = useState<MonitorType>('cloudflare_pages')
  const [apiToken, setApiToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [excludedProjects, setExcludedProjects] = useState<string[]>([])
  const [cronExpression, setCronExpression] = useState('*/5 * * * *')
  const [enabled, setEnabled] = useState(true)

  // Test connection state
  const [discoveredProjects, setDiscoveredProjects] = useState<string[] | null>(null)

  useEffect(() => {
    if (monitor) {
      setName(monitor.name)
      setDescription(monitor.description)
      setMonitorType(monitor.monitor_type)
      setCronExpression(monitor.cron_expression)
      setEnabled(monitor.enabled)
      if (monitor.monitor_type === 'cloudflare_pages') {
        const cfg = monitor.config as CloudflarePagesConfig
        setAccountId(cfg.account_id || '')
        setExcludedProjects(cfg.excluded_projects || [])
        // Don't populate token - it's encrypted
      }
    }
  }, [monitor])

  const handleTestConnection = async () => {
    if (!apiToken || !accountId) return
    const result = await testMutation.mutateAsync({
      api_token: apiToken,
      account_id: accountId,
      excluded_projects: [],
    })
    if (result.success && result.projects) {
      setDiscoveredProjects(result.projects)
    }
  }

  const handleSubmit = async () => {
    const config: CloudflarePagesConfig = {
      api_token: apiToken,
      account_id: accountId,
      excluded_projects: excludedProjects,
    }

    const data = {
      name,
      description,
      monitor_type: monitorType,
      config,
      cron_expression: cronExpression,
      enabled,
    }

    if (monitorId) {
      // Only send token if user typed a new one
      if (!apiToken) {
        // Remove token from config so backend doesn't re-encrypt empty string
        delete (data.config as Partial<CloudflarePagesConfig>).api_token
      }
      await updateMutation.mutateAsync({ id: monitorId, ...data })
    } else {
      await createMutation.mutateAsync(data)
    }
    onClose()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  if (monitorId && isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const managedSensors = sensors?.filter((s) => s.monitor_id === monitorId) || []

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold">
            {monitorId ? 'Edit Monitor' : 'New Monitor'}
          </h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isPending || !name || !accountId || (!monitorId && !apiToken)}
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
            placeholder="My Cloudflare Monitor"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Monitor Cloudflare Pages deployments"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Monitor Type</label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={monitorType}
            onChange={(e) => setMonitorType(e.target.value as MonitorType)}
          >
            <option value="cloudflare_pages">Cloudflare Pages</option>
          </select>
        </div>

        <CronInput value={cronExpression} onChange={setCronExpression} />
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-medium">Connection Settings</h2>

        <div>
          <label className="block text-sm font-medium mb-1">API Token</label>
          <input
            type="password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={monitorId ? '(unchanged - enter new token to update)' : 'Cloudflare API Token'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Account ID</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="Cloudflare Account ID"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTestConnection}
            disabled={testMutation.isPending || !apiToken || !accountId}
            className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm hover:bg-secondary/80 disabled:opacity-50"
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4" />
            )}
            Test Connection
          </button>
          {testMutation.isSuccess && testMutation.data?.success && (
            <span className="flex items-center gap-1 text-sm text-alert-ok">
              <Wifi className="h-4 w-4" /> Connected
            </span>
          )}
          {testMutation.isSuccess && !testMutation.data?.success && (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <WifiOff className="h-4 w-4" /> {testMutation.data?.error || 'Failed'}
            </span>
          )}
        </div>

        {discoveredProjects && discoveredProjects.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Discovered Projects ({discoveredProjects.length})
            </label>
            <p className="text-xs text-muted-foreground">
              Uncheck projects to exclude them from monitoring.
            </p>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background p-2 space-y-1">
              {discoveredProjects.map((project) => (
                <label key={project} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={!excludedProjects.includes(project)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setExcludedProjects(excludedProjects.filter((p) => p !== project))
                      } else {
                        setExcludedProjects([...excludedProjects, project])
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{project}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm font-medium">Enabled</span>
        </label>
      </div>

      {monitorId && managedSensors.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-medium">Managed Sensors ({managedSensors.length})</h2>
          <p className="text-xs text-muted-foreground">
            These sensors are automatically created and updated by this monitor.
          </p>
          <div className="space-y-1">
            {managedSensors.map((sensor) => (
              <div
                key={sensor.id}
                className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm"
              >
                <span>{sensor.name}</span>
                <span className="rounded bg-secondary px-2 py-0.5 text-xs">Managed</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
