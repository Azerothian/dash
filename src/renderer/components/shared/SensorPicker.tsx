import { X } from 'lucide-react'
import { useSensors } from '../../hooks/useSensors'

interface SensorPickerProps {
  value: string[]
  onChange: (ids: string[]) => void
}

export function SensorPicker({ value, onChange }: SensorPickerProps) {
  const { data: sensors } = useSensors()

  const available = sensors?.filter((s) => !value.includes(s.id)) ?? []
  const selected = sensors?.filter((s) => value.includes(s.id)) ?? []

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Associated Sensors</label>
      <div className="flex flex-wrap gap-1">
        {selected.map((s) => (
          <span
            key={s.id}
            className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs"
          >
            {s.name}
            <button
              onClick={() => onChange(value.filter((id) => id !== s.id))}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {available.length > 0 && (
        <select
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value])
          }}
        >
          <option value="">Add sensor...</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
