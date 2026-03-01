import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Loader2, Plus, X } from 'lucide-react'
import { useAlert, useCreateAlert, useUpdateAlert } from '../../hooks/useAlerts'
import { CronInput } from '../shared/CronInput'
import { SensorPicker } from '../shared/SensorPicker'

interface AlertFormProps {
  alertId?: string
  onClose: () => void
}

export function AlertForm({ alertId, onClose }: AlertFormProps) {
  const { data: alert, isLoading } = useAlert(alertId)
  const createMutation = useCreateAlert()
  const updateMutation = useUpdateAlert()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [queries, setQueries] = useState<string[]>([''])
  const [evaluationScript, setEvaluationScript] = useState(
    'function evaluate(results) {\n  return "ok";\n}',
  )
  const [cronExpression, setCronExpression] = useState('*/1 * * * *')
  const [priority, setPriority] = useState(1)
  const [enabled, setEnabled] = useState(true)
  const [sensorIds, setSensorIds] = useState<string[]>([])

  useEffect(() => {
    if (alert) {
      setName(alert.name)
      setDescription(alert.description)
      setQueries(alert.queries.length ? alert.queries : [''])
      setEvaluationScript(alert.evaluation_script)
      setCronExpression(alert.cron_expression)
      setPriority(alert.priority)
      setEnabled(alert.enabled)
      setSensorIds(alert.sensor_ids || [])
    }
  }, [alert])

  const handleSubmit = async () => {
    const data = {
      name,
      description,
      queries: queries.filter((q) => q.trim()),
      evaluation_script: evaluationScript,
      cron_expression: cronExpression,
      priority,
      enabled,
      sensor_ids: sensorIds,
    }
    if (alertId) {
      await updateMutation.mutateAsync({ id: alertId, ...data })
    } else {
      await createMutation.mutateAsync(data)
    }
    onClose()
  }

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
          disabled={isPending || !name || !queries.some((q) => q.trim())}
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
          <label className="block text-sm font-medium">DuckDB Queries</label>
          {queries.map((q, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[80px]"
                value={q}
                onChange={(e) => {
                  const next = [...queries]
                  next[i] = e.target.value
                  setQueries(next)
                }}
                placeholder="SELECT avg(value) as avg_val FROM sensor_data WHERE ..."
              />
              {queries.length > 1 && (
                <button
                  onClick={() => setQueries(queries.filter((_, idx) => idx !== i))}
                  className="self-start rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setQueries([...queries, ''])}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add Query
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Evaluation Script (TypeScript)</label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[150px]"
            value={evaluationScript}
            onChange={(e) => setEvaluationScript(e.target.value)}
            placeholder={'function evaluate(results) {\n  // results[0] is the first query result\n  return "ok"; // or "notice", "warning", "error"\n}'}
          />
        </div>

        <SensorPicker value={sensorIds} onChange={setSensorIds} />
      </div>
    </div>
  )
}
