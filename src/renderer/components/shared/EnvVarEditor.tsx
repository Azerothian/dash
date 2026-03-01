import { Plus, X } from 'lucide-react'

interface EnvVarEditorProps {
  value: Record<string, string>
  onChange: (vars: Record<string, string>) => void
}

export function EnvVarEditor({ value, onChange }: EnvVarEditorProps) {
  const items = Object.entries(value)

  const add = () => onChange({ ...value, '': '' })

  const remove = (key: string) => {
    const next = { ...value }
    delete next[key]
    onChange(next)
  }

  const update = (oldKey: string, newKey: string, newVal: string) => {
    const entries = Object.entries(value).map(([k, v]) =>
      k === oldKey ? [newKey, newVal] : [k, v],
    )
    onChange(Object.fromEntries(entries))
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Environment Variables</label>
      {items.map(([key, val], i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            className="w-40 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            value={key}
            onChange={(e) => update(key, e.target.value, val)}
            placeholder="KEY"
          />
          <span className="text-muted-foreground">=</span>
          <input
            type="text"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            value={val}
            onChange={(e) => update(key, key, e.target.value)}
            placeholder="value"
          />
          <button
            onClick={() => remove(key)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
      >
        <Plus className="h-4 w-4" />
        Add Variable
      </button>
    </div>
  )
}
