import { Injectable, OnModuleInit, Inject } from '@nestjs/common'
import * as schedule from 'node-schedule'
import { v4 as uuidv4 } from 'uuid'
import { SensorService } from '../sensor/sensor.service.js'
import { ExecutorService } from '../sensor/executor.service.js'
import { AlertService } from '../alert/alert.service.js'
import { NotificationService } from '../notification/notification.service.js'
import { MonitorService } from '../monitor/monitor.service.js'
import { MonitorExecutorService } from '../monitor/monitor-executor.service.js'
import { DatabaseService } from '../database/database.service.js'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { CronTask, CronTaskType, CronExecutionLog } from '@shared/entities'

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
  failureCount: number
  lastError: string | null
}

@Injectable()
export class CronManagerService implements OnModuleInit {
  private tasks = new Map<string, RegisteredTask>()

  constructor(
    @Inject(SensorService) private sensors: SensorService,
    @Inject(ExecutorService) private executor: ExecutorService,
    @Inject(AlertService) private alerts: AlertService,
    @Inject(NotificationService) private notifications: NotificationService,
    @Inject(MonitorService) private monitors: MonitorService,
    @Inject(MonitorExecutorService) private monitorExecutor: MonitorExecutorService,
    @Inject(DatabaseService) private db: DatabaseService,
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

    // Register monitor crons
    const monitorList = await this.monitors.list()
    for (const monitor of monitorList) {
      if (monitor.enabled && monitor.cron_expression) {
        this.registerTask({
          id: `monitor:${monitor.id}`,
          name: `Monitor: ${monitor.name}`,
          type: 'monitor',
          cronExpression: monitor.cron_expression,
          entityId: monitor.id,
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
      failureCount: existing?.failureCount ?? 0,
      lastError: existing?.lastError ?? null,
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

    const start = Date.now()
    let status: 'success' | 'error' = 'success'
    let errorMessage: string | null = null

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
        case 'monitor':
          await this.runMonitor(task.entityId)
          break
      }
      task.lastError = null
    } catch (err) {
      status = 'error'
      errorMessage = err instanceof Error ? err.message : String(err)
      task.failureCount++
      task.lastError = errorMessage
    } finally {
      task.lastRun = new Date().toISOString()
      const durationMs = Date.now() - start
      task.running = false
      this.broadcastStatus()
      this.recordExecution(taskId, task.type, status, errorMessage, durationMs).catch(() => {})
    }
  }

  private async runSensor(sensorId: string): Promise<void> {
    const sensor = await this.sensors.get(sensorId)
    if (!sensor) return
    const result = await this.executor.execute(
      sensor.execution_type, sensor.script_content,
      sensor.table_definition, sensor.env_vars,
      sensor.script_file_path,
    )
    if (!result.success) {
      throw new Error(result.error || 'Sensor execution failed')
    }
    if (result.data) {
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

  private async runMonitor(monitorId: string): Promise<void> {
    const monitor = await this.monitors.get(monitorId)
    if (!monitor) return
    await this.monitorExecutor.execute(monitor)
    this.broadcast(IPC_CHANNELS.SENSOR_DATA_UPDATED, monitorId)
  }

  private async runRetention(): Promise<void> {
    const sensors = await this.sensors.list()
    for (const sensor of sensors) {
      await this.sensors.applyRetention(sensor.id)
    }
    await this.cleanupExecutionLogs().catch(() => {})
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
      failure_count: t.failureCount,
      last_error: t.lastError,
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
      case 'monitor': {
        const monitor = await this.monitors.get(entityId)
        if (monitor?.enabled && monitor.cron_expression) {
          this.registerTask({
            id: taskId,
            name: `Monitor: ${monitor.name}`,
            type: 'monitor',
            cronExpression: monitor.cron_expression,
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

  private async recordExecution(
    taskId: string,
    entityType: CronTaskType,
    status: 'success' | 'error',
    errorMessage: string | null,
    durationMs: number,
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO cron_execution_log (id, task_id, entity_type, status, error_message, duration_ms, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, current_timestamp)`,
      uuidv4(), taskId, entityType, status, errorMessage, durationMs,
    )
  }

  async getExecutionLog(taskId: string, limit = 50, offset = 0): Promise<CronExecutionLog[]> {
    return this.db.all<CronExecutionLog>(
      `SELECT id, task_id, entity_type, status, error_message, duration_ms, executed_at
       FROM cron_execution_log
       WHERE task_id = ?
       ORDER BY executed_at DESC
       LIMIT ? OFFSET ?`,
      taskId, limit, offset,
    )
  }

  private async cleanupExecutionLogs(): Promise<void> {
    // Delete logs older than 30 days
    await this.db.run(
      `DELETE FROM cron_execution_log WHERE executed_at < current_timestamp - INTERVAL 30 DAY`,
    )
    // Keep max 1000 per task
    await this.db.run(
      `DELETE FROM cron_execution_log WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY executed_at DESC) as rn
          FROM cron_execution_log
        ) WHERE rn > 1000
      )`,
    )
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
