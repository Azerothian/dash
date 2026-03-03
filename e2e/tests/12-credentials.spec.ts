import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'
import { IpcHelper } from '../helpers/ipc'
import { makeCredential, makeMonitor } from '../helpers/factory'

let app: Awaited<ReturnType<typeof electron.launch>>
let page: Awaited<ReturnType<typeof app.firstWindow>>
let dbPath: string
let ipc: IpcHelper

async function goToSettings() {
  await page.locator('aside button', { hasText: 'Settings' }).click()
  await page.waitForTimeout(300)
}

async function goToMonitors() {
  await page.locator('aside button', { hasText: 'Monitors' }).click()
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('aside button', { hasText: 'Monitors' }).click()
  await page.waitForTimeout(500)
}

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-credentials-${Date.now()}.duckdb`)
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

test.describe('Credentials', () => {
  test('credentials section visible in settings', async () => {
    await goToSettings()
    await expect(page.locator('h2', { hasText: 'Credentials' })).toBeVisible()
  })

  test('create credential via IPC', async () => {
    const cred = makeCredential()
    const result = await ipc.createCredential(cred)
    expect(result.id).toBeTruthy()
  })

  test('list credentials via IPC', async () => {
    const cred2 = makeCredential()
    await ipc.createCredential(cred2)

    const list = await ipc.listCredentials()
    expect(list.length).toBeGreaterThanOrEqual(2)
  })

  test('update credential name via IPC', async () => {
    const cred = makeCredential()
    const result = await ipc.createCredential(cred)

    const newName = `Updated Credential ${Date.now()}`
    await ipc.updateCredential({ id: result.id, name: newName })

    const fetched = await ipc.getCredential(result.id) as { name: string }
    expect(fetched.name).toBe(newName)
  })

  test('update credential preserves token when not provided', async () => {
    const cred = makeCredential()
    const result = await ipc.createCredential(cred)

    // Update only name, not config
    await ipc.updateCredential({ id: result.id, name: `Preserved Token ${Date.now()}` })

    const fetched = await ipc.getCredential(result.id) as { config: { api_token: string } }
    // Token should still exist (encrypted)
    expect(fetched.config.api_token).toBeTruthy()
  })

  test('delete credential via IPC', async () => {
    const cred = makeCredential()
    const result = await ipc.createCredential(cred)

    await ipc.deleteCredential(result.id)

    const list = await ipc.listCredentials() as { id: string }[]
    const found = list.find((c) => c.id === result.id)
    expect(found).toBeUndefined()
  })

  test('credential env var mapping persists', async () => {
    const cred = makeCredential({
      env_var_map: { api_token: 'CF_API_TOKEN', account_id: 'CF_ACCOUNT_ID' },
    })
    const result = await ipc.createCredential(cred)

    const fetched = await ipc.getCredential(result.id) as { env_var_map: Record<string, string> }
    expect(fetched.env_var_map).toEqual({ api_token: 'CF_API_TOKEN', account_id: 'CF_ACCOUNT_ID' })

    // Cleanup
    await ipc.deleteCredential(result.id)
  })

  test('monitor with credential_id stores reference', async () => {
    const cred = makeCredential()
    const credResult = await ipc.createCredential(cred)

    const monitor = makeMonitor({ credential_id: credResult.id })
    const monitorResult = await ipc.createMonitor(monitor)

    const fetched = await ipc.getMonitor(monitorResult.id) as { credential_id: string }
    expect(fetched.credential_id).toBe(credResult.id)

    // Cleanup
    await ipc.deleteMonitor(monitorResult.id)
    await ipc.deleteCredential(credResult.id)
  })

  test('existing monitors without credential_id still work', async () => {
    const monitor = makeMonitor()
    const result = await ipc.createMonitor(monitor)

    const fetched = await ipc.getMonitor(result.id) as { credential_id: string | null; config: { api_token: string } }
    expect(fetched.credential_id).toBeNull()
    expect(fetched.config.api_token).toBeTruthy()

    // Cleanup
    await ipc.deleteMonitor(result.id)
  })

  test('create credential via settings UI', async () => {
    // Clean up existing credentials first
    const existing = await ipc.listCredentials() as { id: string }[]
    for (const c of existing) {
      await ipc.deleteCredential(c.id)
    }

    await goToSettings()

    // Click Add Credential
    await page.locator('button', { hasText: 'Add Credential' }).click()
    await page.waitForTimeout(300)

    // Fill form
    await page.locator('input[placeholder="e.g. Production Cloudflare"]').fill('UI Test Credential')
    await page.locator('input[placeholder="Cloudflare API Token"]').fill('ui-test-token')
    await page.locator('input[placeholder="Cloudflare Account ID"]').fill('ui-test-account')

    // Save - use the Credentials section's save button specifically
    const credSection = page.locator('section', { hasText: 'Credentials' })
    await credSection.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(500)

    // Verify it appears in the list
    await expect(page.locator('text=UI Test Credential')).toBeVisible()

    // Verify via IPC
    const list = await ipc.listCredentials() as { name: string }[]
    expect(list.some((c) => c.name === 'UI Test Credential')).toBeTruthy()
  })

  test('edit credential name via settings UI', async () => {
    // Reload to ensure fresh state
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
    await goToSettings()
    await page.waitForTimeout(500)

    // Click edit on the credential within Credentials section
    const credSection = page.locator('section', { hasText: 'Credentials' })
    await credSection.locator('button[title="Edit"]').first().click()
    await page.waitForTimeout(300)

    // Clear and type new name
    const nameInput = page.locator('input[placeholder="e.g. Production Cloudflare"]')
    await nameInput.clear()
    await nameInput.fill('Renamed Credential')

    // Save within credential section
    await credSection.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(500)

    // Verify
    await expect(page.locator('text=Renamed Credential')).toBeVisible()
  })

  test('delete credential via settings UI', async () => {
    // Reload to ensure fresh state
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('header').waitFor({ state: 'visible', timeout: 15_000 })
    await goToSettings()
    await page.waitForTimeout(500)

    // Click delete within Credentials section
    const credSection = page.locator('section', { hasText: 'Credentials' })
    await credSection.locator('button[title="Delete"]').first().click()
    await page.waitForTimeout(500)

    // Verify removed
    const list = await ipc.listCredentials()
    expect(list.length).toBe(0)
  })

  test('monitor form shows credential dropdown', async () => {
    // Create a credential first
    const cred = makeCredential({ name: `Dropdown Test ${Date.now()}` })
    const credResult = await ipc.createCredential(cred)

    // Navigate to new monitor form
    await goToMonitors()
    await page.locator('button', { hasText: 'New Monitor' }).click()
    await page.waitForTimeout(500)

    // Verify credential dropdown exists and contains the credential
    const select = page.locator('select').filter({ hasText: 'Enter manually' })
    await expect(select).toBeVisible()

    // Cleanup
    await ipc.deleteCredential(credResult.id)
  })

  test('monitor form hides token fields when credential selected', async () => {
    // Create a credential
    const cred = makeCredential({ name: `Hide Fields Test ${Date.now()}` })
    const credResult = await ipc.createCredential(cred)

    // Navigate to new monitor form
    await goToMonitors()
    await page.locator('button', { hasText: 'New Monitor' }).click()
    await page.waitForTimeout(500)

    // Select the credential
    const select = page.locator('select').filter({ hasText: 'Enter manually' })
    await select.selectOption(credResult.id)
    await page.waitForTimeout(300)

    // Verify token fields are hidden
    await expect(page.locator('text=Using stored credential')).toBeVisible()

    // Cleanup
    await ipc.deleteCredential(credResult.id)
  })
})
