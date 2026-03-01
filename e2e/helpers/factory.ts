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
    json_selector: '$',
    table_definition: [{ name: 'value', type: 'DOUBLE' }],
    retention_rules: {},
    cron_expression: '*/5 * * * *',
    env_vars: {},
    enabled: true,
    ...overrides,
  }
}

export function makeAlert(sensorIds: string[] = [], overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Alert ${uid()}`,
    description: 'E2E test alert',
    queries: ['SELECT * FROM sensor_data ORDER BY collected_at DESC LIMIT 1'],
    evaluation_script: 'return "ok"',
    cron_expression: '*/5 * * * *',
    priority: 3,
    sensor_ids: sensorIds,
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

export function makeDashboard(overrides: Record<string, unknown> = {}) {
  return {
    name: `Test Dashboard ${uid()}`,
    is_primary: false,
    ...overrides,
  }
}
