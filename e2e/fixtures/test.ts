import { test as base, expect } from '@playwright/test'
import { launchElectron, closeElectron, type ElectronFixture } from './electron.fixture'

type TestFixtures = ElectronFixture

const test = base.extend<TestFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const { electronApp } = await launchElectron()
    await use(electronApp)
    await closeElectron(electronApp)
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await use(page)
  },
})

export { test, expect }
