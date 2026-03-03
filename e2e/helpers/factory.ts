let counter = 0

function uid() {
  return `${Date.now()}-${++counter}`
}

export function makeSensor(overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Sensor ${uid()}`,
    description: 'E2E test sensor',
    execution_type: 'bash',
    script_content: 'echo \'{"value": 42}\'',
    table_definition: [{ name: 'value', type: 'DOUBLE', json_selector: '$.value' }],
    retention_rules: {},
    cron_expression: '*/5 * * * *',
    env_vars: {},
    tags: [],
    enabled: true,
    ...overrides,
  }
}

export function makeAlert(sensorIds: string[] = [], overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Alert ${uid()}`,
    description: 'E2E test alert',
    rules: sensorIds.map((id) => ({
      sensor_id: id,
      column: 'value',
      aggregation: 'last',
      time_window_minutes: 60,
      operator: '>',
      threshold: 100,
      severity: 'warning',
    })),
    cron_expression: '*/5 * * * *',
    priority: 3,
    enabled: true,
    ...overrides,
  }
}

export function makeTagAlert(tag: string, overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Tag Alert ${uid()}`,
    description: 'E2E tag-based alert',
    rules: [{
      tag,
      column: 'value',
      aggregation: 'last',
      time_window_minutes: 60,
      operator: '>',
      threshold: 100,
      severity: 'warning',
    }],
    cron_expression: '*/5 * * * *',
    priority: 3,
    enabled: true,
    ...overrides,
  }
}

export function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Notification ${uid()}`,
    method: 'desktop',
    config: {},
    ejs_template: 'Alert: <%= alert.name %> is <%= alert.state %>',
    cron_expression: '*/5 * * * *',
    alert_state_filter: 'error',
    min_priority: 1,
    enabled: true,
    ...overrides,
  }
}

export function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Monitor ${uid()}`,
    description: 'E2E test monitor',
    monitor_type: 'cloudflare_pages',
    config: {
      api_token: 'test-token-encrypted',
      account_id: 'test-account-id',
      excluded_projects: [],
    },
    cron_expression: '*/5 * * * *',
    enabled: true,
    ...overrides,
  }
}

export function makeDashboard(overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Dashboard ${uid()}`,
    is_primary: false,
    ...overrides,
  }
}
