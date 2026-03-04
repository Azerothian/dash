import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Loader2, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { useMonitor, useCreateMonitor, useUpdateMonitor, useTestMonitorConnection, useDiscoverMonitorProjects } from '../../hooks/useMonitors'
import { useCredentials } from '../../hooks/useCredentials'
import { useSensors } from '../../hooks/useSensors'
import { useQueryClient } from '@tanstack/react-query'
import { CronInput } from '../shared/CronInput'
import type { MonitorType, CloudflarePagesConfig, CloudflarePagesProjectConfig } from '@shared/entities'

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
  const { data: discovered } = useDiscoverMonitorProjects(monitorId)
  const { data: allCredentials } = useCredentials()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [monitorType, setMonitorType] = useState<MonitorType>('cloudflare_pages')
  const [apiToken, setApiToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [projects, setProjects] = useState<CloudflarePagesProjectConfig[]>([])
  const [credentialId, setCredentialId] = useState<string | null>(null)
  const [cronExpression, setCronExpression] = useState('*/5 * * * *')
  const [enabled, setEnabled] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (monitor) {
      setName(monitor.name)
      setDescription(monitor.description)
      setMonitorType(monitor.monitor_type)
      setCronExpression(monitor.cron_expression)
      setEnabled(monitor.enabled)
      setCredentialId(monitor.credential_id || null)
      if (monitor.monitor_type === 'cloudflare_pages') {
        const cfg = monitor.config as CloudflarePagesConfig
        setAccountId(cfg.account_id || '')
        // Load projects config, with migration from excluded_projects
        if (cfg.projects && cfg.projects.length > 0) {
          setProjects(cfg.projects)
        } else {
          // Derive from managed sensors for legacy monitors (tag-based lookup)
          const managed = sensors?.filter((s) => s.monitor_id === monitor.id) || []
          const derived: CloudflarePagesProjectConfig[] = []
          const functionsNames = new Set<string>()
          for (const s of managed) {
            const projectTag = s.tags.find((t) => t.startsWith('project:'))
            if (!projectTag) continue
            const projectName = projectTag.slice(8)
            if (s.tags.includes('functions')) {
              functionsNames.add(projectName)
            } else if (!derived.find((d) => d.name === projectName)) {
              derived.push({ name: projectName, branches: [], environments: ['production'], collect_metrics: false })
            }
          }
          if (derived.length > 0) {
            for (const p of derived) {
              if (functionsNames.has(p.name)) p.collect_metrics = true
            }
            setProjects(derived)
          }
        }
        // Don't populate token - it's encrypted
      }
    }
  }, [monitor, sensors])

  // Merge discovered projects into list (from backend discover query for existing monitors)
  useEffect(() => {
    if (discovered?.success && discovered.projects) {
      mergeDiscoveredProjects(discovered.projects)
    }
  }, [discovered])

  const mergeDiscoveredProjects = (discoveredList: { name: string; production_branch: string }[]) => {
    setProjects((prev) => {
      const existingNames = new Set(prev.map((p) => p.name))
      const newProjects = discoveredList
        .filter((p) => !existingNames.has(p.name))
        .map((p) => ({
          name: p.name,
          branches: [p.production_branch],
          environments: ['production'] as string[],
          collect_metrics: false,
          enabled: true,
        }))
      return newProjects.length > 0 ? [...prev, ...newProjects] : prev
    })
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      if (monitorId) {
        // Existing monitor: invalidate discover query to re-fetch via stored credential
        await queryClient.invalidateQueries({ queryKey: ['monitor-projects', monitorId] })
      } else if (!credentialId && apiToken && accountId) {
        // New monitor with inline token: use test connection
        const result = await testMutation.mutateAsync({
          api_token: apiToken,
          account_id: accountId,
          excluded_projects: [],
          projects: [],
        })
        if (result.success && result.projects) {
          mergeDiscoveredProjects(result.projects)
        }
      }
    } finally {
      setRefreshing(false)
    }
  }

  const canRefresh = monitorId ? true : (!credentialId && !!apiToken && !!accountId)

  const handleUpdateProject = (index: number, updates: Partial<CloudflarePagesProjectConfig>) => {
    setProjects(projects.map((p, i) => i === index ? { ...p, ...updates } : p))
  }

  const handleSubmit = async () => {
    const config: CloudflarePagesConfig = {
      api_token: apiToken,
      account_id: accountId,
      excluded_projects: [],
      projects,
    }

    const data = {
      name,
      description,
      monitor_type: monitorType,
      config,
      credential_id: credentialId,
      cron_expression: cronExpression,
      enabled,
    }

    if (monitorId) {
      // Only send token if user typed a new one
      if (!apiToken) {
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
          disabled={isPending || !name || (!credentialId && !accountId) || (!credentialId && !monitorId && !apiToken)}
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

        {/* Credential selector */}
        {(() => {
          const cfCredentials = allCredentials?.filter((c) => c.credential_type === 'cloudflare') || []
          return cfCredentials.length > 0 ? (
            <div>
              <label className="block text-sm font-medium mb-1">Credential</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={credentialId || ''}
                onChange={(e) => {
                  const val = e.target.value
                  setCredentialId(val || null)
                  if (val) {
                    // When credential is selected, clear inline fields
                    setApiToken('')
                    setAccountId('')
                  }
                }}
              >
                <option value="">Enter manually</option>
                {cfCredentials.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : null
        })()}

        {/* Inline token/account fields - hidden when credential selected */}
        {!credentialId && (
          <>
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
                onClick={handleRefresh}
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
          </>
        )}

        {credentialId && (
          <p className="text-sm text-muted-foreground">
            Using stored credential. Token and Account ID are managed in Settings &gt; Credentials.
          </p>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Projects ({projects.length})</h2>
          <button
            onClick={handleRefresh}
            disabled={!canRefresh || refreshing || testMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80 disabled:opacity-50"
            title={!canRefresh ? 'Save monitor first to enable refresh with stored credential' : 'Refresh projects from Cloudflare'}
          >
            {refreshing || testMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No projects configured. Use Refresh to discover projects.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Configure which projects to monitor, branch filters, and metrics collection.
            </p>
            <div className="space-y-3">
              {projects.map((project, index) => {
                const isEnabled = project.enabled !== false
                return (
                  <div
                    key={project.name}
                    className={`rounded-md border border-border bg-background p-3 space-y-2 ${!isEnabled ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{project.name}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => handleUpdateProject(index, { enabled: !isEnabled })}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">
                        Branches (comma-separated, empty = all)
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                        value={project.branches.join(', ')}
                        onChange={(e) => {
                          const branches = e.target.value
                            .split(',')
                            .map((b) => b.trim())
                            .filter(Boolean)
                          handleUpdateProject(index, { branches })
                        }}
                        placeholder="main"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={project.collect_metrics}
                        onChange={(e) => handleUpdateProject(index, { collect_metrics: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-xs">Collect Functions metrics</span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground">Environments:</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(project.environments || ['production']).includes('production')}
                          onChange={(e) => {
                            const current = project.environments || ['production']
                            const next = e.target.checked
                              ? [...current.filter((x) => x !== 'production'), 'production']
                              : current.filter((x) => x !== 'production')
                            handleUpdateProject(index, { environments: next })
                          }}
                          className="rounded"
                        />
                        <span className="text-xs">Production</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(project.environments || ['production']).includes('preview')}
                          onChange={(e) => {
                            const current = project.environments || ['production']
                            const next = e.target.checked
                              ? [...current.filter((x) => x !== 'preview'), 'preview']
                              : current.filter((x) => x !== 'preview')
                            handleUpdateProject(index, { environments: next })
                          }}
                          className="rounded"
                        />
                        <span className="text-xs">Preview</span>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
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
