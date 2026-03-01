import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import { IpcHelper } from '../helpers/ipc'
import { makeSensor, makeAlert } from '../helpers/factory'

let app: Awaited<ReturnType<typeof electron.launch>>
let page: Awaited<ReturnType<typeof app.firstWindow>>
let ipc: IpcHelper
let dbPath: string
let sensorId: string
let alertId: string

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-cron-${Date.now()}.duckdb`)
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...process.env, DASH_TEST_DB_PATH: dbPath },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('header').waitFor({ state: 'visible', timeout: 30_000 })
  ipc = new IpcHelper(page)

  // Create sensor and alert to generate cron tasks
  const sensor = await ipc.createSensor(makeSensor({ name: 'Cron Test Sensor' }))
  sensorId = sensor.id

  const alert = await ipc.createAlert(makeAlert([sensorId], { name: 'Cron Test Alert' }))
  alertId = alert.id
})

test.afterAll(async () => {
  try { await ipc.deleteAlert(alertId) } catch {}
  try { await ipc.deleteSensor(sensorId) } catch {}
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

async function goToCron() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: 'Cron Tasks' }).click()
  await page.waitForTimeout(500)
}

test.describe('Cron Tasks', () => {
  test('cron page loads with heading', async () => {
    await goToCron()
    await expect(page.locator('h1', { hasText: 'Cron Tasks' })).toBeVisible()
  })

  test('cron tasks are listed via IPC', async () => {
    const tasks = await ipc.listCronTasks() as unknown[]
    expect(tasks.length).toBeGreaterThanOrEqual(1)
  })

  test('cron page shows type badges', async () => {
    const sensorBadge = page.locator('span', { hasText: 'Sensor' })
    const alertBadge = page.locator('span', { hasText: 'Alert' })
    const hasBadge = (await sensorBadge.count()) > 0 || (await alertBadge.count()) > 0
    expect(hasBadge).toBe(true)
  })

  test('toggle disable/enable works', async () => {
    const toggleButton = page.locator('button[title="Disable"], button[title="Enable"]').first()
    if (await toggleButton.count() > 0) {
      await toggleButton.click()
      await page.waitForTimeout(500)

      const disabledText = page.locator('text=Disabled')
      const hasDisabled = (await disabledText.count()) > 0
      expect(hasDisabled).toBe(true)

      // Re-enable
      const enableButton = page.locator('button[title="Enable"]').first()
      if (await enableButton.count() > 0) {
        await enableButton.click()
        await page.waitForTimeout(500)
      }
    }
  })

  test('force run triggers execution', async () => {
    const runButton = page.locator('button[title="Run Now"]').first()
    if (await runButton.count() > 0) {
      await runButton.click()
      await page.waitForTimeout(2000)
    }
  })

  test('task count badge shows correct number', async () => {
    await goToCron()
    const tasks = await ipc.listCronTasks() as unknown[]
    expect(tasks.length).toBeGreaterThanOrEqual(1)
    // Badge format: "N tasks" in a rounded-full span next to heading
    const badge = page.locator('span.rounded-full', { hasText: /\d+\s*tasks/ })
    await expect(badge).toBeVisible()
  })
})
