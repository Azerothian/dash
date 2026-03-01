import { Injectable, OnModuleInit, Inject } from '@nestjs/common'
import * as schedule from 'node-schedule'
import { SensorService } from '../sensor/sensor.service.js'
import { ExecutorService } from '../sensor/executor.service.js'
import { AlertService } from '../alert/alert.service.js'
import { NotificationService } from '../notification/notification.service.js'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { CronTask, CronTaskType } from '@shared/entities'

interface RegisteredTask {
  id: string
  name: string
  type: CronTaskType
  cronExpression: string
  entityId: string
  job: schedule.Job | null
  running: boolean
  lastRun: string | null
  enabled: boolean
}

@Injectable()
export class CronManagerService implements OnModuleInit {
  private tasks = new Map<string, RegisteredTask>()

  constructor(
    @Inject(SensorService) private sensors: SensorService,
    @Inject(ExecutorService) private executor: ExecutorService,
    @Inject(AlertService) private alerts: AlertService,
    @Inject(NotificationService) private notifications: NotificationService,
  ) {}

  async onModuleInit() {
    await this.registerAllTasks()
  }

  async registerAllTasks(): Promise<void> {
    // Clear existing jobs
    for (const task of this.tasks.values()) {
      if (task.job) task.job.cancel()
    }
    this.tasks.clear()

    // Register sensor crons
    const sensors = await this.sensors.list()
    for (const sensor of sensors) {
      if (sensor.enabled && sensor.cron_expression) {
        this.registerTask({
          id: `sensor:${sensor.id}`,
          name: `Sensor: ${sensor.name}`,
          type: 'sensor',
          cronExpression: sensor.cron_expression,
          entityId: sensor.id,
          enabled: true,
        })
      }
    }

    // Register alert crons
    const alerts = await this.alerts.list()
    for (const alert of alerts) {
      if (alert.enabled && alert.cron_expression) {
        this.registerTask({
          id: `alert:${alert.id}`,
          name: `Alert: ${alert.name}`,
          type: 'alert',
          cronExpression: alert.cron_expression,
          entityId: alert.id,
          enabled: true,
        })
      }
    }

    // Register notification crons
    const notifications = await this.notifications.list()
    for (const notif of notifications) {
      if (notif.enabled && notif.cron_expression) {
        this.registerTask({
          id: `notification:${notif.id}`,
          name: `Notification: ${notif.name}`,
          type: 'notification',
          cronExpression: notif.cron_expression,
          entityId: notif.id,
          enabled: true,
        })
      }
    }

    // Register data retention cron (hourly)
    this.registerTask({
      id: 'system:retention',
      name: 'Data Retention Cleanup',
      type: 'sensor',
      cronExpression: '0 * * * *',
      entityId: '__retention__',
      enabled: true,
    })
  }

  private registerTask(opts: {
    id: string
    name: string
    type: CronTaskType
    cronExpression: string
    entityId: string
    enabled: boolean
  }) {
    const existing = this.tasks.get(opts.id)
    if (existing?.job) existing.job.cancel()

    const task: RegisteredTask = {
      ...opts,
      job: null,
      running: false,
      lastRun: existing?.lastRun || null,
    }

    if (opts.enabled) {
      try {
        task.job = schedule.scheduleJob(opts.cronExpression, () => this.executeTask(opts.id))
      } catch {
        // Invalid cron expression, leave job as null
      }
    }

    this.tasks.set(opts.id, task)
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.running) return // Concurrency guard

    task.running = true
    this.broadcastStatus()

