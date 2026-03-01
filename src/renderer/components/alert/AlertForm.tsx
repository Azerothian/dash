import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Loader2, Plus } from 'lucide-react'
import { useAlert, useCreateAlert, useUpdateAlert } from '../../hooks/useAlerts'
import { CronInput } from '../shared/CronInput'
import { RuleRow } from './RuleRow'
import type { AlertRule } from '@shared/entities'

interface AlertFormProps {
  alertId?: string
  onClose: () => void
}

function emptyRule(): AlertRule {
  return {
    sensor_id: '',
    column: '',
    aggregation: 'last',
    time_window_minutes: 60,
    operator: '>',
    threshold: 0,
    severity: 'warning',
  }
}

export function AlertForm({ alertId, onClose }: AlertFormProps) {
  const { data: alert, isLoading } = useAlert(alertId)
  const createMutation = useCreateAlert()
  const updateMutation = useUpdateAlert()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState<AlertRule[]>([])
  const [cronExpression, setCronExpression] = useState('*/1 * * * *')
  const [priority, setPriority] = useState(1)
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (alert) {
      setName(alert.name)
      setDescription(alert.description)
      setRules(alert.rules?.length ? alert.rules : [])
      setCronExpression(alert.cron_expression)
      setPriority(alert.priority)
      setEnabled(alert.enabled)
    }
  }, [alert])

  const handleSubmit = async () => {
    const data = {
      name,
      description,
      rules,
      cron_expression: cronExpression,
      priority,
      enabled,
    }
    if (alertId) {
      await updateMutation.mutateAsync({ id: alertId, ...data })
    } else {
      await createMutation.mutateAsync(data)
    }
    onClose()
  }

  const updateRule = (index: number, rule: AlertRule) => {
    const next = [...rules]
    next[index] = rule
    setRules(next)
  }

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index))
  }

  const hasValidRule = rules.some((r) => r.sensor_id && r.column)
  const isPending = createMutation.isPending || updateMutation.isPending

  if (alertId && isLoading) {
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
          <h1 className="text-2xl font-semibold">{alertId ? 'Edit Alert' : 'New Alert'}</h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isPending || !name || !hasValidRule}
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
            placeholder="High CPU Alert"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Fires when CPU usage exceeds 90%"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Priority (1=highest)</label>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded" />
              <span className="text-sm font-medium">Enabled</span>
            </label>
          </div>
        </div>

        <CronInput value={cronExpression} onChange={setCronExpression} />

        <div className="space-y-2">
          <label className="block text-sm font-medium">Alert Rules</label>
          {rules.map((rule, i) => (
            <RuleRow
              key={i}
              rule={rule}
              onChange={(r) => updateRule(i, r)}
              onRemove={() => removeRule(i)}
            />
          ))}
          <button
            onClick={() => setRules([...rules, emptyRule()])}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add Rule
          </button>
        </div>
      </div>
    </div>
  )
}
