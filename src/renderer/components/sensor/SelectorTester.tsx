import { useState } from 'react'
import { ChevronDown, ChevronRight, FlaskConical } from 'lucide-react'
import { JSONPath } from 'jsonpath-plus'
import type { ColumnDefinition } from '@shared/entities'

interface SelectorTesterProps {
  columns: ColumnDefinition[]
}

interface TestResult {
  column: string
  selector: string
  value: unknown
  success: boolean
  error?: string
}

export function SelectorTester({ columns }: SelectorTesterProps) {
  const [open, setOpen] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [results, setResults] = useState<TestResult[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  const runTest = () => {
    setParseError(null)
    setResults([])

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonInput)
    } catch (e) {
      setParseError(`Invalid JSON: ${(e as Error).message}`)
      return
    }

    const testResults: TestResult[] = columns.map((col) => {
      if (!col.name) {
        return { column: '(unnamed)', selector: col.json_selector || '', value: undefined, success: false, error: 'No column name' }
      }

      try {
        let value: unknown
        if (col.json_selector) {
          value = JSONPath({ path: col.json_selector, json: parsed, wrap: false })
        } else {
          value = typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)[col.name]
            : undefined
        }
        return {
          column: col.name,
          selector: col.json_selector || `(key: ${col.name})`,
          value,
          success: value !== undefined && value !== null,
        }
      } catch (e) {
        return {
          column: col.name,
          selector: col.json_selector || '',
          value: undefined,
          success: false,
          error: (e as Error).message,
        }
      }
    })

    setResults(testResults)
  }

  const truncate = (val: unknown): string => {
    const str = JSON.stringify(val)
    return str.length > 80 ? str.slice(0, 80) + '...' : str
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <FlaskConical className="h-4 w-4" />
        Test Selectors
      </button>

      {open && (
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">
              Paste example JSON output
            </label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[100px]"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='{"value": 42, "cpu": {"usage": 85.5}}'
            />
          </div>

          <button
            type="button"
            onClick={runTest}
            disabled={!jsonInput.trim() || columns.length === 0}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Test
          </button>

          {parseError && (
            <p className="text-xs text-destructive">{parseError}</p>
          )}

          {results.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Column</th>
                    <th className="px-3 py-2 text-left font-medium">Selector</th>
                    <th className="px-3 py-2 text-left font-medium">Extracted Value</th>
                    <th className="px-3 py-2 text-center font-medium w-12">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{r.column}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{r.selector}</td>
                      <td className="px-3 py-2 font-mono">
                        {r.error ? (
                          <span className="text-destructive">{r.error}</span>
                        ) : (
                          truncate(r.value)
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.success ? (
                          <span className="text-alert-ok">&#10003;</span>
                        ) : (
                          <span className="text-destructive">&#10007;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
