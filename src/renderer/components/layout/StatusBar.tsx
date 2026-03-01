import { useEffect, useState } from 'react'
import { Activity, AlertTriangle } from 'lucide-react'
import { IPC_CHANNELS } from '@shared/ipc-channels'

export function StatusBar() {
  const [status, setStatus] = useState({ runningSensors: 0, activeAlerts: 0 })

  useEffect(() => {
    const unsub = window.api.on(IPC_CHANNELS.CRON_TASK_STATUS, (_event: unknown, data: { runningSensors: number; activeAlerts: number }) => {
      setStatus(data)
    })
    return unsub
  }, [])

  return (
    <footer className="flex h-6 items-center border-t border-border bg-background px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          <span>{status.runningSensors} sensors running</span>
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span>{status.activeAlerts} active alerts</span>
        </span>
      </div>
      <div className="flex-1" />
      <span>Dash v0.1.0</span>
    </footer>
  )
}
