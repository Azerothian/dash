import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import { IpcHelper } from '../helpers/ipc'
import { makeNotification } from '../helpers/factory'

let app: Awaited<ReturnType<typeof electron.launch>>
let page: Awaited<ReturnType<typeof app.firstWindow>>
let ipc: IpcHelper
let dbPath: string
let notificationId: string

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-notif-${Date.now()}.duckdb`)
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
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

async function goToNotifications() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: 'Notifications' }).click()
  await page.waitForTimeout(500)
}

test.describe('Notifications', () => {
  test('notifications page shows empty state', async () => {
    await page.locator('aside button', { hasText: 'Notifications' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Notifications' })).toBeVisible()
    await expect(page.locator('text=No notifications configured')).toBeVisible()
  })

  test('create notification via IPC', async () => {
    const data = makeNotification({ name: 'E2E Desktop Notification' })
    const result = await ipc.createNotification(data)
    notificationId = result.id
    expect(result.id).toBeTruthy()

    await goToNotifications()
    await expect(page.locator('td', { hasText: 'E2E Desktop Notification' })).toBeVisible()
  })

  test('notification shows method label', async () => {
    // Page should still be on notifications from previous test
    const methodCell = page.locator('td span', { hasText: 'Desktop' })
    await expect(methodCell).toBeVisible()
  })

  test('test send button works', async () => {
    const testButton = page.locator('button[title="Test Send"]').first()
    await expect(testButton).toBeVisible()
    await testButton.click()
    await page.waitForTimeout(2000)
    await expect(page.locator('td', { hasText: 'E2E Desktop Notification' })).toBeVisible()
  })

  test('notification shows active status', async () => {
    const statusBadge = page.locator('span', { hasText: 'Active' }).first()
    await expect(statusBadge).toBeVisible()
  })

  test('delete notification - accept removes it', async () => {
    await goToNotifications()
    await page.locator('button[title="Delete"]').first().click()
    await page.waitForTimeout(300)
    await expect(page.locator('h3', { hasText: 'Delete Notification' })).toBeVisible()
    await page.locator('button', { hasText: 'Delete' }).last().click()
    await page.waitForTimeout(1000)

    const notifications = await ipc.listNotifications()
    expect(notifications.length).toBe(0)
    notificationId = ''
  })
})
