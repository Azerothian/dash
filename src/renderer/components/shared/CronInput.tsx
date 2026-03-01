interface CronInputProps {
  value: string
  onChange: (value: string) => void
}

const PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
]

export function CronInput({ value, onChange }: CronInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Cron Expression</label>
      <input
        type="text"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="*/5 * * * *"
      />
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => onChange(preset.value)}
            className={`rounded px-2 py-0.5 text-xs ${
              value === preset.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
