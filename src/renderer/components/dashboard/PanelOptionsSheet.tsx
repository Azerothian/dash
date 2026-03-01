import { useState, useEffect } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { SensorPicker } from '../shared/SensorPicker'
import { AlertPicker } from '../shared/AlertPicker'
import type { Panel, PanelType, GraphType, CreatePanel, UpdatePanel, GridstackConfig } from '@shared/entities'

interface PanelOptionsSheetProps {
  panel?: Panel
  dashboardId: string
  onSave: (data: CreatePanel | UpdatePanel) => void
  onClose: () => void
  isPending?: boolean
}

const GRAPH_TYPES: { value: GraphType; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'radar', label: 'Radar' },
]

export function PanelOptionsSheet({ panel, dashboardId, onSave, onClose, isPending }: PanelOptionsSheetProps) {
  const [type, setType] = useState<PanelType>(panel?.type || 'graph')
  const [graphType, setGraphType] = useState<GraphType>(panel?.graph_type || 'line')
  const [customComponent, setCustomComponent] = useState(panel?.custom_component || '')
  const [sensorIds, setSensorIds] = useState<string[]>(panel?.sensor_ids || [])
  const [alertIds, setAlertIds] = useState<string[]>(panel?.alert_ids || [])
  const [panelConfig, setPanelConfig] = useState<Record<string, unknown>>(panel?.panel_config || {})

  useEffect(() => {
    if (panel) {
      setType(panel.type)
      setGraphType(panel.graph_type || 'line')
      setCustomComponent(panel.custom_component || '')
      setSensorIds(panel.sensor_ids || [])
      setAlertIds(panel.alert_ids || [])
      setPanelConfig(panel.panel_config || {})
    }
  }, [panel])

  const handleSubmit = () => {
    if (panel) {
      const data: UpdatePanel = {
        id: panel.id,
        type,
        graph_type: type === 'graph' ? graphType : null,
        custom_component: type === 'custom' ? customComponent : null,
        sensor_ids: sensorIds,
        alert_ids: alertIds,
        panel_config: panelConfig,
      }
      onSave(data)
    } else {
      const data: CreatePanel = {
        dashboard_id: dashboardId,
        type,
        graph_type: type === 'graph' ? graphType : null,
        custom_component: type === 'custom' ? customComponent : null,
        gridstack_config: { x: 0, y: 0, w: 4, h: 3 },
        sensor_ids: sensorIds,
        alert_ids: alertIds,
        panel_config: panelConfig,
      }
      onSave(data)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative ml-auto w-80 border-l border-border bg-card shadow-lg overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h3 className="font-semibold">{panel ? 'Edit Panel' : 'Add Panel'}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className="block text-sm font-medium mb-1">Panel Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PanelType)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="graph">Graph</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {type === 'graph' && (
            <div>
              <label className="block text-sm font-medium mb-1">Graph Type</label>
              <div className="grid grid-cols-3 gap-1">
                {GRAPH_TYPES.map((gt) => (
                  <button
                    key={gt.value}
                    onClick={() => setGraphType(gt.value)}
                    className={`rounded-md px-2 py-1.5 text-xs ${
                      graphType === gt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-accent'
                    }`}
                  >
                    {gt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'custom' && (
            <div>
              <label className="block text-sm font-medium mb-1">Custom Component (JSX)</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[120px]"
                value={customComponent}
                onChange={(e) => setCustomComponent(e.target.value)}
                placeholder={'function render({ data }) {\n  return <div>{JSON.stringify(data)}</div>\n}'}
              />
            </div>
          )}

          <SensorPicker value={sensorIds} onChange={setSensorIds} />
          <AlertPicker value={alertIds} onChange={setAlertIds} />

          {type === 'graph' && (
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={(panelConfig.title as string) || ''}
                onChange={(e) => setPanelConfig({ ...panelConfig, title: e.target.value })}
                placeholder="Panel title"
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-border bg-card p-4">
          <button
            onClick={handleSubmit}
            disabled={isPending || (type === 'graph' && !sensorIds.length)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {panel ? 'Update Panel' : 'Add Panel'}
          </button>
        </div>
      </div>
    </div>
  )
}
