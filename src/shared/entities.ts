// Entity type definitions matching DuckDB schema

export type ExecutionType = 'typescript' | 'bash' | 'docker' | 'powershell' | 'file' | 'cfp_build' | 'cfp_func_metrics'
export type AlertState = 'ok' | 'notice' | 'warning' | 'error'
export type NotificationMethod = 'smtp' | 'webhook' | 'desktop'
export type PanelType = 'graph' | 'custom'
export type GraphType = 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'radar'
export type ThemeSetting = 'light' | 'dark' | 'system'
export type CronTaskType = 'sensor' | 'alert' | 'notification' | 'monitor'
export type AggregationFunction = 'avg' | 'min' | 'max' | 'sum' | 'count' | 'last'
export type ComparisonOperator = '>' | '>=' | '<' | '<=' | '==' | '!='
export type AlertSeverity = 'notice' | 'warning' | 'error'

export interface PanelDataSource {
  sensor_id: string
  column: string
  aggregation: AggregationFunction
  time_window_minutes: number
  label?: string
}

export interface GraphStyleConfig {
  show_grid: boolean
  show_legend: boolean
  show_dots: boolean
  stroke_width: number
  fill_opacity: number
  curve_type: 'monotone' | 'linear' | 'step'
}

export interface AlertRule {
  sensor_id?: string
  tag?: string
  column: string
  aggregation: AggregationFunction
  time_window_minutes: number
  operator: ComparisonOperator
  threshold: number | string | boolean
  severity: AlertSeverity
}

export interface Sensor {
  id: string
  name: string
  description: string
  execution_type: ExecutionType
  script_content: string
  script_file_path: string
  table_definition: ColumnDefinition[]
  retention_rules: RetentionRules
  cron_expression: string
  env_vars: Record<string, string>
  tags: string[]
  enabled: boolean
  monitor_id: string | null
  created_at: string
  updated_at: string
}

export interface ColumnDefinition {
  name: string
  type: string
  json_selector?: string
}

export interface RetentionRules {
  max_age_days?: number
  max_rows?: number
}

export interface SensorData {
  id: string
  sensor_id: string
  data: Record<string, unknown>
  collected_at: string
}

export interface Alert {
  id: string
  name: string
  description: string
  rules: AlertRule[]
  cron_expression: string
  state: AlertState
  priority: number
  acknowledged: boolean
  ack_message: string | null
  ack_at: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface AlertHistory {
  id: string
  alert_id: string
  previous_state: AlertState
  new_state: AlertState
  message: string | null
  evaluation_result: Record<string, unknown> | null
  created_at: string
}

export interface Notification {
  id: string
  name: string
  method: NotificationMethod
  config: SmtpConfig | WebhookConfig | DesktopConfig
  ejs_template: string
  cron_expression: string
  alert_state_filter: AlertState
  min_priority: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  auth: { user: string; pass: string }
  from: string
  to: string[]
  use_global?: boolean
}

export interface WebhookConfig {
  url: string
  method: 'POST' | 'PUT'
  headers: Record<string, string>
  bodyTemplate?: string
}

export interface DesktopConfig {}

export interface NotificationHistory {
  id: string
  notification_id: string
  alert_id: string
  status: 'sent' | 'failed'
  error_message: string | null
  sent_at: string
}

export interface Dashboard {
  id: string
  name: string
  is_primary: boolean
  sort_order: number
  created_at: string
  updated_at: string
  panels?: Panel[]
}

export interface Panel {
  id: string
  dashboard_id: string
  type: PanelType
  graph_type: GraphType | null
  custom_component: string | null
  gridstack_config: GridstackConfig
  panel_config: Record<string, unknown>
  created_at: string
  updated_at: string
  sensor_ids?: string[]
  alert_ids?: string[]
}

export interface GridstackConfig {
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export interface Settings {
  theme: ThemeSetting
  wsl_distro: string | null
  global_env_vars: Record<string, string>
  smtp_config: SmtpConfig | null
  webhook_endpoints: WebhookEndpoint[]
  desktop_notifications_enabled: boolean
  minimize_to_tray: boolean
  show_tray_icon: boolean
  close_to_tray: boolean
}

export interface WebhookEndpoint {
  name: string
  url: string
  method: 'POST' | 'PUT'
  headers: Record<string, string>
}

export interface CronTask {
  id: string
  name: string
  type: CronTaskType
  cron_expression: string
  running: boolean
  last_run: string | null
  enabled: boolean
  failure_count: number
  last_error: string | null
}

export interface CronExecutionLog {
  id: string
  task_id: string
  entity_type: CronTaskType
  status: 'success' | 'error'
  error_message: string | null
  duration_ms: number
  executed_at: string
}

// Credential types
export type CredentialType = 'cloudflare'

export interface CloudflareCredentialConfig {
  api_token: string
  account_id: string
}

export type CredentialConfig = CloudflareCredentialConfig

export interface Credential {
  id: string
  name: string
  credential_type: CredentialType
  config: CredentialConfig
  env_var_map: Record<string, string>
  created_at: string
  updated_at: string
}

export type CreateCredential = Omit<Credential, 'id' | 'created_at' | 'updated_at'>
export type UpdateCredential = Partial<CreateCredential> & { id: string }

// Monitor types
export type MonitorType = 'cloudflare_pages'

export interface CloudflarePagesProjectConfig {
  name: string
  branches: string[]        // empty = all branches
  collect_metrics: boolean  // create a separate metrics sensor
}

export interface CloudflarePagesConfig {
  api_token: string
  account_id: string
  excluded_projects: string[]  // kept for backward compat migration
  projects: CloudflarePagesProjectConfig[]  // explicit project list
}

export type MonitorConfig = CloudflarePagesConfig

export interface Monitor {
  id: string
  name: string
  description: string
  monitor_type: MonitorType
  config: MonitorConfig
  credential_id: string | null
  cron_expression: string
  enabled: boolean
  created_at: string
  updated_at: string
}

// Create/Update DTOs
export type CreateMonitor = Omit<Monitor, 'id' | 'created_at' | 'updated_at'>
export type UpdateMonitor = Partial<CreateMonitor> & { id: string }
export type CreateSensor = Omit<Sensor, 'id' | 'created_at' | 'updated_at'>
export type UpdateSensor = Partial<CreateSensor> & { id: string }
export type CreateAlert = Omit<Alert, 'id' | 'state' | 'acknowledged' | 'ack_message' | 'ack_at' | 'created_at' | 'updated_at'>
export type UpdateAlert = Partial<CreateAlert> & { id: string }
export type CreateNotification = Omit<Notification, 'id' | 'created_at' | 'updated_at'>
export type UpdateNotification = Partial<CreateNotification> & { id: string }
export type CreateDashboard = Omit<Dashboard, 'id' | 'sort_order' | 'created_at' | 'updated_at' | 'panels'>
export type UpdateDashboard = Partial<CreateDashboard> & { id: string }
export type CreatePanel = Omit<Panel, 'id' | 'created_at' | 'updated_at'>
export type UpdatePanel = Partial<CreatePanel> & { id: string }
