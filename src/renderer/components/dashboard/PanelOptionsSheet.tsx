import { useState, useEffect } from 'react'
import { X, Save, Loader2, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { AlertPicker } from '../shared/AlertPicker'
import { SensorPicker } from '../shared/SensorPicker'
import { useSensors } from '../../hooks/useSensors'
import type { Panel, PanelType, GraphType, CreatePanel, UpdatePanel, GridstackConfig, PanelDataSource, GraphStyleConfig, AggregationFunction } from '@shared/entities'

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

const AGGREGATION_OPTIONS: { value: AggregationFunction; label: string }[] = [
  { value: 'last', label: 'Last (raw)' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count' },
]

const TIME_WINDOW_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 1440, label: '24 hours' },
]

const DEFAULT_STYLE: GraphStyleConfig = {
  show_grid: true,
  show_legend: true,
  show_dots: false,
  stroke_width: 2,
  fill_opacity: 0.2,
  curve_type: 'monotone',
}

export function PanelOptionsSheet({ panel, dashboardId, onSave, onClose, isPending }: PanelOptionsSheetProps) {
  const [type, setType] = useState<PanelType>(panel?.type || 'graph')
  const [graphType, setGraphType] = useState<GraphType>(panel?.graph_type || 'line')
  const [customComponent, setCustomComponent] = useState(panel?.custom_component || '')
  const [sensorIds, setSensorIds] = useState<string[]>(panel?.sensor_ids || [])
  const [alertIds, setAlertIds] = useState<string[]>(panel?.alert_ids || [])
  const [panelConfig, setPanelConfig] = useState<Record<string, unknown>>(panel?.panel_config || {})
  const [dataSources, setDataSources] = useState<PanelDataSource[]>(
    (panel?.panel_config?.data_sources as PanelDataSource[]) || []
  )
  const [style, setStyle] = useState<GraphStyleConfig>(
    (panel?.panel_config?.style as GraphStyleConfig) || DEFAULT_STYLE
  )
  const [showStyleOptions, setShowStyleOptions] = useState(false)

  const { data: sensors = [] } = useSensors()

  useEffect(() => {
    if (panel) {
      setType(panel.type)
      setGraphType(panel.graph_type || 'line')
      setCustomComponent(panel.custom_component || '')
      setSensorIds(panel.sensor_ids || [])
      setAlertIds(panel.alert_ids || [])
      setPanelConfig(panel.panel_config || {})
      setDataSources((panel.panel_config?.data_sources as PanelDataSource[]) || [])
      setStyle((panel.panel_config?.style as GraphStyleConfig) || DEFAULT_STYLE)
    }
  }, [panel])

  const addDataSource = () => {
    setDataSources([
      ...dataSources,
      { sensor_id: '', column: '', aggregation: 'last', time_window_minutes: 15, label: '' },
    ])
  }

  const removeDataSource = (index: number) => {
    setDataSources(dataSources.filter((_, i) => i !== index))
  }

  const updateDataSource = (index: number, updates: Partial<PanelDataSource>) => {
    setDataSources(dataSources.map((ds, i) => (i === index ? { ...ds, ...updates } : ds)))
  }

  const getSensorColumns = (sensorId: string): string[] => {
    const sensor = sensors.find((s) => s.id === sensorId)
    return sensor?.table_definition?.map((col) => col.name) || []
  }

  const handleSubmit = () => {
    const derivedSensorIds = [...new Set(dataSources.map((ds) => ds.sensor_id).filter(Boolean))]

    if (panel) {
      const data: UpdatePanel = {
        id: panel.id,
        type,
        graph_type: type === 'graph' ? graphType : null,
        custom_component: type === 'custom' ? customComponent : null,
        sensor_ids: type === 'graph' ? derivedSensorIds : sensorIds,
        alert_ids: alertIds,
        panel_config: { ...panelConfig, data_sources: dataSources, style },
      }
      onSave(data)
    } else {
      const data: CreatePanel = {
        dashboard_id: dashboardId,
        type,
        graph_type: type === 'graph' ? graphType : null,
        custom_component: type === 'custom' ? customComponent : null,
        gridstack_config: { x: 0, y: 0, w: 4, h: 3 },
        sensor_ids: type === 'graph' ? derivedSensorIds : sensorIds,
        alert_ids: alertIds,
        panel_config: { ...panelConfig, data_sources: dataSources, style },
      }
      onSave(data)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative ml-auto w-96 border-l border-border bg-card shadow-lg overflow-y-auto">
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

          {type === 'graph' ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Data Sources</label>
                <button
                  onClick={addDataSource}
                  className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-3 w-3" />
                  Add Data Source
                </button>
              </div>
              {dataSources.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">
                  No data sources. Click "Add Data Source" to begin.
                </p>
              )}
              <div className="space-y-3">
                {dataSources.map((ds, index) => {
                  const columns = getSensorColumns(ds.sensor_id)
                  return (
                    <div key={index} className="rounded-md border border-border p-3 space-y-2 bg-background">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Source {index + 1}</span>
                        <button
                          onClick={() => removeDataSource(index)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Sensor</label>
                        <select
                          value={ds.sensor_id}
                          onChange={(e) => updateDataSource(index, { sensor_id: e.target.value, column: '' })}
                          className="w-full rounded border border-input bg-card px-2 py-1.5 text-xs"
                        >
                          <option value="">Select sensor...</option>
                          {sensors.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Column</label>
                        <select
                          value={ds.column}
                          onChange={(e) => updateDataSource(index, { column: e.target.value })}
                          disabled={!ds.sensor_id}
                          className="w-full rounded border border-input bg-card px-2 py-1.5 text-xs disabled:opacity-50"
                        >
                          <option value="">Select column...</option>
                          {columns.map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Aggregation</label>
                          <select
                            value={ds.aggregation}
                            onChange={(e) => updateDataSource(index, { aggregation: e.target.value as AggregationFunction })}
                            className="w-full rounded border border-input bg-card px-2 py-1.5 text-xs"
                          >
                            {AGGREGATION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Time Window</label>
                          <select
                            value={ds.time_window_minutes}
                            onChange={(e) => updateDataSource(index, { time_window_minutes: Number(e.target.value) })}
                            className="w-full rounded border border-input bg-card px-2 py-1.5 text-xs"
                          >
                            {TIME_WINDOW_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Label (optional)</label>
                        <input
                          type="text"
                          value={ds.label || ''}
                          onChange={(e) => updateDataSource(index, { label: e.target.value })}
                          placeholder="Display label"
                          className="w-full rounded border border-input bg-card px-2 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <SensorPicker value={sensorIds} onChange={setSensorIds} />
          )}

          <AlertPicker value={alertIds} onChange={setAlertIds} />

          {type === 'graph' && (
            <>
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

              <div>
                <button
                  onClick={() => setShowStyleOptions(!showStyleOptions)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent"
                >
                  <span>Style Options</span>
                  {showStyleOptions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {showStyleOptions && (
                  <div className="mt-2 space-y-3 rounded-md border border-border p-3 bg-background">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={style.show_grid}
                          onChange={(e) => setStyle({ ...style, show_grid: e.target.checked })}
                          className="rounded"
                        />
                        Show Grid
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={style.show_legend}
                          onChange={(e) => setStyle({ ...style, show_legend: e.target.checked })}
                          className="rounded"
                        />
                        Show Legend
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={style.show_dots}
                          onChange={(e) => setStyle({ ...style, show_dots: e.target.checked })}
                          className="rounded"
                        />
                        Show Dots
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Stroke Width</label>
                        <select
                          value={style.stroke_width}
                          onChange={(e) => setStyle({ ...style, stroke_width: Number(e.target.value) })}
                          className="w-full rounded border border-input bg-card px-2 py-1.5 text-xs"
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Fill Opacity</label>
                        <select
                          value={style.fill_opacity}
                          onChange={(e) => setStyle({ ...style, fill_opacity: Number(e.target.value) })}
                          className="w-full rounded border border-input bg-card px-2 py-1.5 text-xs"
                        >
                          <option value={0}>0</option>
                          <option value={0.1}>0.1</option>
                          <option value={0.2}>0.2</option>
                          <option value={0.5}>0.5</option>
                          <option value={0.8}>0.8</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Curve Type</label>
                      <select
                        value={style.curve_type}
                        onChange={(e) => setStyle({ ...style, curve_type: e.target.value as GraphStyleConfig['curve_type'] })}
                        className="w-full rounded border border-input bg-card px-2 py-1.5 text-xs"
                      >
                        <option value="monotone">Monotone</option>
                        <option value="linear">Linear</option>
                        <option value="step">Step</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-border bg-card p-4">
          <button
            onClick={handleSubmit}
            disabled={isPending || (type === 'graph' && dataSources.length === 0)}
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
