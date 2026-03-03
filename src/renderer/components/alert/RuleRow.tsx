import { X, Plus } from 'lucide-react'
import { useSensors } from '../../hooks/useSensors'
import type { AlertRule, AggregationFunction, ComparisonOperator, AlertSeverity, Sensor, ColumnDefinition, AlertFilter } from '@shared/entities'
import { FilterRow } from './FilterRow'

const ALL_AGGREGATIONS: AggregationFunction[] = ['avg', 'min', 'max', 'sum', 'count', 'last']
const NUMERIC_AGGREGATIONS: AggregationFunction[] = ['avg', 'min', 'max', 'sum', 'count', 'last']
const NON_NUMERIC_AGGREGATIONS: AggregationFunction[] = ['last', 'count']
const ALL_OPERATORS: ComparisonOperator[] = ['>', '>=', '<', '<=', '==', '!=']
const EQUALITY_OPERATORS: ComparisonOperator[] = ['==', '!=']
const SEVERITIES: AlertSeverity[] = ['notice', 'warning', 'error']

const NUMERIC_TYPES = ['INTEGER', 'BIGINT', 'DOUBLE', 'TIMESTAMP']

function isNumericType(colType: string): boolean {
  return NUMERIC_TYPES.includes(colType.toUpperCase())
}

function isBooleanType(colType: string): boolean {
  return colType.toUpperCase() === 'BOOLEAN'
}

function getColumnType(sensor: Sensor | undefined, column: string): string | undefined {
  if (!sensor || !column) return undefined
  const col = sensor.table_definition.find((c) => c.name === column)
  return col?.type
}

function getDefaultThreshold(colType: string | undefined): number | string | boolean {
  if (!colType) return 0
  if (isBooleanType(colType)) return true
  if (!isNumericType(colType)) return ''
  return 0
}

function getDefaultOperator(colType: string | undefined): ComparisonOperator {
  if (!colType) return '>'
  if (!isNumericType(colType) || isBooleanType(colType)) return '=='
  return '>'
}

interface RuleRowProps {
  rule: AlertRule
  onChange: (rule: AlertRule) => void
  onRemove: () => void
  mutationNames?: string[]
}

type TargetMode = 'sensor' | 'tag' | 'mutation'

