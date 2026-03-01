import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import { IpcHelper } from '../helpers/ipc'

let app: Awaited<ReturnType<typeof electron.launch>>
let page: Awaited<ReturnType<typeof app.firstWindow>>
let ipc: IpcHelper
let dbPath: string
let dashboardId: string

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-dashboards-${Date.now()}.duckdb`)
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
  try { if (dashboardId) await ipc.deleteDashboard(dashboardId) } catch {}
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

async function goToDashboards() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: 'Dashboards' }).click()
  await page.waitForTimeout(500)
}

test.describe('Dashboards', () => {
  test('dashboard page shows empty state', async () => {
    // App starts on dashboard page
    await page.waitForTimeout(500)
    await expect(page.locator('text=No Dashboards')).toBeVisible()
  })

  test('create dashboard via UI dialog', async () => {
    await page.locator('button', { hasText: 'New Dashboard' }).click()
    await page.waitForTimeout(300)

    await expect(page.locator('h3', { hasText: 'New Dashboard' })).toBeVisible()
    await page.locator('input[placeholder="Dashboard name..."]').fill('E2E Dashboard')
    await page.locator('button', { hasText: 'Create' }).click()
    await page.waitForTimeout(1000)

    const dashboards = await ipc.listDashboards() as { id: string; name: string }[]
    const created = dashboards.find(d => d.name === 'E2E Dashboard')
    if (created) dashboardId = created.id
    expect(dashboardId).toBeTruthy()
  })

  test('dashboard tab appears after creation', async () => {
    await goToDashboards()
    await expect(page.locator('button', { hasText: 'E2E Dashboard' })).toBeVisible()
  })

  test('edit mode toggle works', async () => {
    const editButton = page.locator('button', { hasText: /^Edit$/ })
    await editButton.click()
    await page.waitForTimeout(300)
    await expect(page.locator('button', { hasText: 'Editing' })).toBeVisible()
  })

  test('add panel button is visible in edit mode', async () => {
    await expect(page.locator('button', { hasText: 'Add Panel' })).toBeVisible()
  })

  test('exit edit mode', async () => {
    await page.locator('button', { hasText: 'Editing' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('button', { hasText: /^Edit$/ })).toBeVisible()
  })

  test('create panel via IPC', async () => {
    if (!dashboardId) return

    const panel = await ipc.createPanel({
      dashboard_id: dashboardId,
      type: 'graph',
      graph_type: 'line',
      custom_component: null,
      gridstack_config: { x: 0, y: 0, w: 6, h: 3 },
      panel_config: {},
      sensor_ids: [],
      alert_ids: [],
    })
    expect(panel.id).toBeTruthy()
  })

  test('delete dashboard via UI', async () => {
    if (!dashboardId) return

    await goToDashboards()
    page.once('dialog', async (dialog) => {
      await dialog.accept()
    })
    await page.locator('button[title="Delete dashboard"]').click()
    await page.waitForTimeout(1000)

    const dashboards = await ipc.listDashboards()
    expect(dashboards.length).toBe(0)
    dashboardId = ''
  })
})