    try {
      switch (task.type) {
        case 'sensor':
          if (task.entityId === '__retention__') {
            await this.runRetention()
          } else {
            await this.runSensor(task.entityId)
          }
          break
        case 'alert':
          await this.runAlert(task.entityId)
          break
        case 'notification':
          await this.runNotification(task.entityId)
          break
      }
      task.lastRun = new Date().toISOString()
    } catch {
      // Errors are logged but don't crash the cron
    } finally {
      task.running = false
      this.broadcastStatus()
    }
  }

  private async runSensor(sensorId: string): Promise<void> {
    const sensor = await this.sensors.get(sensorId)
    if (!sensor) return
    const result = await this.executor.execute(
      sensor.execution_type, sensor.script_content,
      sensor.table_definition, sensor.env_vars,
    )
    if (result.success && result.data) {
      await this.sensors.insertData(sensorId, result.data)
      this.broadcast(IPC_CHANNELS.SENSOR_DATA_UPDATED, sensorId)
    }
  }

  private async runAlert(alertId: string): Promise<void> {
    const { state, result } = await this.alerts.evaluate(alertId)
    await this.alerts.updateState(alertId, state, undefined, result as Record<string, unknown>)
    this.broadcast(IPC_CHANNELS.ALERT_STATE_CHANGED, alertId, state)
  }

  private async runNotification(notificationId: string): Promise<void> {
    await this.notifications.dispatchForAlerts(notificationId)
  }

  private async runRetention(): Promise<void> {
    const sensors = await this.sensors.list()
    for (const sensor of sensors) {
      await this.sensors.applyRetention(sensor.id)
    }
  }

  async forceRun(taskId: string): Promise<void> {
    await this.executeTask(taskId)
  }

  async toggleTask(taskId: string, enabled: boolean): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.enabled = enabled
    if (task.job) {
      task.job.cancel()
      task.job = null
    }

    if (enabled) {
      try {
        task.job = schedule.scheduleJob(task.cronExpression, () => this.executeTask(taskId))
      } catch {
        // Invalid cron
      }
    }
  }

  list(): CronTask[] {
    return Array.from(this.tasks.values()).map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      cron_expression: t.cronExpression,
      running: t.running,
      last_run: t.lastRun,
      enabled: t.enabled,
    }))
  }

  getStatus(): { runningSensors: number; activeAlerts: number } {
    let runningSensors = 0
    let activeAlerts = 0
    for (const task of this.tasks.values()) {
      if (task.running && task.type === 'sensor') runningSensors++
      if (task.running && task.type === 'alert') activeAlerts++
    }
    return { runningSensors, activeAlerts }
  }

  async refreshEntity(type: CronTaskType, entityId: string): Promise<void> {
    // Re-register tasks for the given entity
    const taskId = `${type}:${entityId}`
    const existing = this.tasks.get(taskId)
    if (existing?.job) existing.job.cancel()
    this.tasks.delete(taskId)

    switch (type) {
      case 'sensor': {
        const sensor = await this.sensors.get(entityId)
        if (sensor?.enabled && sensor.cron_expression) {
          this.registerTask({
            id: taskId,
            name: `Sensor: ${sensor.name}`,
            type: 'sensor',
            cronExpression: sensor.cron_expression,
            entityId,
            enabled: true,
          })
        }
        break
      }
      case 'alert': {
        const alert = await this.alerts.get(entityId)
        if (alert?.enabled && alert.cron_expression) {
          this.registerTask({
            id: taskId,
            name: `Alert: ${alert.name}`,
            type: 'alert',
            cronExpression: alert.cron_expression,
            entityId,
            enabled: true,
          })
        }
        break
      }
      case 'notification': {
        const notif = await this.notifications.get(entityId)
        if (notif?.enabled && notif.cron_expression) {
          this.registerTask({
            id: taskId,
            name: `Notification: ${notif.name}`,
            type: 'notification',
            cronExpression: notif.cron_expression,
            entityId,
            enabled: true,
          })
        }
        break
      }
    }
  }

  async removeEntity(type: CronTaskType, entityId: string): Promise<void> {
    const taskId = `${type}:${entityId}`
    const existing = this.tasks.get(taskId)
    if (existing?.job) existing.job.cancel()
    this.tasks.delete(taskId)
  }

  private broadcast(channel: string, ...args: unknown[]) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, ...args)
    }
  }

  private broadcastStatus() {
    this.broadcast(IPC_CHANNELS.CRON_TASK_STATUS, this.getStatus())
  }
}
