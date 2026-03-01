import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'path'
import { tmpdir } from 'os'
import { unlinkSync } from 'fs'

export interface ElectronFixture {
  electronApp: ElectronApplication
  page: Page
}

export async function launchElectron(): Promise<ElectronFixture> {
  const dbPath = join(tmpdir(), `dash-test-${Date.now()}-${Math.random().toString(36).slice(2)}.duckdb`)

  const electronApp = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: {
      ...process.env,
      DASH_TEST_DB_PATH: dbPath,
    },
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Wait for the app header to be visible
  await page.locator('header').waitFor({ state: 'visible', timeout: 30_000 })

  // Store dbPath on the app object for cleanup
  ;(electronApp as unknown as { _testDbPath: string })._testDbPath = dbPath

  return { electronApp, page }
}

export async function closeElectron(electronApp: ElectronApplication): Promise<void> {
  const dbPath = (electronApp as unknown as { _testDbPath: string })._testDbPath
  await electronApp.close()

  // Clean up temp DB files
  if (dbPath) {
    for (const suffix of ['', '.wal']) {
      try {
        unlinkSync(dbPath + suffix)
      } catch {
        // File may not exist
      }
    }
  }
}
