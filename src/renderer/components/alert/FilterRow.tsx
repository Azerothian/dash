import { X } from 'lucide-react'
import type { AlertFilter, FilterOperator } from '@shared/entities'

const FILTER_OPERATORS: FilterOperator[] = ['==', '!=', '>', '<', '>=', '<=']

interface FilterRowProps {
  filter: AlertFilter
  columns: string[]
  onChange: (f: AlertFilter) => void
  onRemove: () => void
}

function parseValue(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  const num = Number(raw)
  if (raw !== '' && !isNaN(num)) return num
  return raw
}

export function FilterRow({ filter, columns, onChange, onRemove }: FilterRowProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={filter.column}
        onChange={(e) => onChange({ ...filter, column: e.target.value })}
      >
        <option value="">Column...</option>
        {columns.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>

      <select
        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={filter.operator}
        onChange={(e) => onChange({ ...filter, operator: e.target.value as FilterOperator })}
      >
        {FILTER_OPERATORS.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>

      <input
        type="text"
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={String(filter.value)}
        onChange={(e) => onChange({ ...filter, value: parseValue(e.target.value) })}
        placeholder="Value..."
      />

      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
