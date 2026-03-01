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
const createdSensorIds: string[] = []

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-sensors-${Date.now()}.duckdb`)
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
  for (const id of createdSensorIds) {
    try { await ipc.deleteSensor(id) } catch {}
  }
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

/** Navigate to sensors page with fresh data by reloading */
async function goToSensors() {
  await page.locator('aside button', { hasText: 'Sensors' }).click()
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: 'Sensors' }).click()
  await page.waitForTimeout(500)
}

test.describe('Sensors', () => {
  test('sensors page shows empty state', async () => {
    await page.locator('aside button', { hasText: 'Sensors' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Sensors' })).toBeVisible()
    await expect(page.locator('text=No sensors yet')).toBeVisible()
  })

  test('create sensor via IPC and verify in list', async () => {
    const data = makeSensor({ name: 'E2E Test Sensor' })
    const result = await ipc.createSensor(data)
    expect(result.id).toBeTruthy()
    createdSensorIds.push(result.id)

    // Reload to clear React Query cache and navigate to sensors
    await goToSensors()
    await expect(page.locator('td', { hasText: 'E2E Test Sensor' })).toBeVisible()
  })

  test('sensor shows correct type badge', async () => {
    await expect(page.locator('span', { hasText: 'Bash' })).toBeVisible()
  })

  test('sensor list shows status column with Active', async () => {
    await expect(page.locator('th', { hasText: 'Status' })).toBeVisible()
    await expect(page.locator('td span', { hasText: 'Active' })).toBeVisible()
  })

  test('edit sensor via UI', async () => {
    await page.locator('button[title="Edit"]').first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Edit Sensor' })).toBeVisible()

    // Update description
    const descInput = page.locator('input[placeholder="Collects CPU usage metrics"]')
    await descInput.fill('Updated description')
    await page.locator('button', { hasText: 'Save' }).click()
    await page.waitForTimeout(1000)

    // Verify back on list
    await expect(page.locator('h1', { hasText: 'Sensors' }).first()).toBeVisible()
  })

  test('run now triggers sensor execution', async () => {
    const runButton = page.locator('button[title="Run Now"]').first()
    await runButton.click()
    await page.waitForTimeout(3000)
    await expect(runButton).toBeEnabled()
  })

  test('delete sensor - dismiss keeps sensor', async () => {
    page.once('dialog', async (dialog) => {
      await dialog.dismiss()
    })
    await page.locator('button[title="Delete"]').first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('td', { hasText: 'E2E Test Sensor' })).toBeVisible()
  })

  test('delete sensor - accept removes sensor', async () => {
    page.once('dialog', async (dialog) => {
      await dialog.accept()
    })
    await page.locator('button[title="Delete"]').first().click()
    await page.waitForTimeout(1000)

    const sensors = await ipc.listSensors()
    expect(sensors.length).toBe(0)
    createdSensorIds.length = 0
  })

  test('create second sensor via IPC for further tests', async () => {
    const data = makeSensor({ name: 'IPC Created Sensor' })
    const result = await ipc.createSensor(data)
    expect(result.id).toBeTruthy()
    createdSensorIds.push(result.id)

    await goToSensors()
    await expect(page.locator('td', { hasText: 'IPC Created Sensor' })).toBeVisible()
  })
})
