import { useState } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { useAlerts } from '../../hooks/useAlerts'

interface AlertPickerProps {
  value: string[]
  onChange: (ids: string[]) => void
}

export function AlertPicker({ value, onChange }: AlertPickerProps) {
  const { data: alerts } = useAlerts()
  const [open, setOpen] = useState(false)

  const selected = alerts?.filter((a) => value.includes(a.id)) ?? []
  const available = alerts?.filter((a) => !value.includes(a.id)) ?? []

  return (
    <div>
      <label className="block text-sm font-medium mb-1">Alerts</label>
      <div className="space-y-2">
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs"
              >
                {a.name}
                <button
                  onClick={() => onChange(value.filter((id) => id !== a.id))}
                  className="rounded-full p-0.5 hover:bg-accent"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">
              {available.length ? 'Add alert...' : 'No alerts available'}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {open && available.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
              {available.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    onChange([...value, a.id])
                    setOpen(false)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
