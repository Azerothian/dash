import { Injectable, OnModuleInit, Inject } from '@nestjs/common'
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { SettingsService } from '../settings/settings.service.js'
import { SensorService } from '../sensor/sensor.service.js'
import { ExecutorService } from '../sensor/executor.service.js'
import { AlertService } from '../alert/alert.service.js'
import { DashboardService } from '../dashboard/dashboard.service.js'
import { NotificationService } from '../notification/notification.service.js'
import { CronManagerService } from '../cron/cron-manager.service.js'
import type { Settings, CreateSensor, UpdateSensor, CreateAlert, UpdateAlert, CreateDashboard, UpdateDashboard, CreatePanel, UpdatePanel, GridstackConfig, CreateNotification, UpdateNotification } from '@shared/entities'

@Injectable()
export class IpcBridgeService implements OnModuleInit {
  constructor(
    @Inject(SettingsService) private settings: SettingsService,
    @Inject(SensorService) private sensors: SensorService,
    @Inject(ExecutorService) private executor: ExecutorService,
    @Inject(AlertService) private alerts: AlertService,
    @Inject(DashboardService) private dashboards: DashboardService,
    @Inject(NotificationService) private notifications: NotificationService,
    @Inject(CronManagerService) private cron: CronManagerService,
  ) {}

  onModuleInit() {
    this.registerSettingsHandlers()
    this.registerSensorHandlers()
    this.registerAlertHandlers()
    this.registerDashboardHandlers()
    this.registerNotificationHandlers()
    this.registerCronHandlers()
  }

