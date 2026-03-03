import { X, Plus } from 'lucide-react'
import { useSensors } from '../../hooks/useSensors'
import type {
  AlertMutation,
  AlertMutationAggregation,
  AlertMutationExpression,
  AlertFilter,
  AggregationFunction,
  MathOperator,
  Sensor,
  ColumnDefinition,
} from '@shared/entities'
import { FilterRow } from './FilterRow'

const ALL_AGGREGATIONS: AggregationFunction[] = ['avg', 'min', 'max', 'sum', 'count', 'last']
const MATH_OPERATORS: MathOperator[] = ['+', '-', '*', '/']

interface MutationRowProps {
  mutation: AlertMutation
  onChange: (m: AlertMutation) => void
  onRemove: () => void
  existingMutationNames: string[]
}

type TargetMode = 'sensor' | 'tag'

function defaultAggregation(name: string): AlertMutationAggregation {
  return {
    type: 'aggregation',
    name,
    sensor_id: '',
    column: '',
    aggregation: 'last',
    time_window_minutes: 5,
    filters: [],
  }
}

function defaultExpression(name: string): AlertMutationExpression {
  return {
    type: 'expression',
    name,
    left_operand: 0,
    operator: '+',
    right_operand: 0,
  }
}

interface OperandFieldProps {
  value: string | number
  onChange: (v: string | number) => void
  existingMutationNames: string[]
  label: string
}

