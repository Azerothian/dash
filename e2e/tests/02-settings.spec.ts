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

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-settings-${Date.now()}.duckdb`)
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...process.env, DASH_TEST_DB_PATH: dbPath },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('header').waitFor({ state: 'visible', timeout: 30_000 })
  ipc = new IpcHelper(page)

  // Navigate to settings
  await page.locator('aside button', { hasText: 'Settings' }).click()
  await page.waitForTimeout(500)
})

test.afterAll(async () => {
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

test.describe('Settings', () => {
  test('settings page loads with heading', async () => {
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible()
  })

  test('general section is visible', async () => {
    await expect(page.locator('h2', { hasText: 'General' })).toBeVisible()
  })

  test('theme buttons are visible', async () => {
    const themeButtons = page.locator('button', { hasText: /^(light|dark|system)$/i })
    const count = await themeButtons.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('theme selection persists via IPC', async () => {
    // Click the "dark" theme button
    await page.locator('button:text-is("dark")').click()
    await page.waitForTimeout(500)

    // Verify via IPC
    const settings = await ipc.getSettings()
    expect(settings.theme).toBe('dark')

    // Switch back to light
    await page.locator('button:text-is("light")').click()
    await page.waitForTimeout(500)
    const settings2 = await ipc.getSettings()
    expect(settings2.theme).toBe('light')
  })

  test('minimize to tray toggle saves', async () => {
    const toggle = page.locator('label', { hasText: 'Minimize to tray' }).locator('button[role="switch"]')
    const initialState = await toggle.getAttribute('aria-checked')

    await toggle.click()
    await page.waitForTimeout(500)

    const settings = await ipc.getSettings()
    const expected = initialState === 'true' ? false : true
    expect(settings.minimize_to_tray).toBe(expected)

    // Toggle back
    await toggle.click()
    await page.waitForTimeout(500)
  })

  test('desktop notifications toggle saves', async () => {
    const toggle = page.locator('label', { hasText: 'Desktop notifications enabled' }).locator('button[role="switch"]')
    const initialState = await toggle.getAttribute('aria-checked')

    await toggle.click()
    await page.waitForTimeout(500)

    const settings = await ipc.getSettings()
    const expected = initialState === 'true' ? false : true
    expect(settings.desktop_notifications_enabled).toBe(expected)

    // Toggle back
    await toggle.click()
    await page.waitForTimeout(500)
  })

  test('SMTP section is visible', async () => {
    await expect(page.locator('h2', { hasText: 'Global SMTP' })).toBeVisible()
  })

  test('SMTP host field saves', async () => {
    const hostInput = page.locator('input[placeholder="smtp.example.com"]')
    await hostInput.fill('mail.test.com')

    // Click Save SMTP
    await page.locator('button', { hasText: 'Save SMTP' }).click()
    await page.waitForTimeout(500)

    const settings = await ipc.getSettings()
    const smtp = settings.smtp_config as { host: string } | null
    expect(smtp?.host).toBe('mail.test.com')

    // Clean up
    await hostInput.fill('')
    await page.locator('button', { hasText: 'Save SMTP' }).click()
    await page.waitForTimeout(300)
  })

  test('settings get-all returns all expected keys', async () => {
    const settings = await ipc.getSettings()
    expect(settings).toHaveProperty('theme')
    expect(settings).toHaveProperty('minimize_to_tray')
    expect(settings).toHaveProperty('desktop_notifications_enabled')
  })
})
