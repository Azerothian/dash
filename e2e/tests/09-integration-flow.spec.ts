import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import { IpcHelper } from '../helpers/ipc'
import { makeSensor, makeAlert, makeNotification } from '../helpers/factory'

/**
 * Integration test: Sensor → Alert → Notification pipeline
 *
 * 1. Create a sensor that outputs { value: 200 }
 * 2. Run the sensor to collect data
 * 3. Create an alert with a rule: last(value) > 100 → warning
 * 4. Evaluate the alert — state should change from ok → warning
 * 5. Create a desktop notification filtering on 'warning' state
 * 6. Verify alert history recorded the state transition
 * 7. Verify the full pipeline is visible in the UI
 */

let app: Awaited<ReturnType<typeof electron.launch>>
let page: Awaited<ReturnType<typeof app.firstWindow>>
let ipc: IpcHelper
let dbPath: string

let sensorId: string
let alertId: string
let notificationId: string

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-integration-${Date.now()}.duckdb`)
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...process.env, DASH_TEST_DB_PATH: dbPath },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('header').waitFor({ state: 'visible', timeout: 30_000 })
  ipc = new IpcHelper(page)
})

test.afterAll(async () => {
  try { if (notificationId) await ipc.deleteNotification(notificationId) } catch {}
  try { if (alertId) await ipc.deleteAlert(alertId) } catch {}
  try { if (sensorId) await ipc.deleteSensor(sensorId) } catch {}
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

async function goTo(section: string) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: section }).click()
  await page.waitForTimeout(500)
}

test.describe('Sensor → Alert → Notification Integration', () => {
  test('step 1: create sensor that outputs value=200', async () => {
    const sensor = await ipc.createSensor(makeSensor({
      name: 'Integration Sensor',
      script_content: "echo '{\"value\": 200}'",
      table_definition: [{ name: 'value', type: 'DOUBLE', json_selector: '$.value' }],
    }))
    sensorId = sensor.id
    expect(sensorId).toBeTruthy()
  })

  test('step 2: run sensor to collect data', async () => {
    await ipc.runSensor(sensorId)
    await page.waitForTimeout(1000)

    // Run again for multiple data points
    await ipc.runSensor(sensorId)
    await page.waitForTimeout(500)
  })

  test('step 3: create alert with rule last(value) > 100 → warning', async () => {
    const alert = await ipc.createAlert(makeAlert([sensorId], {
      name: 'Integration Alert',
      rules: [{
        sensor_id: sensorId,
        column: 'value',
        aggregation: 'last',
        time_window_minutes: 60,
        operator: '>',
        threshold: 100,
        severity: 'warning',
      }],
    }))
    alertId = alert.id
    expect(alertId).toBeTruthy()

    // Verify initial state is ok
    const fetched = await ipc.getAlert(alertId) as { state: string }
    expect(fetched.state).toBe('ok')
  })

  test('step 4: evaluate alert — state transitions to warning', async () => {
    await ipc.runAlert(alertId)
    await page.waitForTimeout(1000)

    const alert = await ipc.getAlert(alertId) as { state: string }
    expect(alert.state).toBe('warning')
  })

  test('step 5: alert history records the state transition', async () => {
    const history = await ipc.listAlertHistory(alertId) as Array<{
      previous_state: string
      new_state: string
    }>
    expect(history.length).toBeGreaterThanOrEqual(1)

    const transition = history[0]
    expect(transition.previous_state).toBe('ok')
    expect(transition.new_state).toBe('warning')
  })

  test('step 6: create notification for warning state', async () => {
    const notif = await ipc.createNotification(makeNotification({
      name: 'Integration Notification',
      method: 'desktop',
      config: {},
      alert_state_filter: 'warning',
      min_priority: 1,
    }))
    notificationId = notif.id
    expect(notificationId).toBeTruthy()
  })

  test('step 7: UI shows alert in warning state', async () => {
    await goTo('Alerts')
    const row = page.locator('tr', { hasText: 'Integration Alert' })
    await expect(row).toBeVisible()
    await expect(row.locator('span', { hasText: 'Warning' })).toBeVisible()
  })

  test('step 8: re-evaluate — state stays warning, no duplicate history', async () => {
    await ipc.runAlert(alertId)
    await page.waitForTimeout(500)

    const alert = await ipc.getAlert(alertId) as { state: string }
    expect(alert.state).toBe('warning')

    // History should still have exactly 1 transition (no duplicate)
    const history = await ipc.listAlertHistory(alertId) as unknown[]
    expect(history.length).toBe(1)
  })

  test('step 9: update rule threshold above sensor value — alert returns to ok', async () => {
    await ipc.updateAlert({
      id: alertId,
      rules: [{
        sensor_id: sensorId,
        column: 'value',
        aggregation: 'last',
        time_window_minutes: 60,
        operator: '>',
        threshold: 999,
        severity: 'warning',
      }],
    })

    await ipc.runAlert(alertId)
    await page.waitForTimeout(500)

    const alert = await ipc.getAlert(alertId) as { state: string }
    expect(alert.state).toBe('ok')

    // Should now have 2 history entries: ok→warning and warning→ok
    const history = await ipc.listAlertHistory(alertId) as unknown[]
    expect(history.length).toBe(2)
  })

  test('step 10: UI reflects ok state after threshold change', async () => {
    await goTo('Alerts')
    const row = page.locator('tr', { hasText: 'Integration Alert' })
    await expect(row).toBeVisible()
    await expect(row.locator('span', { hasText: 'OK' })).toBeVisible()
  })

  test('step 11: multiple rules — highest severity wins', async () => {
    await ipc.updateAlert({
      id: alertId,
      rules: [
        {
          sensor_id: sensorId,
          column: 'value',
          aggregation: 'last',
          time_window_minutes: 60,
          operator: '>',
          threshold: 100,
          severity: 'warning',
        },
        {
          sensor_id: sensorId,
          column: 'value',
          aggregation: 'last',
          time_window_minutes: 60,
          operator: '>',
          threshold: 150,
          severity: 'error',
        },
      ],
    })

    await ipc.runAlert(alertId)
    await page.waitForTimeout(500)

    // Error is higher severity than warning, so error should win
    const alert = await ipc.getAlert(alertId) as { state: string }
    expect(alert.state).toBe('error')
  })

  test('step 12: sensor visible in Sensors list', async () => {
    await goTo('Sensors')
    await expect(page.locator('td', { hasText: 'Integration Sensor' })).toBeVisible()
  })

  test('step 13: notification visible in Notifications list', async () => {
    await goTo('Notifications')
    await expect(page.locator('td', { hasText: 'Integration Notification' })).toBeVisible()
  })
})