function OperandField({ value, onChange, existingMutationNames, label }: OperandFieldProps) {
  const hasMutations = existingMutationNames.length > 0
  const isRef = hasMutations && typeof value === 'string' && existingMutationNames.includes(value)
  const isLiteral = !isRef

  if (!hasMutations) {
    return (
      <div>
        <label className="block text-xs text-muted-foreground mb-1">{label}</label>
        <input
          type="number"
          step="any"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    )
  }

  const selectValue = isRef ? (value as string) : '__literal__'

  return (
    <div className="space-y-1">
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <select
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === '__literal__') {
            onChange(0)
          } else {
            onChange(e.target.value)
          }
        }}
      >
        <option value="__literal__">Literal</option>
        {existingMutationNames.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      {isLiteral && (
        <input
          type="number"
          step="any"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </div>
  )
}

export function MutationRow({ mutation, onChange, onRemove, existingMutationNames }: MutationRowProps) {
  const { data: sensors = [] } = useSensors()

  const allTags = Array.from(new Set(sensors.flatMap((s: Sensor) => s.tags || [])))

  const handleTypeToggle = (newType: 'aggregation' | 'expression') => {
    if (newType === mutation.type) return
    if (newType === 'aggregation') {
      onChange(defaultAggregation(mutation.name))
    } else {
      onChange(defaultExpression(mutation.name))
    }
  }

  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase">Mutation</span>
        <div className="flex rounded-md border border-input overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => handleTypeToggle('aggregation')}
            className={`px-2 py-0.5 ${mutation.type === 'aggregation' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
          >
            Aggregation
          </button>
          <button
            type="button"
            onClick={() => handleTypeToggle('expression')}
            className={`px-2 py-0.5 ${mutation.type === 'expression' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
          >
            Expression
          </button>
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
  )

  if (mutation.type === 'expression') {
    const expr = mutation as AlertMutationExpression
    return (
      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        {header}

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Name</label>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={expr.name}
            onChange={(e) => onChange({ ...expr, name: e.target.value })}
            placeholder="Mutation name..."
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <OperandField
            label="Left Operand"
            value={expr.left_operand}
            onChange={(v) => onChange({ ...expr, left_operand: v })}
            existingMutationNames={existingMutationNames}
          />

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Operator</label>
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={expr.operator}
              onChange={(e) => onChange({ ...expr, operator: e.target.value as MathOperator })}
            >
              {MATH_OPERATORS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>

          <OperandField
            label="Right Operand"
            value={expr.right_operand}
            onChange={(v) => onChange({ ...expr, right_operand: v })}
            existingMutationNames={existingMutationNames}
          />
        </div>
      </div>
    )
  }

  // Aggregation mode
  const agg = mutation as AlertMutationAggregation
  const targetMode: TargetMode = agg.tag !== undefined ? 'tag' : 'sensor'

  const tagSensors = agg.tag
    ? sensors.filter((s: Sensor) => (s.tags || []).includes(agg.tag!))
    : []

  const selectedSensor = sensors.find((s: Sensor) => s.id === agg.sensor_id)

  let columns: ColumnDefinition[] = []
  if (targetMode === 'sensor' && selectedSensor) {
    columns = selectedSensor.table_definition ?? []
  } else if (targetMode === 'tag' && tagSensors.length > 0) {
    const first = tagSensors[0].table_definition?.map((c) => c.name) ?? []
    const common = first.filter((name) =>
      tagSensors.every((s: Sensor) => s.table_definition?.some((c) => c.name === name))
    )
    columns = tagSensors[0].table_definition?.filter((c) => common.includes(c.name)) ?? []
  }

  const columnNames = columns.map((c) => c.name)

  const handleTargetModeChange = (mode: TargetMode) => {
    if (mode === 'tag') {
      onChange({ ...agg, sensor_id: undefined, tag: '', column: '' })
    } else {
      onChange({ ...agg, sensor_id: '', tag: undefined, column: '' })
    }
  }

  const filters = agg.filters ?? []

  const handleFilterChange = (index: number, f: AlertFilter) => {
    const updated = filters.map((existing, i) => (i === index ? f : existing))
    onChange({ ...agg, filters: updated })
  }

  const handleFilterRemove = (index: number) => {
    onChange({ ...agg, filters: filters.filter((_, i) => i !== index) })
  }

  const handleAddFilter = () => {
    onChange({
      ...agg,
      filters: [...filters, { column: '', operator: '==', value: '' }],
    })
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      {header}

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Name</label>
        <input
          type="text"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={agg.name}
          onChange={(e) => onChange({ ...agg, name: e.target.value })}
          placeholder="Mutation name..."
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <label className="text-xs text-muted-foreground">
              {targetMode === 'sensor' ? 'Sensor' : 'Tag'}
            </label>
            <div className="flex rounded-md border border-input overflow-hidden text-xs ml-auto">
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
            </div>
          </div>
          {targetMode === 'sensor' ? (
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={agg.sensor_id || ''}
              onChange={(e) => onChange({ ...agg, sensor_id: e.target.value, tag: undefined, column: '' })}
            >
              <option value="">Select sensor...</option>
              {sensors.map((s: Sensor) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={agg.tag || ''}
              onChange={(e) => onChange({ ...agg, tag: e.target.value, sensor_id: undefined, column: '' })}
            >
              <option value="">Select tag...</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Column</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={agg.column}
            onChange={(e) => onChange({ ...agg, column: e.target.value })}
            disabled={targetMode === 'sensor' ? !agg.sensor_id : !agg.tag}
          >
            <option value="">Select column...</option>
            {columnNames.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Aggregation</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={agg.aggregation}
            onChange={(e) => onChange({ ...agg, aggregation: e.target.value as AggregationFunction })}
          >
            {ALL_AGGREGATIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Time Window (min)</label>
          <input
            type="number"
            min={1}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={agg.time_window_minutes}
            onChange={(e) => onChange({ ...agg, time_window_minutes: Number(e.target.value) || 1 })}
          />
        </div>
      </div>

      {filters.length > 0 && (
        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground">Filters</label>
          {filters.map((f, i) => (
            <FilterRow
              key={i}
              filter={f}
              columns={columnNames}
              onChange={(updated) => handleFilterChange(i, updated)}
              onRemove={() => handleFilterRemove(i)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddFilter}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Add Filter
      </button>
    </div>
  )
}
