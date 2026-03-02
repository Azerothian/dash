import type { Page } from '@playwright/test'

/**
 * Typed wrapper around window.api.invoke() for E2E tests.
 * All channel strings match src/shared/ipc-channels.ts exactly.
 */
export class IpcHelper {
  constructor(private page: Page) {}

  private invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(
      ({ ch, a }) => (window as unknown as { api: { invoke: (c: string, ...args: unknown[]) => Promise<unknown> } }).api.invoke(ch, ...a),
      { ch: channel, a: args },
    ) as Promise<T>
  }

  // Sensors
  listSensors() { return this.invoke<unknown[]>('sensor:list') }
  getSensor(id: string) { return this.invoke<unknown>('sensor:get', id) }
  createSensor(data: Record<string, unknown>) { return this.invoke<{ id: string }>('sensor:create', data) }
  updateSensor(data: Record<string, unknown>) { return this.invoke<unknown>('sensor:update', data) }
  deleteSensor(id: string) { return this.invoke<void>('sensor:delete', id) }
  runSensor(id: string) { return this.invoke<unknown>('sensor:run', id) }
  listSensorData(sensorId: string, limit?: number) { return this.invoke<unknown[]>('sensor-data:list', sensorId, limit) }
  getSensorDataAggregated(sensorId: string, column: string, aggregation: string, timeWindowMinutes: number) {
    return this.invoke<{ result: number | null }>('sensor-data:aggregated', sensorId, column, aggregation, timeWindowMinutes)
  }

  // Alerts
  listAlerts() { return this.invoke<unknown[]>('alert:list') }
  getAlert(id: string) { return this.invoke<unknown>('alert:get', id) }
  createAlert(data: Record<string, unknown>) { return this.invoke<{ id: string }>('alert:create', data) }
  updateAlert(data: Record<string, unknown>) { return this.invoke<unknown>('alert:update', data) }
  deleteAlert(id: string) { return this.invoke<void>('alert:delete', id) }
  ackAlert(id: string, message: string) { return this.invoke<void>('alert:ack', { id, message }) }
  clearAckAlert(id: string) { return this.invoke<void>('alert:clear-ack', id) }
  runAlert(id: string) { return this.invoke<unknown>('alert:run', id) }
  listAlertHistory(alertId: string) { return this.invoke<unknown[]>('alert:history-list', alertId) }

  // Notifications
  listNotifications() { return this.invoke<unknown[]>('notification:list') }
  getNotification(id: string) { return this.invoke<unknown>('notification:get', id) }
  createNotification(data: Record<string, unknown>) { return this.invoke<{ id: string }>('notification:create', data) }
  updateNotification(data: Record<string, unknown>) { return this.invoke<unknown>('notification:update', data) }
  deleteNotification(id: string) { return this.invoke<void>('notification:delete', id) }
  testNotification(id: string) { return this.invoke<unknown>('notification:test', id) }

  // Dashboards
  listDashboards() { return this.invoke<unknown[]>('dashboard:list') }
  getDashboard(id: string) { return this.invoke<unknown>('dashboard:get', id) }
  createDashboard(data: Record<string, unknown>) { return this.invoke<{ id: string }>('dashboard:create', data) }
  deleteDashboard(id: string) { return this.invoke<void>('dashboard:delete', id) }

  // Panels
  createPanel(data: Record<string, unknown>) { return this.invoke<{ id: string }>('panel:create', data) }
  deletePanel(id: string) { return this.invoke<void>('panel:delete', id) }

  // Cron
  listCronTasks() { return this.invoke<unknown[]>('cron:list') }
  toggleCron(taskId: string, enabled: boolean) { return this.invoke<void>('cron:toggle', { taskId, enabled }) }
  forceRunCron(taskId: string) { return this.invoke<unknown>('cron:force-run', taskId) }

  // Settings
  getSettings() { return this.invoke<Record<string, unknown>>('settings:get-all') }
  setSetting(key: string, value: unknown) { return this.invoke<void>('settings:set', { key, value }) }
}
