import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import { IpcHelper } from '../helpers/ipc'
import { makeMonitor, makeSensor } from '../helpers/factory'

let app: Awaited<ReturnType<typeof electron.launch>>
let page: Awaited<ReturnType<typeof app.firstWindow>>
let dbPath: string
let ipc: IpcHelper

/** Navigate to monitors page with fresh data by reloading */
async function goToMonitors() {
  await page.locator('aside button', { hasText: 'Monitors' }).click()
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: 'Monitors' }).click()
  await page.waitForTimeout(500)
}

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-monitors-${Date.now()}.duckdb`)
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
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

test.describe('Monitors', () => {
  test('monitors page shows empty state', async () => {
    await goToMonitors()
    await expect(page.locator('h1', { hasText: 'Monitors' })).toBeVisible()
    await expect(page.locator('text=No monitors yet')).toBeVisible()
  })

  test('create monitor via IPC and verify in list', async () => {
    const monitor = makeMonitor()
    const result = await ipc.createMonitor(monitor)
    expect(result.id).toBeTruthy()

    // Navigate to monitors page with reload to clear React Query cache
    await goToMonitors()
    await expect(page.locator(`text=${monitor.name}`)).toBeVisible()
  })

  test('monitor shows correct type badge', async () => {
    await goToMonitors()
    await expect(page.locator('text=Cloudflare Pages')).toBeVisible()
  })

  test('edit monitor via UI', async () => {
    await goToMonitors()

    // Click edit on the first monitor
    await page.locator('button[title="Edit"]').first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Edit Monitor' })).toBeVisible()
  })

  test('delete monitor - dismiss keeps monitor', async () => {
    await goToMonitors()

    // Count monitors before
    const monitors = await ipc.listMonitors()
    const countBefore = monitors.length

    // Click delete
    await page.locator('button[title="Delete"]').first().click()
    await page.waitForTimeout(300)

    // Cancel
    await page.locator('button', { hasText: 'Cancel' }).click()
    await page.waitForTimeout(300)

    // Verify still there
    const monitorsAfter = await ipc.listMonitors()
    expect(monitorsAfter.length).toBe(countBefore)
  })

  test('delete monitor - accept removes monitor and managed sensors', async () => {
    await goToMonitors()

    // Click delete
    await page.locator('button[title="Delete"]').first().click()
    await page.waitForTimeout(300)

    // Confirm delete
    await page.locator('button', { hasText: 'Delete' }).click()
    await page.waitForTimeout(500)

    // Verify monitors list is empty again
    const monitors = await ipc.listMonitors()
    expect(monitors.length).toBe(0)
  })

  test('managed sensor shows managed badge on sensors page', async () => {
    // Create a monitor via IPC
    const monitor = makeMonitor({ name: `Badge Test Monitor ${Date.now()}` })
    const monitorResult = await ipc.createMonitor(monitor)

    // Create a managed sensor via IPC (with monitor_id and tags)
    const sensor = makeSensor({
      name: `CF: Badge Test ${Date.now()}`,
      monitor_id: monitorResult.id,
      tags: ['cloudflare', 'pages', `project:badge-test-${Date.now()}`],
    })
    await ipc.createSensor(sensor)

    // Navigate to sensors page with reload to pick up new data
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('aside button', { hasText: 'Sensors' }).click()
    await page.waitForTimeout(500)

    // Verify "Managed" badge is visible
    await expect(page.locator('text=Managed')).toBeVisible()

    // Cleanup
    await ipc.deleteMonitor(monitorResult.id)
  })

  test('managed sensor edit redirects to monitor page', async () => {
    // Create a monitor via IPC
    const monitor = makeMonitor({ name: `Redirect Test Monitor ${Date.now()}` })
    const monitorResult = await ipc.createMonitor(monitor)

    // Create a managed sensor via IPC (with tags)
    const sensor = makeSensor({
      name: `CF: Redirect Test ${Date.now()}`,
      monitor_id: monitorResult.id,
      tags: ['cloudflare', 'pages', `project:redirect-test-${Date.now()}`],
    })
    await ipc.createSensor(sensor)

    // Navigate to sensors page with reload to pick up new data
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('aside button', { hasText: 'Sensors' }).click()
    await page.waitForTimeout(500)

    // Click edit on the managed sensor
    const row = page.locator('tr', { hasText: 'Redirect Test' })
    await row.locator('button[title="Edit"]').click()
    await page.waitForTimeout(500)

    // Verify we're on the monitor edit page
    await expect(page.locator('h1', { hasText: 'Edit Monitor' })).toBeVisible()

    // Cleanup
    await ipc.deleteMonitor(monitorResult.id)
  })

  test('monitor with projects config stores project settings', async () => {
    const monitor = makeMonitor({
      name: `Projects Config Test ${Date.now()}`,
      config: {
        api_token: 'test-token-encrypted',
        account_id: 'test-account-id',
        excluded_projects: [],
        projects: [
          { name: 'my-site', branches: ['main'], environments: ['production'], collect_metrics: false },
          { name: 'my-app', branches: ['main', 'staging'], environments: ['production', 'preview'], collect_metrics: true },
        ],
      },
    })
    const result = await ipc.createMonitor(monitor)
    expect(result.id).toBeTruthy()

    const fetched = await ipc.getMonitor(result.id) as { config: { projects: Array<{ name: string; branches: string[]; environments: string[]; collect_metrics: boolean }> } }
    expect(fetched.config.projects).toHaveLength(2)
    expect(fetched.config.projects[0].name).toBe('my-site')
    expect(fetched.config.projects[0].branches).toEqual(['main'])
    expect(fetched.config.projects[0].environments).toEqual(['production'])
    expect(fetched.config.projects[1].environments).toEqual(['production', 'preview'])
    expect(fetched.config.projects[1].collect_metrics).toBe(true)

    // Cleanup
    await ipc.deleteMonitor(result.id)
  })

  test('managed sensor with tags shows tags on sensor', async () => {
    const monitor = makeMonitor({ name: `Tags Test Monitor ${Date.now()}` })
    const monitorResult = await ipc.createMonitor(monitor)

    // Create a managed sensor with auto-generated tags
    const sensor = makeSensor({
      name: `CF: Tags Test ${Date.now()}`,
      monitor_id: monitorResult.id,
      tags: ['cloudflare', 'pages', 'project:my-site'],
    })
    const sensorResult = await ipc.createSensor(sensor)

    const fetched = await ipc.getSensor(sensorResult.id) as { tags: string[] }
    expect(fetched.tags).toContain('cloudflare')
    expect(fetched.tags).toContain('pages')
    expect(fetched.tags).toContain('project:my-site')

    // Cleanup
    await ipc.deleteMonitor(monitorResult.id)
  })
})
