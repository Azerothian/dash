import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useSensor, useSensorData } from '../../hooks/useSensors'

const LIMIT_OPTIONS = [25, 50, 100, 500] as const

export function SensorDataView({ sensorId, onClose }: { sensorId: string; onClose: () => void }) {
  const [limit, setLimit] = useState<number>(100)
  const { data: sensor } = useSensor(sensorId)
  const { data: rows, isLoading } = useSensorData(sensorId, limit)

  const columns = sensor?.table_definition ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
          ←
        </button>
        <h1 className="text-2xl font-semibold">Sensor Data: {sensor?.name ?? '…'}</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Limit:</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !rows?.length ? (
        <p className="text-center text-muted-foreground py-8">No data collected yet.</p>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Collected At</th>
                  {columns.map((col) => (
                    <th key={col.name} className="px-4 py-3 text-left font-medium">{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(row.collected_at).toLocaleString()}</td>
                    {columns.map((col) => (
                      <td key={col.name} className="px-4 py-3">{String(row.data[col.name] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">Showing {rows.length} rows</p>
        </>
      )}
    </div>
  )
}
