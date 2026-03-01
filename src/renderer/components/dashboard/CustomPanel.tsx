import { useMemo } from 'react'
import { useSensorData } from '../../hooks/useSensors'
import type { Panel } from '@shared/entities'

interface CustomPanelProps {
  panel: Panel
}

export function CustomPanel({ panel }: CustomPanelProps) {
  const sensorId = panel.sensor_ids?.[0]
  const { data: sensorData } = useSensorData(sensorId, 50)

  const rendered = useMemo(() => {
    if (!panel.custom_component) return null
    try {
      const fn = new Function('data', 'sensorData', `
        ${panel.custom_component}
        if (typeof render === 'function') return render({ data: sensorData });
        return 'No render() function found';
      `)
      const result = fn(
        sensorData?.map((d) => d.data) ?? [],
        sensorData ?? [],
      )
      if (typeof result === 'string') return result
      return JSON.stringify(result, null, 2)
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`
    }
  }, [panel.custom_component, sensorData])

  const title = (panel.panel_config?.title as string) || ''

  return (
    <div className="flex h-full flex-col overflow-auto">
      {title && (
        <div className="px-2 pt-1 text-xs font-medium text-muted-foreground truncate">{title}</div>
      )}
      <div className="flex-1 p-2 text-sm">
        <pre className="whitespace-pre-wrap font-mono text-xs">{rendered}</pre>
      </div>
    </div>
  )
}
