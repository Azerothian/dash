import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import { IpcHelper } from '../helpers/ipc'
import { makeSensor, makeAlert, makeTagAlert } from '../helpers/factory'

let app: Awaited<ReturnType<typeof electron.launch>>
let page: Awaited<ReturnType<typeof app.firstWindow>>
let ipc: IpcHelper
let dbPath: string
let testSensorId: string
let testAlertId: string

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-alerts-${Date.now()}.duckdb`)
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...process.env, DASH_TEST_DB_PATH: dbPath },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('header').waitFor({ state: 'visible', timeout: 30_000 })
  ipc = new IpcHelper(page)

  // Create a test sensor via IPC
  const sensor = await ipc.createSensor(makeSensor({ name: 'Alert Test Sensor' }))
  testSensorId = sensor.id
})

test.afterAll(async () => {
  try { if (testAlertId) await ipc.deleteAlert(testAlertId) } catch {}
  try { await ipc.deleteSensor(testSensorId) } catch {}
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

async function goToAlerts() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: 'Alerts' }).click()
  await page.waitForTimeout(500)
}

test.describe('Alerts', () => {
  test('alerts page shows empty state', async () => {
    await page.locator('aside button', { hasText: 'Alerts' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Alerts' })).toBeVisible()
    await expect(page.locator('text=No alerts')).toBeVisible()
  })

  test('create alert via IPC', async () => {
    const data = makeAlert([testSensorId], { name: 'E2E Test Alert' })
    const result = await ipc.createAlert(data)
    testAlertId = result.id
    expect(result.id).toBeTruthy()

    await goToAlerts()
    await expect(page.locator('td', { hasText: 'E2E Test Alert' })).toBeVisible()
  })

  test('alert appears in list with state badge', async () => {
    await expect(page.locator('td', { hasText: 'E2E Test Alert' })).toBeVisible()
    await expect(page.locator('span', { hasText: 'OK' }).first()).toBeVisible()
  })

  test('state filter buttons are visible', async () => {
    const filterButtons = ['All', 'Error', 'Warning', 'Notice', 'OK']
    for (const label of filterButtons) {
      await expect(page.locator('button', { hasText: label }).first()).toBeVisible()
    }
  })

  test('state filter - OK shows alert', async () => {
    await page.locator('button:text-is("OK")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('td', { hasText: 'E2E Test Alert' })).toBeVisible()
  })

  test('state filter - Error hides OK alert', async () => {
    await page.locator('button:text-is("Error")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('td', { hasText: 'E2E Test Alert' })).not.toBeVisible()

    // Reset filter
    await page.locator('button:text-is("All")').click()
    await page.waitForTimeout(300)
  })

  test('run now evaluates alert', async () => {
    const runButton = page.locator('button[title="Run Now"]').first()
    await runButton.click()
    await page.waitForTimeout(2000)
    await expect(page.locator('td', { hasText: 'E2E Test Alert' })).toBeVisible()
  })

  test('history view shows entries', async () => {
    const historyButton = page.locator('button[title="History"]').first()
    await historyButton.click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Alert History' })).toBeVisible()

    // Go back
    await page.locator('button', { hasText: '←' }).click()
    await page.waitForTimeout(300)
  })

  test('delete alert - accept removes it', async () => {
    await page.locator('button[title="Delete"]').first().click()
    await page.waitForTimeout(300)
    await expect(page.locator('h3', { hasText: 'Delete Alert' })).toBeVisible()
    await page.locator('button', { hasText: 'Delete' }).last().click()
    await page.waitForTimeout(1000)

    const alerts = await ipc.listAlerts()
    expect(alerts.length).toBe(0)
    testAlertId = ''
  })

  test('filter persistence via IPC', async () => {
    const alertData = makeAlert([testSensorId], {
      name: 'Filter Test Alert',
      rules: [{
        sensor_id: testSensorId,
        column: 'value',
        aggregation: 'last',
        time_window_minutes: 60,
        operator: '>',
        threshold: 100,
        severity: 'warning',
        filters: [
          { column: 'value', operator: '>=', value: 10 },
        ],
      }],
    })
    const created = await ipc.createAlert(alertData)
    const fetched = await ipc.getAlert(created.id) as { rules: Array<{ filters?: Array<{ column: string; operator: string; value: number }> }> }
    expect(fetched.rules[0].filters).toBeDefined()
    expect(fetched.rules[0].filters!.length).toBe(1)
    expect(fetched.rules[0].filters![0].column).toBe('value')
    expect(fetched.rules[0].filters![0].operator).toBe('>=')
    expect(fetched.rules[0].filters![0].value).toBe(10)
    await ipc.deleteAlert(created.id)
  })

  test('mutation persistence via IPC', async () => {
    const alertData = {
      ...makeAlert([testSensorId], { name: 'Mutation Test Alert' }),
      mutations: [
        {
          type: 'aggregation',
          name: 'avg_value',
          sensor_id: testSensorId,
          column: 'value',
          aggregation: 'avg',
          time_window_minutes: 60,
        },
        {
          type: 'expression',
          name: 'doubled',
          left_operand: 'avg_value',
          operator: '*',
          right_operand: 2,
        },
      ],
      rules: [{
        mutation_ref: 'doubled',
        column: '',
        aggregation: 'last',
        time_window_minutes: 60,
        operator: '>',
        threshold: 50,
        severity: 'error',
      }],
    }
    const created = await ipc.createAlert(alertData)
    const fetched = await ipc.getAlert(created.id) as { mutations: Array<{ type: string; name: string }>; rules: Array<{ mutation_ref?: string }> }
    expect(fetched.mutations).toBeDefined()
    expect(fetched.mutations.length).toBe(2)
    expect(fetched.mutations[0].name).toBe('avg_value')
    expect(fetched.mutations[0].type).toBe('aggregation')
    expect(fetched.mutations[1].name).toBe('doubled')
    expect(fetched.mutations[1].type).toBe('expression')
    expect(fetched.rules[0].mutation_ref).toBe('doubled')
    await ipc.deleteAlert(created.id)
  })

  test('tag-based alert evaluates across multiple sensors', async () => {
    // Create 2 sensors with the same tag and same schema
    const tag = 'e2e-alert-tag'
    const sensor1 = await ipc.createSensor(makeSensor({
      name: 'Tag Sensor A',
      tags: [tag],
      script_content: 'echo \'{"value": 200}\'',
    }))
    const sensor2 = await ipc.createSensor(makeSensor({
      name: 'Tag Sensor B',
      tags: [tag],
      script_content: 'echo \'{"value": 50}\'',
    }))

    // Run both sensors to insert data
    await ipc.runSensor(sensor1.id)
    await ipc.runSensor(sensor2.id)

    // Create a tag-based alert: triggers when value > 100
    const alertData = makeTagAlert(tag, { name: 'E2E Tag Alert' })
    const alert = await ipc.createAlert(alertData)

    // Evaluate the alert — sensor A has value=200 (>100), should trigger
    const result = await ipc.runAlert(alert.id) as { state: string }
    expect(result.state).toBe('warning')

    // Cleanup
    await ipc.deleteAlert(alert.id)
    await ipc.deleteSensor(sensor1.id)
    await ipc.deleteSensor(sensor2.id)
  })
})
