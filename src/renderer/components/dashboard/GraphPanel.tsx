import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useSensorData, useSensorDataAggregated } from '../../hooks/useSensors'
import type { Panel, PanelDataSource, GraphStyleConfig } from '@shared/entities'

const COLORS = [
  'hsl(var(--chart-1, 220 70% 50%))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
]

const DEFAULT_STYLE: GraphStyleConfig = {
  show_grid: true,
  show_legend: true,
  show_dots: false,
  stroke_width: 2,
  fill_opacity: 0.2,
  curve_type: 'monotone',
}

interface GraphPanelProps {
  panel: Panel
}

export function GraphPanel({ panel }: GraphPanelProps) {
  const dataSources = (panel.panel_config?.data_sources as PanelDataSource[]) || []
  const style: GraphStyleConfig = { ...DEFAULT_STYLE, ...((panel.panel_config?.style as Partial<GraphStyleConfig>) || {}) }
  const hasDataSources = dataSources.length > 0

  const timeSeriesSources = dataSources.filter(ds => ds.aggregation === 'last')
  const aggregatedSources = dataSources.filter(ds => ds.aggregation !== 'last')

  const sensorId = hasDataSources
    ? (timeSeriesSources[0]?.sensor_id || aggregatedSources[0]?.sensor_id)
    : panel.sensor_ids?.[0]

  const { data: sensorData, isLoading } = useSensorData(sensorId, 100)

  const chartData = useMemo(() => {
    if (!sensorData?.length) return []
    return sensorData
      .slice()
      .reverse()
      .map((d) => ({
        time: new Date(d.collected_at).toLocaleTimeString(),
        ...d.data,
      }))
  }, [sensorData])

  const dataKeys = useMemo(() => {
    if (!chartData.length) return []
    if (hasDataSources && timeSeriesSources.length > 0) {
      return timeSeriesSources.map(ds => ds.column)
    }
    return Object.keys(chartData[0]).filter((k) => k !== 'time' && typeof (chartData[0] as Record<string, unknown>)[k] === 'number')
  }, [chartData, hasDataSources, timeSeriesSources])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
        Loading...
      </div>
    )
  }

  if (!sensorId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
        No sensor assigned
      </div>
    )
  }

  if (!chartData.length) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
        No data yet
      </div>
    )
  }

  const title = (panel.panel_config?.title as string) || ''

  return (
    <div className="flex h-full flex-col">
      {title && (
        <div className="px-2 pt-1 text-xs font-medium text-muted-foreground truncate">{title}</div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(panel.graph_type || 'line', chartData, dataKeys, style)}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function renderChart(type: string, data: Record<string, unknown>[], keys: string[], style: GraphStyleConfig) {
  const commonProps = { data, margin: { top: 5, right: 10, left: 0, bottom: 5 } }

  switch (type) {
    case 'bar':
      return (
        <BarChart {...commonProps}>
          {style.show_grid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
          <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          {style.show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      )

    case 'area':
      return (
        <AreaChart {...commonProps}>
          {style.show_grid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
          <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          {style.show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map((k, i) => (
            <Area key={k} type={style.curve_type as 'monotone'} dataKey={k} stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]} fillOpacity={style.fill_opacity} strokeWidth={style.stroke_width} />
          ))}
        </AreaChart>
      )

    case 'pie':
      return (
        <PieChart>
          <Pie data={data} dataKey={keys[0] || 'value'} nameKey="time" cx="50%" cy="50%"
            outerRadius="80%" label={{ fontSize: 10 }}>
            {data.map((_d, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12 }} />
        </PieChart>
      )

    case 'scatter':
      return (
        <ScatterChart {...commonProps}>
          {style.show_grid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
          <XAxis dataKey={keys[0]} name={keys[0]} tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <YAxis dataKey={keys[1] || keys[0]} name={keys[1] || keys[0]} tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Scatter data={data} fill={COLORS[0]} />
        </ScatterChart>
      )

    case 'radar':
      return (
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid className="stroke-border" />
          <PolarAngleAxis dataKey="time" tick={{ fontSize: 9 }} />
          <PolarRadiusAxis tick={{ fontSize: 9 }} />
          {keys.map((k, i) => (
            <Radar key={k} name={k} dataKey={k} stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]} fillOpacity={style.fill_opacity} />
          ))}
          {style.show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
        </RadarChart>
      )

    default: // line
      return (
        <LineChart {...commonProps}>
          {style.show_grid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
          <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          {style.show_legend && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map((k, i) => (
            <Line key={k} type={style.curve_type as 'monotone'} dataKey={k} stroke={COLORS[i % COLORS.length]}
              strokeWidth={style.stroke_width} dot={style.show_dots} />
          ))}
        </LineChart>
      )
  }
}
