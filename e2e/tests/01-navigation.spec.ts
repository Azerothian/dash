import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'

let app: Awaited<ReturnType<typeof electron.launch>>
let dbPath: string

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-nav-${Date.now()}.duckdb`)
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...process.env, DASH_TEST_DB_PATH: dbPath },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('header').waitFor({ state: 'visible', timeout: 30_000 })
})

test.afterAll(async () => {
  await app?.close()
  for (const suffix of ['', '.wal']) {
    try { unlinkSync(dbPath + suffix) } catch {}
  }
})

test.describe('Navigation', () => {
  test('app loads and redirects to /dashboard', async () => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('header').waitFor({ state: 'visible', timeout: 30_000 })
    const url = page.url()
    expect(url).toMatch(/[#/]dashboard/)
  })

  test('header shows app title', async () => {
    const page = await app.firstWindow()
    const title = await page.locator('header h1').innerText()
    expect(title).toBe('Dash')
  })

  test('sidebar shows all 6 nav items', async () => {
    const page = await app.firstWindow()
    const navButtons = page.locator('aside nav button')
    await expect(navButtons).toHaveCount(6)
  })

  test('sidebar has correct nav labels', async () => {
    const page = await app.firstWindow()
    const expectedLabels = ['Dashboards', 'Sensors', 'Alerts', 'Notifications', 'Cron Tasks', 'Settings']
    for (const label of expectedLabels) {
      await expect(page.locator('aside nav button', { hasText: label })).toBeVisible()
    }
  })

  test('navigate to Sensors page', async () => {
    const page = await app.firstWindow()
    await page.locator('aside button', { hasText: 'Sensors' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Sensors' })).toBeVisible()
  })

  test('navigate to Alerts page', async () => {
    const page = await app.firstWindow()
    await page.locator('aside button', { hasText: 'Alerts' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Alerts' })).toBeVisible()
  })

  test('navigate to Notifications page', async () => {
    const page = await app.firstWindow()
    await page.locator('aside button', { hasText: 'Notifications' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Notifications' })).toBeVisible()
  })

  test('navigate to Cron Tasks page', async () => {
    const page = await app.firstWindow()
    await page.locator('aside button', { hasText: 'Cron Tasks' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Cron Tasks' })).toBeVisible()
  })

  test('navigate to Settings page', async () => {
    const page = await app.firstWindow()
    await page.locator('aside button', { hasText: 'Settings' }).click()
    await page.waitForTimeout(500)
    expect(page.url()).toContain('#/settings')
    // Settings page renders a loading spinner then the full page once data loads
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible({ timeout: 15_000 })
  })

  test('theme toggle cycles through themes', async () => {
    const page = await app.firstWindow()
    const themeButton = page.locator('header button[title^="Theme"]')
    await expect(themeButton).toBeVisible()

    // Click to cycle theme
    const initialText = await themeButton.innerText()
    await themeButton.click()
    await page.waitForTimeout(300)
    const nextText = await themeButton.innerText()
    expect(nextText).not.toBe(initialText)
  })

  test('sidebar toggle collapses and expands', async () => {
    const page = await app.firstWindow()
    const sidebar = page.locator('aside')
    const toggleButton = page.locator('header button[title="Toggle sidebar"]')

    // Get initial width class
    const initialClass = await sidebar.getAttribute('class')
    const initiallyCollapsed = initialClass?.includes('w-16')

    await toggleButton.click()
    await page.waitForTimeout(300)

    const afterClass = await sidebar.getAttribute('class')
    const afterCollapsed = afterClass?.includes('w-16')
    expect(afterCollapsed).not.toBe(initiallyCollapsed)

    // Toggle back
    await toggleButton.click()
    await page.waitForTimeout(300)
    const restoredClass = await sidebar.getAttribute('class')
    const restoredCollapsed = restoredClass?.includes('w-16')
    expect(restoredCollapsed).toBe(initiallyCollapsed)
  })

  test('status bar is visible', async () => {
    const page = await app.firstWindow()
    const footer = page.locator('footer')
    await expect(footer).toBeVisible()
    await expect(footer).toContainText('Dash v0.1.0')
  })

  test('status bar shows sensor count', async () => {
    const page = await app.firstWindow()
    const footer = page.locator('footer')
    await expect(footer.locator('text=/\\d+ sensors running/')).toBeVisible()
  })

  test('status bar shows active alerts count', async () => {
    const page = await app.firstWindow()
    const footer = page.locator('footer')
    await expect(footer.locator('text=/\\d+ active alerts/')).toBeVisible()
  })

  test('status bar persists across navigation', async () => {
    const page = await app.firstWindow()

    // Navigate to Sensors
    await page.locator('aside button', { hasText: 'Sensors' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).toContainText('sensors running')

    // Navigate to Alerts
    await page.locator('aside button', { hasText: 'Alerts' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).toContainText('active alerts')

    // Navigate back to Dashboards
    await page.locator('aside button', { hasText: 'Dashboards' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).toContainText('Dash v0.1.0')
  })
})