  private registerSettingsHandlers() {
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
      return this.settings.getAll()
    })
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event, key: keyof Settings) => {
      return this.settings.get(key)
    })
    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, key: keyof Settings, value: unknown) => {
      await this.settings.set(key, value as Settings[typeof key])
      return { success: true }
    })
  }

  private registerSensorHandlers() {
    ipcMain.handle(IPC_CHANNELS.SENSOR_LIST, async () => this.sensors.list())
    ipcMain.handle(IPC_CHANNELS.SENSOR_GET, async (_event, id: string) => this.sensors.get(id))
    ipcMain.handle(IPC_CHANNELS.SENSOR_CREATE, async (_event, data: CreateSensor) => {
      const sensor = await this.sensors.create(data)
      await this.cron.refreshEntity('sensor', sensor.id)
      return sensor
    })
    ipcMain.handle(IPC_CHANNELS.SENSOR_UPDATE, async (_event, data: UpdateSensor) => {
      const sensor = await this.sensors.update(data)
      await this.cron.refreshEntity('sensor', data.id)
      return sensor
    })
    ipcMain.handle(IPC_CHANNELS.SENSOR_DELETE, async (_event, id: string) => {
      await this.cron.removeEntity('sensor', id)
      await this.sensors.delete(id)
      return { success: true }
    })
    ipcMain.handle(IPC_CHANNELS.SENSOR_RUN, async (_event, id: string) => {
      const sensor = await this.sensors.get(id)
      if (!sensor) throw new Error(`Sensor ${id} not found`)
      const result = await this.executor.execute(sensor.execution_type, sensor.script_content, sensor.table_definition, sensor.env_vars)
      if (result.success && result.data) {
        await this.sensors.insertData(id, result.data)
        this.broadcast(IPC_CHANNELS.SENSOR_DATA_UPDATED, id)
      }
      return result
    })
    ipcMain.handle(IPC_CHANNELS.SENSOR_DATA_LIST, async (_event, sensorId: string, limit?: number) => {
      return this.sensors.getData(sensorId, limit)
    })
  }

  private registerAlertHandlers() {
    ipcMain.handle(IPC_CHANNELS.ALERT_LIST, async () => this.alerts.list())
    ipcMain.handle(IPC_CHANNELS.ALERT_GET, async (_event, id: string) => this.alerts.get(id))
    ipcMain.handle(IPC_CHANNELS.ALERT_CREATE, async (_event, data: CreateAlert) => {
      const alert = await this.alerts.create(data)
      await this.cron.refreshEntity('alert', alert.id)
      return alert
    })
    ipcMain.handle(IPC_CHANNELS.ALERT_UPDATE, async (_event, data: UpdateAlert) => {
      const alert = await this.alerts.update(data)
      await this.cron.refreshEntity('alert', data.id)
      return alert
    })
    ipcMain.handle(IPC_CHANNELS.ALERT_DELETE, async (_event, id: string) => {
      await this.cron.removeEntity('alert', id)
      await this.alerts.delete(id)
      return { success: true }
    })
    ipcMain.handle(IPC_CHANNELS.ALERT_ACK, async (_event, id: string, message: string) => {
      return this.alerts.acknowledge(id, message)
    })
    ipcMain.handle(IPC_CHANNELS.ALERT_CLEAR_ACK, async (_event, id: string) => {
      return this.alerts.clearAck(id)
    })
    ipcMain.handle(IPC_CHANNELS.ALERT_RUN, async (_event, id: string) => {
      const { state, result } = await this.alerts.evaluate(id)
      const alert = await this.alerts.updateState(id, state, undefined, result as Record<string, unknown>)
      this.broadcast(IPC_CHANNELS.ALERT_STATE_CHANGED, id, state)
      return alert
    })
    ipcMain.handle(IPC_CHANNELS.ALERT_HISTORY_LIST, async (_event, alertId: string, limit?: number, offset?: number) => {
      return this.alerts.getHistory(alertId, limit, offset)
    })
  }

  private registerDashboardHandlers() {
    ipcMain.handle(IPC_CHANNELS.DASHBOARD_LIST, async () => this.dashboards.list())
    ipcMain.handle(IPC_CHANNELS.DASHBOARD_GET, async (_event, id: string) => this.dashboards.get(id))
    ipcMain.handle(IPC_CHANNELS.DASHBOARD_CREATE, async (_event, data: CreateDashboard) => this.dashboards.create(data))
    ipcMain.handle(IPC_CHANNELS.DASHBOARD_UPDATE, async (_event, data: UpdateDashboard) => this.dashboards.update(data))
    ipcMain.handle(IPC_CHANNELS.DASHBOARD_DELETE, async (_event, id: string) => {
      await this.dashboards.delete(id)
      return { success: true }
    })
    ipcMain.handle(IPC_CHANNELS.DASHBOARD_SET_PRIMARY, async (_event, id: string) => this.dashboards.setPrimary(id))
    ipcMain.handle(IPC_CHANNELS.DASHBOARD_REORDER, async (_event, ids: string[]) => {
      await this.dashboards.reorder(ids)
      return { success: true }
    })
    ipcMain.handle(IPC_CHANNELS.PANEL_CREATE, async (_event, data: CreatePanel) => this.dashboards.createPanel(data))
    ipcMain.handle(IPC_CHANNELS.PANEL_UPDATE, async (_event, data: UpdatePanel) => this.dashboards.updatePanel(data))
    ipcMain.handle(IPC_CHANNELS.PANEL_DELETE, async (_event, id: string) => {
      await this.dashboards.deletePanel(id)
      return { success: true }
    })
    ipcMain.handle(IPC_CHANNELS.PANEL_BATCH_UPDATE, async (_event, updates: { id: string; gridstack_config: GridstackConfig }[]) => {
      await this.dashboards.batchUpdatePanels(updates)
      return { success: true }
    })
  }

  private registerCronHandlers() {
    ipcMain.handle(IPC_CHANNELS.CRON_LIST, async () => this.cron.list())
    ipcMain.handle(IPC_CHANNELS.CRON_FORCE_RUN, async (_event, taskId: string) => {
      await this.cron.forceRun(taskId)
      return { success: true }
    })
    ipcMain.handle(IPC_CHANNELS.CRON_TOGGLE, async (_event, taskId: string, enabled: boolean) => {
      await this.cron.toggleTask(taskId, enabled)
      return { success: true }
    })
  }

  private registerNotificationHandlers() {
    ipcMain.handle(IPC_CHANNELS.NOTIFICATION_LIST, async () => this.notifications.list())
    ipcMain.handle(IPC_CHANNELS.NOTIFICATION_GET, async (_event, id: string) => this.notifications.get(id))
    ipcMain.handle(IPC_CHANNELS.NOTIFICATION_CREATE, async (_event, data: CreateNotification) => {
      const notif = await this.notifications.create(data)
      await this.cron.refreshEntity('notification', notif.id)
      return notif
    })
    ipcMain.handle(IPC_CHANNELS.NOTIFICATION_UPDATE, async (_event, data: UpdateNotification) => {
      const notif = await this.notifications.update(data)
      await this.cron.refreshEntity('notification', data.id)
      return notif
    })
    ipcMain.handle(IPC_CHANNELS.NOTIFICATION_DELETE, async (_event, id: string) => {
      await this.cron.removeEntity('notification', id)
      await this.notifications.delete(id)
      return { success: true }
    })
    ipcMain.handle(IPC_CHANNELS.NOTIFICATION_TEST, async (_event, id: string) => {
      return this.notifications.testSend(id)
    })
    ipcMain.handle(IPC_CHANNELS.NOTIFICATION_HISTORY_LIST, async (_event, notificationId: string, limit?: number, offset?: number) => {
      return this.notifications.getHistory(notificationId, limit, offset)
    })
  }

  broadcast(channel: string, ...args: unknown[]) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, ...args)
    }
  }
}
