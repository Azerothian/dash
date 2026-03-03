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
let sensorId: string
const createdSensorIds: string[] = []

test.beforeAll(async () => {
  dbPath = join(tmpdir(), `dash-sensor-exec-${Date.now()}.duckdb`)
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

test.describe('Sensor Execution & Data View', () => {
  test('create sensor with multiple columns and JSON selectors', async () => {
    const data = makeSensor({
      name: 'Multi-Column Sensor',
      script_content: 'echo \'{"cpu": 85.5, "memory": {"used": 4096, "total": 8192}}\'',
      table_definition: [
        { name: 'cpu', type: 'DOUBLE', json_selector: '$.cpu' },
        { name: 'mem_used', type: 'INTEGER', json_selector: '$.memory.used' },
        { name: 'mem_total', type: 'INTEGER', json_selector: '$.memory.total' },
      ],
    })
    const result = await ipc.createSensor(data)
    expect(result.id).toBeTruthy()
    sensorId = result.id
    createdSensorIds.push(sensorId)
  })

  test('execute sensor via IPC and verify data is collected', async () => {
    await ipc.runSensor(sensorId)
    await page.waitForTimeout(1000)

    const rows = await ipc.listSensorData(sensorId) as Array<{ data: Record<string, unknown> }>
    expect(rows).toHaveLength(1)
    expect(rows[0].data.cpu).toBe(85.5)
    expect(rows[0].data.mem_used).toBe(4096)
    expect(rows[0].data.mem_total).toBe(8192)
  })

  test('execute sensor again to accumulate rows', async () => {
    await ipc.runSensor(sensorId)
    await page.waitForTimeout(1000)

    const rows = await ipc.listSensorData(sensorId)
    expect(rows).toHaveLength(2)
  })

  test('navigate to sensors page and verify sensor in list', async () => {
    await goToSensors()
    await expect(page.locator('td', { hasText: 'Multi-Column Sensor' })).toBeVisible()
  })

  test('click View Data and verify data view page', async () => {
    await page.locator('button[title="View Data"]').first().click()
    await page.waitForTimeout(500)

    await expect(page.locator('h1', { hasText: 'Sensor Data' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'Collected At' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'cpu' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'mem_used' })).toBeVisible()
    await expect(page.locator('th', { hasText: 'mem_total' })).toBeVisible()

    const rowCount = await page.locator('tbody tr').count()
    expect(rowCount).toBe(2)
  })

  test('data view shows correct extracted values', async () => {
    await expect(page.locator('tbody td', { hasText: '85.5' }).first()).toBeVisible()
    await expect(page.locator('tbody td', { hasText: '4096' }).first()).toBeVisible()
    await expect(page.locator('tbody td', { hasText: '8192' }).first()).toBeVisible()
  })

  test('limit dropdown changes row count', async () => {
    await page.locator('select').selectOption('25')
    await page.waitForTimeout(500)

    const rowCount = await page.locator('tbody tr').count()
    expect(rowCount).toBe(2)
  })

  test('back button returns to sensor list', async () => {
    await page.locator('button', { hasText: '←' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1', { hasText: 'Sensors' }).first()).toBeVisible()
  })
})
