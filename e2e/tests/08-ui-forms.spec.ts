import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import { IpcHelper } from '../helpers/ipc'
import { makeSensor } from '../helpers/factory'

let app: Awaited<ReturnType<typeof electron.launch>>
let page: Awaited<ReturnType<typeof app.firstWindow>>
let ipc: IpcHelper
let dbPath: string

// Track IDs for cleanup
const createdSensorIds: string[] = []
const createdAlertIds: string[] = []
const createdNotificationIds: string[] = []
const createdDashboardIds: string[] = []
const createdPanelIds: string[] = []

// Sensor created via IPC as prerequisite for alerts & dashboard panels
let prerequisiteSensorId: string
let prerequisiteSensorName: string

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-ui-forms-${Date.now()}.duckdb`)
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...process.env, DASH_TEST_DB_PATH: dbPath },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('header').waitFor({ state: 'visible', timeout: 30_000 })
  ipc = new IpcHelper(page)

  // Create a prerequisite sensor via IPC (needed for alert sensor picker & dashboard panel)
  const sensorData = makeSensor({ name: 'Prereq Sensor For Forms' })
  const result = await ipc.createSensor(sensorData)
  prerequisiteSensorId = result.id
  prerequisiteSensorName = 'Prereq Sensor For Forms'
})

test.afterAll(async () => {
  // Clean up in reverse dependency order
  for (const id of createdPanelIds) {
    try { await ipc.deletePanel(id) } catch {}
  }
  for (const id of createdDashboardIds) {
    try { await ipc.deleteDashboard(id) } catch {}
  }
  for (const id of createdNotificationIds) {
    try { await ipc.deleteNotification(id) } catch {}
  }
  for (const id of createdAlertIds) {
    try { await ipc.deleteAlert(id) } catch {}
  }
  for (const id of createdSensorIds) {
    try { await ipc.deleteSensor(id) } catch {}
  }
  // Also delete prerequisite sensor
  try { await ipc.deleteSensor(prerequisiteSensorId) } catch {}

  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

// --- Navigation helpers ---

async function goTo(section: string) {
  await page.locator('aside button', { hasText: section }).click()
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: section }).click()
  await page.waitForTimeout(500)
}

// --- Sensor Form Tests ---

test.describe('Sensor Form', () => {
  test('navigate to new sensor form', async () => {
    await goTo('Sensors')
    await page.locator('button', { hasText: 'New Sensor' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'New Sensor' })).toBeVisible()
  })

  test('fill and submit sensor form', async () => {
    // Fill name
    await page.locator('input[placeholder="CPU Monitor"]').fill('UI Form Test Sensor')

    // Fill description
    await page.locator('input[placeholder="Collects CPU usage metrics"]').fill('Created via UI form test')

    // Select Bash execution type
    const execSelect = page.locator('select').first()
    await execSelect.selectOption('bash')
    await page.waitForTimeout(300)

    // Click cron preset "Every 5 minutes"
    await page.locator('button', { hasText: 'Every 5 minutes' }).click()

    // Fill script textarea
    const scriptTextarea = page.locator('textarea').first()
    await scriptTextarea.fill("echo '{\"value\": 42}'")

    // Add a table column: name="value", type="DOUBLE", json_selector="$.value"
    await page.locator('button', { hasText: '+ Add Column' }).click()
    await page.waitForTimeout(300)
    const columnNameInput = page.locator('input[placeholder="Column name"]').first()
    await columnNameInput.fill('value')
    // Select DOUBLE type for the column
    const columnTypeSelect = page.locator('select').last()
    await columnTypeSelect.selectOption('DOUBLE')

    // Fill per-column JSON selector
    const jsonSelectorInput = page.locator('input[placeholder="JSON selector"]').first()
    await jsonSelectorInput.fill('$.value')

    // Click Save
    await page.locator('button', { hasText: 'Save' }).click()
    await page.waitForTimeout(1000)

    // Should redirect back to sensor list
    await expect(page.locator('h1', { hasText: 'Sensors' }).first()).toBeVisible()
  })

  test('verify sensor appears in list', async () => {
    await goTo('Sensors')
    await expect(page.locator('td', { hasText: 'UI Form Test Sensor' })).toBeVisible()

    // Track for cleanup - get ID from IPC
    const sensors = await ipc.listSensors()
    const created = sensors.find((s: { name: string }) => s.name === 'UI Form Test Sensor')
    if (created) createdSensorIds.push(created.id)
  })

  test('verify sensor has correct type badge', async () => {
    // The Bash badge should be visible in the sensor row
    const row = page.locator('tr', { hasText: 'UI Form Test Sensor' })
    await expect(row.locator('span', { hasText: 'Bash' })).toBeVisible()
  })

  test('verify cron task created for sensor', async () => {
    const tasks = await ipc.listCronTasks() as { name: string; type: string; enabled: boolean }[]
    const sensorTask = tasks.find(t => t.type === 'sensor' && t.name.includes('UI Form Test Sensor'))
    expect(sensorTask).toBeDefined()
    expect(sensorTask!.enabled).toBe(true)
  })
})

// --- Alert Form Tests ---

test.describe('Alert Form', () => {
  test('navigate to new alert form', async () => {
    await goTo('Alerts')
    await page.locator('button', { hasText: 'New Alert' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'New Alert' })).toBeVisible()
  })

  test('fill and submit alert form', async () => {
    // Fill name
    await page.locator('input[placeholder="High CPU Alert"]').fill('UI Form Test Alert')

    // Fill description
    await page.locator('input[placeholder="Fires when CPU usage exceeds 90%"]').fill('Created via UI form test')

    // Set priority to 1
    const priorityInput = page.locator('input[type="number"]').first()
    await priorityInput.fill('1')

    // Click cron preset "Every minute"
    await page.locator('button', { hasText: 'Every minute' }).click()

    // Add a rule
    await page.locator('button', { hasText: 'Add Rule' }).click()
    await page.waitForTimeout(300)

    // Select the prerequisite sensor in the rule's sensor dropdown
    const sensorSelect = page.locator('select').filter({ hasText: 'Select sensor...' })
    await sensorSelect.selectOption({ label: prerequisiteSensorName })
    await page.waitForTimeout(300)

    // Select the 'value' column in the rule's column dropdown
    const columnSelect = page.locator('select').filter({ hasText: 'Select column...' })
    await columnSelect.selectOption('value')
    await page.waitForTimeout(300)

    // Set threshold
    const thresholdInput = page.locator('input[type="number"][step="any"]')
    await thresholdInput.fill('90')

    // Click Save
    await page.locator('button', { hasText: 'Save' }).click()
    await page.waitForTimeout(1000)

    // Should redirect back to alert list
    await expect(page.locator('h1', { hasText: 'Alerts' }).first()).toBeVisible()
  })

  test('verify alert appears in list', async () => {
    await goTo('Alerts')
    await expect(page.locator('td', { hasText: 'UI Form Test Alert' })).toBeVisible()

    // Track for cleanup
    const alerts = await ipc.listAlerts()
    const created = alerts.find((a: { name: string }) => a.name === 'UI Form Test Alert')
    if (created) createdAlertIds.push(created.id)
  })

  test('verify alert has OK state badge', async () => {
    const row = page.locator('tr', { hasText: 'UI Form Test Alert' })
    await expect(row.locator('span', { hasText: 'OK' })).toBeVisible()
  })

  test('verify cron task created for alert', async () => {
    const tasks = await ipc.listCronTasks() as { name: string; type: string; enabled: boolean }[]
    const alertTask = tasks.find(t => t.type === 'alert' && t.name.includes('UI Form Test Alert'))
    expect(alertTask).toBeDefined()
    expect(alertTask!.enabled).toBe(true)
  })
})

// --- Alert Rule UI Behavior Tests ---

test.describe('Alert Rule UI Behaviors', () => {
  test('window input hidden when last aggregation selected', async () => {
    await goTo('Alerts')
    await page.locator('button', { hasText: 'New Alert' }).click()
    await page.waitForTimeout(500)

    // Add a rule
    await page.locator('button', { hasText: 'Add Rule' }).click()
    await page.waitForTimeout(300)

    // Select sensor
    const sensorSelect = page.locator('select').filter({ hasText: 'Select sensor...' })
    await sensorSelect.selectOption({ label: prerequisiteSensorName })
    await page.waitForTimeout(300)

    // Default aggregation is 'last' — window should be hidden
    await expect(page.locator('label', { hasText: 'Window (min)' })).not.toBeVisible()

    // Switch to 'avg' — window should appear
    const aggSelect = page.locator('select').nth(2)
    await aggSelect.selectOption('avg')
    await page.waitForTimeout(300)
    await expect(page.locator('label', { hasText: 'Window (min)' })).toBeVisible()

    // Switch back to 'last' — window should hide again
    await aggSelect.selectOption('last')
    await page.waitForTimeout(300)
    await expect(page.locator('label', { hasText: 'Window (min)' })).not.toBeVisible()

    // Go back without saving
    await page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).click()
    await page.waitForTimeout(300)
  })

  test('threshold input adapts to VARCHAR column type', async () => {
    // Create a sensor with a VARCHAR column via IPC
    const varcharSensor = await ipc.createSensor({
      name: 'VARCHAR Test Sensor',
      description: 'Sensor with text column',
      execution_type: 'bash',
      script_content: 'echo \'{"status": "ok"}\'',
      table_definition: [{ name: 'status', type: 'VARCHAR', json_selector: '$.status' }],
      retention_rules: {},
      cron_expression: '*/5 * * * *',
      env_vars: {},
      tags: [],
      enabled: true,
    })
    createdSensorIds.push(varcharSensor.id)

    await goTo('Alerts')
    await page.locator('button', { hasText: 'New Alert' }).click()
    await page.waitForTimeout(500)

    // Add a rule
    await page.locator('button', { hasText: 'Add Rule' }).click()
    await page.waitForTimeout(300)

    // Select VARCHAR sensor
    const sensorSelect = page.locator('select').filter({ hasText: 'Select sensor...' })
    await sensorSelect.selectOption({ label: 'VARCHAR Test Sensor' })
    await page.waitForTimeout(300)

    // Select 'status' column
    const columnSelect = page.locator('select').filter({ hasText: 'Select column...' })
    await columnSelect.selectOption('status')
    await page.waitForTimeout(300)

    // Threshold should be a text input (not number)
    const thresholdInput = page.locator('input[type="text"][placeholder="Value to compare..."]')
    await expect(thresholdInput).toBeVisible()

    // Only == and != operators should be available
    const operatorSelect = page.locator('select').filter({ has: page.locator('option[value="=="]') }).first()
    const options = await operatorSelect.locator('option').allTextContents()
    expect(options).toEqual(['==', '!='])

    // Go back without saving
    await page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).click()
    await page.waitForTimeout(300)
  })

  test('alert rule can target a tag', async () => {
    // Create sensors with a shared tag
    const taggedSensor1 = await ipc.createSensor({
      name: 'Tagged Sensor A',
      description: 'First tagged sensor',
      execution_type: 'bash',
      script_content: 'echo \'{"value": 42}\'',
      table_definition: [{ name: 'value', type: 'DOUBLE', json_selector: '$.value' }],
      retention_rules: {},
      cron_expression: '*/5 * * * *',
      env_vars: {},
      tags: ['ui-test-tag'],
      enabled: true,
    })
    const taggedSensor2 = await ipc.createSensor({
      name: 'Tagged Sensor B',
      description: 'Second tagged sensor',
      execution_type: 'bash',
      script_content: 'echo \'{"value": 99}\'',
      table_definition: [{ name: 'value', type: 'DOUBLE', json_selector: '$.value' }],
      retention_rules: {},
      cron_expression: '*/5 * * * *',
      env_vars: {},
      tags: ['ui-test-tag'],
      enabled: true,
    })
    createdSensorIds.push(taggedSensor1.id, taggedSensor2.id)

    await goTo('Alerts')
    await page.locator('button', { hasText: 'New Alert' }).click()
    await page.waitForTimeout(500)

    // Add a rule
    await page.locator('button', { hasText: 'Add Rule' }).click()
    await page.waitForTimeout(300)

    // Click "Tag" toggle button inside the rule row — it's the second button in the toggle group
    const ruleRow = page.locator('.space-y-2.rounded-md.border').first()
    const tagButton = ruleRow.locator('.flex.rounded-md.border.overflow-hidden button').nth(1)
    await expect(tagButton).toHaveText('Tag')
    await tagButton.click()
    await page.waitForTimeout(500)

    // Verify tag mode is active — label should say "Tag"
    await expect(ruleRow.locator('label', { hasText: 'Tag' })).toBeVisible()

    // Select tag from dropdown
    const tagSelect = ruleRow.locator('label', { hasText: 'Tag' }).locator('..').locator('select')
    await tagSelect.selectOption('ui-test-tag')
    await page.waitForTimeout(300)

    // Column dropdown should show 'value' (common column)
    const columnLabel = ruleRow.locator('label', { hasText: 'Column' })
    const columnSelect = columnLabel.locator('..').locator('select')
    const columnOptions = await columnSelect.locator('option').allTextContents()
    expect(columnOptions).toContain('value')

    // Go back without saving
    await page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }).click()
    await page.waitForTimeout(300)
  })
})

// --- Notification Form Tests ---

test.describe('Notification Form', () => {
  test('navigate to new notification form', async () => {
    await goTo('Notifications')
    await page.locator('button', { hasText: 'New Notification' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'New Notification' })).toBeVisible()
  })

  test('fill and submit desktop notification', async () => {
    // Fill name
    await page.locator('input[placeholder="Critical Alert Email"]').fill('UI Form Test Notification')

    // Click "Desktop" method button
    await page.locator('button', { hasText: 'Desktop' }).click()
    await page.waitForTimeout(300)

    // Fill template textarea
    const templateTextarea = page.locator('textarea').first()
    await templateTextarea.fill('Alert: <%= alert.name %> is <%= alert.state %>')

    // Click Save
    await page.locator('button', { hasText: 'Save' }).click()
    await page.waitForTimeout(1000)

    // Should redirect back to notification list
    await expect(page.locator('h1', { hasText: 'Notifications' }).first()).toBeVisible()
  })

  test('verify notification appears in list', async () => {
    await goTo('Notifications')
    await expect(page.locator('td', { hasText: 'UI Form Test Notification' })).toBeVisible()

    // Track for cleanup
    const notifications = await ipc.listNotifications()
    const created = notifications.find((n: { name: string }) => n.name === 'UI Form Test Notification')
    if (created) createdNotificationIds.push(created.id)
  })

  test('verify notification shows Desktop method', async () => {
    const row = page.locator('tr', { hasText: 'UI Form Test Notification' })
    await expect(row.locator('text=Desktop')).toBeVisible()
  })

  test('verify cron task created for notification', async () => {
    const tasks = await ipc.listCronTasks() as { name: string; type: string; enabled: boolean }[]
    const notifTask = tasks.find(t => t.type === 'notification' && t.name.includes('UI Form Test Notification'))
    expect(notifTask).toBeDefined()
    expect(notifTask!.enabled).toBe(true)
  })
})

// --- Dashboard Graph Panel Tests ---

test.describe('Dashboard Graph Panels', () => {
  test('create dashboard and enter edit mode', async () => {
    await goTo('Dashboards')
    await page.waitForTimeout(500)

    // Click "New Dashboard" button - could be in empty state or tab bar
    const newDashBtn = page.locator('button', { hasText: 'New Dashboard' })
    if (await newDashBtn.isVisible()) {
      await newDashBtn.click()
    } else {
      // Use the "+" button in tab bar
      await page.locator('button[title="New Dashboard"]').click()
    }
    await page.waitForTimeout(500)

    // Fill dashboard name in the dialog
    await expect(page.locator('h3', { hasText: 'New Dashboard' })).toBeVisible()
    await page.locator('input[placeholder="Dashboard name..."]').fill('UI Form Test Dashboard')
    await page.locator('button', { hasText: 'Create' }).click()
    await page.waitForTimeout(1000)

    // Track for cleanup
    const dashboards = await ipc.listDashboards()
    const created = dashboards.find((d: { name: string }) => d.name === 'UI Form Test Dashboard')
    if (created) createdDashboardIds.push(created.id)

    // Click "Edit" to enter edit mode
    await page.locator('button', { hasText: /^Edit$/ }).click()
    await page.waitForTimeout(500)

    // Verify we're in edit mode
    await expect(page.locator('button', { hasText: 'Editing' })).toBeVisible()
  })

  test('open Add Panel sheet and configure graph', async () => {
    // Click "Add Panel" button
    await page.locator('button', { hasText: 'Add Panel' }).first().click()
    await page.waitForTimeout(500)

    // Verify panel options sheet appears
    await expect(page.locator('h3', { hasText: 'Add Panel' })).toBeVisible()

    // Select "Line" graph type
    await page.locator('button', { hasText: 'Line' }).click()
    await page.waitForTimeout(300)

    // Click "Add Data Source" button
    await page.locator('button', { hasText: 'Add Data Source' }).click()
    await page.waitForTimeout(300)

    // Select sensor from data source dropdown
    const sensorSelect = page.locator('select').filter({ hasText: 'Select sensor...' })
    await sensorSelect.selectOption({ label: prerequisiteSensorName })
    await page.waitForTimeout(300)

    // Select column from dropdown
    const columnSelect = page.locator('select').filter({ hasText: 'Select column...' })
    await columnSelect.selectOption('value')
    await page.waitForTimeout(300)

    // Aggregation defaults to 'Last (raw)', time window to '15 min' - leave defaults

    // Fill panel title
    await page.locator('input[placeholder="Panel title"]').fill('Test Graph Panel')
  })

  test('submit panel and verify it appears', async () => {
    // Click the "Add Panel" submit button in the sheet
    // There may be two "Add Panel" elements - the sheet submit button is the one inside the sheet
    const submitBtn = page.locator('button', { hasText: 'Add Panel' }).last()
    await submitBtn.click()
    await page.waitForTimeout(1000)

    // The panel renders but shows "No data yet" since the sensor has no collected data.
    // The title is only rendered when chart data exists, so verify the panel via its content.
    await expect(page.locator('text=No data yet')).toBeVisible()
  })

  test('exit edit mode and verify panel persists', async () => {
    // Click "Editing" button to exit edit mode
    await page.locator('button', { hasText: 'Editing' }).click()
    await page.waitForTimeout(500)

    // Verify back to view mode
    await expect(page.locator('button', { hasText: /^Edit$/ })).toBeVisible()

    // Reload and verify panel persists
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Navigate back to dashboards
    await page.locator('aside button', { hasText: 'Dashboards' }).click()
    await page.waitForTimeout(500)

    // Click the dashboard tab if needed
    const dashTab = page.locator('button', { hasText: 'UI Form Test Dashboard' })
    if (await dashTab.isVisible()) {
      await dashTab.click()
      await page.waitForTimeout(500)
    }

    // Verify panel still exists (shows "No data yet" since sensor has no data)
    await expect(page.locator('text=No data yet')).toBeVisible()
  })

  test('panel shows graph after sensor has data', async () => {
    // Run the prerequisite sensor to generate data
    await ipc.runSensor(prerequisiteSensorId)
    await page.waitForTimeout(2000)

    // Verify data was actually collected via IPC
    const sensorData = await ipc.listSensorData(prerequisiteSensorId)
    expect((sensorData as unknown[]).length).toBeGreaterThan(0)

    // Reload and navigate back to the dashboard
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1000)

    await page.locator('aside button', { hasText: 'Dashboards' }).click()
    await page.waitForTimeout(500)

    // Click the dashboard tab (wait for it to appear)
    const dashTab = page.locator('button', { hasText: 'UI Form Test Dashboard' })
    await dashTab.waitFor({ state: 'visible', timeout: 10_000 })
    await dashTab.click()
    await page.waitForTimeout(1000)

    // Panel should now show chart data — verify it no longer says "No data yet"
    await expect(page.locator('text=No data yet')).not.toBeVisible({ timeout: 10_000 })
  })

  test('style options are configurable', async () => {
    // Navigate to the test dashboard explicitly
    await page.locator('aside button', { hasText: 'Dashboards' }).click()
    await page.waitForTimeout(500)
    const dashTab = page.locator('button', { hasText: 'UI Form Test Dashboard' })
    if (await dashTab.isVisible()) {
      await dashTab.click()
      await page.waitForTimeout(500)
    }

    // Enter edit mode
    await page.locator('button', { hasText: /^Edit$/ }).click()
    await page.waitForTimeout(500)

    // Open Add Panel sheet
    await page.locator('button', { hasText: 'Add Panel' }).first().click()
    await page.waitForTimeout(500)

    // Verify panel options sheet opens
    await expect(page.locator('h3', { hasText: 'Add Panel' })).toBeVisible()

    // Click "Style Options" to expand
    await page.locator('button', { hasText: 'Style Options' }).click()
    await page.waitForTimeout(300)

    // Verify style controls are visible
    await expect(page.locator('label', { hasText: 'Show Grid' })).toBeVisible()
    await expect(page.locator('label', { hasText: 'Show Legend' })).toBeVisible()
    await expect(page.locator('label', { hasText: 'Show Dots' })).toBeVisible()

    // Toggle Show Dots on
    const showDotsCheckbox = page.locator('label', { hasText: 'Show Dots' }).locator('input[type="checkbox"]')
    await showDotsCheckbox.check()

    // Change Curve Type to step
    const curveSelect = page.locator('select').filter({ has: page.locator('option[value="step"]') })
    await curveSelect.selectOption('step')

    // Close the sheet by clicking the backdrop overlay
    await page.locator('.fixed.inset-0.bg-black\\/30').click({ force: true })
    await page.waitForTimeout(500)

    // Verify sheet is closed
    await expect(page.locator('h3', { hasText: 'Add Panel' })).not.toBeVisible()

    // Exit edit mode
    await page.locator('button', { hasText: 'Editing' }).click()
    await page.waitForTimeout(500)
  })

  test('panel persists data source config after reload', async () => {
    // Verify panel data_sources config persisted via IPC
    const dashboards = await ipc.listDashboards() as { name: string; id: string }[]
    const dash = dashboards.find((d) => d.name === 'UI Form Test Dashboard')
    if (!dash) {
      // Dashboard not created in this test run (e.g. running tests in isolation) — skip
      return
    }

    const dashDetail = await ipc.getDashboard(dash.id) as { panels?: { id: string; panel_config: { data_sources?: unknown[] } }[] }
    const panels = dashDetail?.panels ?? []
    expect(panels.length).toBeGreaterThan(0)

    const panel = panels[0]
    createdPanelIds.push(panel.id)
    const ds = panel.panel_config?.data_sources
    expect(Array.isArray(ds)).toBe(true)
    expect((ds as unknown[]).length).toBeGreaterThan(0)
  })
})