export function RuleRow({ rule, onChange, onRemove, mutationNames = [] }: RuleRowProps) {
  const { data: sensors = [] } = useSensors()

  const targetMode: TargetMode = rule.mutation_ref !== undefined ? 'mutation' : rule.tag !== undefined ? 'tag' : 'sensor'

  // Collect all unique tags from sensors
  const allTags = Array.from(new Set(sensors.flatMap((s: Sensor) => s.tags || [])))

  // Get sensors matching the current tag
  const tagSensors = rule.tag
    ? sensors.filter((s: Sensor) => (s.tags || []).includes(rule.tag!))
    : []

  const selectedSensor = sensors.find((s: Sensor) => s.id === rule.sensor_id)

  // Determine columns based on target mode
  let columns: ColumnDefinition[] = []
  if (targetMode === 'sensor' && selectedSensor) {
    columns = selectedSensor.table_definition ?? []
  } else if (targetMode === 'tag' && tagSensors.length > 0) {
    // Intersection of columns across all tagged sensors
    const first = tagSensors[0].table_definition?.map((c) => c.name) ?? []
    const common = first.filter((name) =>
      tagSensors.every((s: Sensor) => s.table_definition?.some((c) => c.name === name))
    )
    columns = tagSensors[0].table_definition?.filter((c) => common.includes(c.name)) ?? []
  }

  const columnNames = columns.map((c) => c.name)

  // Resolve column type from the first available sensor
  const refSensor = targetMode === 'sensor' ? selectedSensor : tagSensors[0]
  const columnType = getColumnType(refSensor, rule.column)
  const isNumeric = columnType ? isNumericType(columnType) : true
  const isBoolean = columnType ? isBooleanType(columnType) : false

  const aggregations = isNumeric ? NUMERIC_AGGREGATIONS : NON_NUMERIC_AGGREGATIONS
  const operators = (isNumeric && !isBoolean) ? ALL_OPERATORS : EQUALITY_OPERATORS

  const showWindow = rule.aggregation !== 'last'

  const handleTargetModeChange = (mode: TargetMode) => {
    if (mode === 'tag') {
      onChange({ ...rule, sensor_id: undefined, tag: '', column: '', threshold: 0, operator: '>', aggregation: 'last', mutation_ref: undefined })
    } else if (mode === 'mutation') {
      onChange({ ...rule, sensor_id: undefined, tag: undefined, column: '', mutation_ref: '', threshold: 0, operator: '>', aggregation: 'last', time_window_minutes: 60 })
    } else {
      onChange({ ...rule, sensor_id: '', tag: undefined, column: '', threshold: 0, operator: '>', aggregation: 'last', mutation_ref: undefined })
    }
  }

  const handleColumnChange = (col: string) => {
    const newColType = getColumnType(refSensor, col)
    const newThreshold = getDefaultThreshold(newColType)
    const newOperator = getDefaultOperator(newColType)
    const newAgg = newColType && !isNumericType(newColType) && rule.aggregation !== 'last' && rule.aggregation !== 'count'
      ? 'last' as AggregationFunction
      : rule.aggregation
    onChange({ ...rule, column: col, threshold: newThreshold, operator: newOperator, aggregation: newAgg })
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">Rule</span>
          <div className="flex rounded-md border border-input overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => handleTargetModeChange('sensor')}
              className={`px-2 py-0.5 ${targetMode === 'sensor' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
            >
              Sensor
            </button>
            <button
              type="button"
              onClick={() => handleTargetModeChange('tag')}
              className={`px-2 py-0.5 ${targetMode === 'tag' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
            >
              Tag
            </button>
            {mutationNames.length > 0 && (
              <button
                type="button"
                onClick={() => handleTargetModeChange('mutation')}
                className={`px-2 py-0.5 ${targetMode === 'mutation' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
              >
                Mutation
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {targetMode === 'mutation' ? (
        <div className="grid gap-2 grid-cols-1">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Mutation</label>
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={rule.mutation_ref || ''}
              onChange={(e) => onChange({ ...rule, mutation_ref: e.target.value })}
            >
              <option value="">Select mutation...</option>
              {mutationNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className={`grid gap-2 ${showWindow ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {targetMode === 'sensor' ? (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Sensor</label>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={rule.sensor_id || ''}
                onChange={(e) => onChange({ ...rule, sensor_id: e.target.value, tag: undefined, column: '' })}
              >
                <option value="">Select sensor...</option>
                {sensors.map((s: Sensor) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Tag</label>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={rule.tag || ''}
                onChange={(e) => onChange({ ...rule, tag: e.target.value, sensor_id: undefined, column: '' })}
              >
                <option value="">Select tag...</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Column</label>
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={rule.column}
              onChange={(e) => handleColumnChange(e.target.value)}
              disabled={targetMode === 'sensor' ? !rule.sensor_id : !rule.tag}
            >
              <option value="">Select column...</option>
              {columnNames.map((col) => (
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
              {aggregations.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {showWindow && (
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
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Operator</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={rule.operator}
            onChange={(e) => onChange({ ...rule, operator: e.target.value as ComparisonOperator })}
          >
            {operators.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Threshold</label>
          {isBoolean ? (
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={String(rule.threshold)}
              onChange={(e) => onChange({ ...rule, threshold: e.target.value === 'true' })}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : isNumeric ? (
            <input
              type="number"
              step="any"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={typeof rule.threshold === 'number' ? rule.threshold : ''}
              onChange={(e) => onChange({ ...rule, threshold: Number(e.target.value) })}
            />
          ) : (
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={typeof rule.threshold === 'string' ? rule.threshold : String(rule.threshold)}
              onChange={(e) => onChange({ ...rule, threshold: e.target.value })}
              placeholder="Value to compare..."
            />
          )}
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

      {targetMode !== 'mutation' && (
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">Filters</label>
          {(rule.filters || []).map((filter, fi) => (
            <FilterRow
              key={fi}
              filter={filter}
              columns={columnNames}
              onChange={(f) => {
                const next = [...(rule.filters || [])]
                next[fi] = f
                onChange({ ...rule, filters: next })
              }}
              onRemove={() => {
                const next = (rule.filters || []).filter((_, i) => i !== fi)
                onChange({ ...rule, filters: next })
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...rule, filters: [...(rule.filters || []), { column: '', operator: '==', value: '' }] })}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add Filter
          </button>
        </div>
      )}
    </div>
  )
}
