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
