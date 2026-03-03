import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { useSensor, useCreateSensor, useUpdateSensor } from '../../hooks/useSensors'
import { CronInput } from '../shared/CronInput'
import { EnvVarEditor } from '../shared/EnvVarEditor'
import { SelectorTester } from './SelectorTester'
import type { ExecutionType, ColumnDefinition } from '@shared/entities'

interface SensorFormProps {
  sensorId?: string
  onClose: () => void
}

const EXECUTION_TYPES: { value: ExecutionType; label: string; platform?: string }[] = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'bash', label: 'Bash' },
  { value: 'docker', label: 'Docker' },
  { value: 'powershell', label: 'PowerShell', platform: 'win32' },
  { value: 'file', label: 'File' },
]

export function SensorForm({ sensorId, onClose }: SensorFormProps) {
  const { data: sensor, isLoading } = useSensor(sensorId)
  const createMutation = useCreateSensor()
  const updateMutation = useUpdateSensor()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [executionType, setExecutionType] = useState<ExecutionType>('typescript')
  const [scriptContent, setScriptContent] = useState('')
  const [scriptFilePath, setScriptFilePath] = useState('')
  const [tableDefinition, setTableDefinition] = useState<ColumnDefinition[]>([
    { name: 'value', type: 'DOUBLE' },
  ])
  const [cronExpression, setCronExpression] = useState('*/5 * * * *')
  const [envVars, setEnvVars] = useState<Record<string, string>>({})
  const [maxAgeDays, setMaxAgeDays] = useState<number | ''>('')
  const [maxRows, setMaxRows] = useState<number | ''>('')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (sensor) {
      setName(sensor.name)
      setDescription(sensor.description)
      setExecutionType(sensor.execution_type)
      setScriptContent(sensor.script_content)
      setScriptFilePath(sensor.script_file_path || '')
      setTableDefinition(sensor.table_definition)
      setCronExpression(sensor.cron_expression)
      setEnvVars(sensor.env_vars)
      setMaxAgeDays(sensor.retention_rules.max_age_days ?? '')
      setMaxRows(sensor.retention_rules.max_rows ?? '')
      setEnabled(sensor.enabled)
    }
  }, [sensor])

  const handleSubmit = async () => {
    const data = {
      name,
      description,
      execution_type: executionType,
      script_content: scriptContent,
      script_file_path: scriptFilePath,
      table_definition: tableDefinition,
      retention_rules: {
        ...(maxAgeDays ? { max_age_days: Number(maxAgeDays) } : {}),
        ...(maxRows ? { max_rows: Number(maxRows) } : {}),
      },
      cron_expression: cronExpression,
      env_vars: envVars,
      enabled,
    }

    if (sensorId) {
      await updateMutation.mutateAsync({ id: sensorId, ...data })
    } else {
      await createMutation.mutateAsync(data)
    }
    onClose()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  if (sensorId && isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const availableTypes = EXECUTION_TYPES.filter(
    (t) => !t.platform || (typeof process !== 'undefined' && t.platform === process.platform),
  )

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
            {sensorId ? 'Edit Sensor' : 'New Sensor'}
          </h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isPending || !name || (executionType === 'file' ? !scriptFilePath : !scriptContent)}
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
            placeholder="CPU Monitor"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Collects CPU usage metrics"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Execution Type</label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={executionType}
            onChange={(e) => setExecutionType(e.target.value as ExecutionType)}
          >
            {availableTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <CronInput value={cronExpression} onChange={setCronExpression} />

        {executionType === 'file' ? (
          <div>
            <label className="block text-sm font-medium mb-1">Script File</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                value={scriptFilePath}
                onChange={(e) => setScriptFilePath(e.target.value)}
                placeholder="/path/to/script.ts"
                readOnly
              />
              <button
                type="button"
                onClick={async () => {
                  const result = await window.api.invoke('dialog:open-file', {
                    filters: [{ name: 'Scripts', extensions: ['ts', 'mts', 'js', 'mjs', 'sh', 'bash', 'ps1'] }],
                  })
                  if (result) setScriptFilePath(result)
                }}
                className="rounded-md bg-secondary px-3 py-2 text-sm hover:bg-secondary/80"
              >
                Browse
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">Script</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[200px]"
              value={scriptContent}
              onChange={(e) => setScriptContent(e.target.value)}
              placeholder={
                executionType === 'typescript'
                  ? 'export default async function() {\n  return { value: 42 };\n}'
                  : '#!/bin/bash\necho \'{"value": 42}\''
              }
            />
          </div>
        )}

        <TableDefinitionEditor value={tableDefinition} onChange={setTableDefinition} />

        <SelectorTester columns={tableDefinition} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Max Age (days)</label>
            <input
              type="number"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={maxAgeDays}
              onChange={(e) => setMaxAgeDays(e.target.value ? Number(e.target.value) : '')}
              placeholder="30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Rows</label>
            <input
              type="number"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={maxRows}
              onChange={(e) => setMaxRows(e.target.value ? Number(e.target.value) : '')}
              placeholder="10000"
            />
          </div>
        </div>

        <EnvVarEditor value={envVars} onChange={setEnvVars} />

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
    </div>
  )
}

function TableDefinitionEditor({
  value,
  onChange,
}: {
  value: ColumnDefinition[]
  onChange: (v: ColumnDefinition[]) => void
}) {
  const add = () => onChange([...value, { name: '', type: 'VARCHAR', json_selector: '' }])
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const update = (i: number, field: keyof ColumnDefinition, val: string) =>
    onChange(value.map((col, idx) => (idx === i ? { ...col, [field]: val } : col)))

  const types = ['VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'TIMESTAMP', 'JSON']

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Table Definition</label>
      {value.map((col, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={col.name}
            onChange={(e) => update(i, 'name', e.target.value)}
            placeholder="Column name"
          />
          <select
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={col.type}
            onChange={(e) => update(i, 'type', e.target.value)}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            value={col.json_selector || ''}
            onChange={(e) => update(i, 'json_selector', e.target.value)}
            placeholder="JSON selector"
          />
          <button
            onClick={() => remove(i)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
      >
        + Add Column
      </button>
    </div>
  )
}
