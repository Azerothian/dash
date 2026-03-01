import { X } from 'lucide-react'
import { useSensors } from '../../hooks/useSensors'
import type { AlertRule, AggregationFunction, ComparisonOperator, AlertSeverity, Sensor } from '@shared/entities'

const AGGREGATIONS: AggregationFunction[] = ['avg', 'min', 'max', 'sum', 'count', 'last']
const OPERATORS: ComparisonOperator[] = ['>', '>=', '<', '<=', '==', '!=']
const SEVERITIES: AlertSeverity[] = ['notice', 'warning', 'error']

interface RuleRowProps {
  rule: AlertRule
  onChange: (rule: AlertRule) => void
  onRemove: () => void
}

export function RuleRow({ rule, onChange, onRemove }: RuleRowProps) {
  const { data: sensors = [] } = useSensors()

  const selectedSensor = sensors.find((s: Sensor) => s.id === rule.sensor_id)
  const columns = selectedSensor?.table_definition?.map((col) => col.name) ?? []

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase">Rule</span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Sensor</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={rule.sensor_id}
            onChange={(e) => onChange({ ...rule, sensor_id: e.target.value, column: '' })}
          >
            <option value="">Select sensor...</option>
            {sensors.map((s: Sensor) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Column</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={rule.column}
            onChange={(e) => onChange({ ...rule, column: e.target.value })}
            disabled={!rule.sensor_id}
          >
            <option value="">Select column...</option>
            {columns.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Aggregation</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={rule.aggregation}
            onChange={(e) => onChange({ ...rule, aggregation: e.target.value as AggregationFunction })}
          >
            {AGGREGATIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Window (min)</label>
          <input
            type="number"
            min={1}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={rule.time_window_minutes}
            onChange={(e) => onChange({ ...rule, time_window_minutes: Number(e.target.value) || 1 })}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Operator</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={rule.operator}
            onChange={(e) => onChange({ ...rule, operator: e.target.value as ComparisonOperator })}
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Threshold</label>
          <input
            type="number"
            step="any"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={rule.threshold}
            onChange={(e) => onChange({ ...rule, threshold: Number(e.target.value) })}
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Severity</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={rule.severity}
            onChange={(e) => onChange({ ...rule, severity: e.target.value as AlertSeverity })}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
