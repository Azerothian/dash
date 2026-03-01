import { Injectable, Inject } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../database/database.service.js'
import { AlertService } from '../alert/alert.service.js'
import { SettingsService } from '../settings/settings.service.js'
import type {
  Notification, NotificationHistory, CreateNotification, UpdateNotification,
  NotificationMethod, SmtpConfig, WebhookConfig, DesktopConfig, AlertState,
} from '@shared/entities'

@Injectable()
export class NotificationService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(AlertService) private alerts: AlertService,
    @Inject(SettingsService) private settings: SettingsService,
  ) {}

  async list(): Promise<Notification[]> {
    const rows = await this.db.all<Record<string, unknown>>('SELECT * FROM notification ORDER BY name')
    return rows.map(this.mapNotification)
  }

  async get(id: string): Promise<Notification | undefined> {
    const row = await this.db.get<Record<string, unknown>>('SELECT * FROM notification WHERE id = ?', id)
    if (!row) return undefined
    return this.mapNotification(row)
  }

  async create(data: CreateNotification): Promise<Notification> {
    const id = uuidv4()
    const now = new Date().toISOString()
    await this.db.run(
      `INSERT INTO notification (id, name, method, config, ejs_template, cron_expression,
        alert_state_filter, min_priority, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, data.name, data.method, JSON.stringify(data.config),
      data.ejs_template, data.cron_expression,
      data.alert_state_filter, data.min_priority, data.enabled, now, now,
    )
    return (await this.get(id))!
  }

  async update(data: UpdateNotification): Promise<Notification> {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.method !== undefined) { fields.push('method = ?'); values.push(data.method) }
    if (data.config !== undefined) { fields.push('config = ?'); values.push(JSON.stringify(data.config)) }
    if (data.ejs_template !== undefined) { fields.push('ejs_template = ?'); values.push(data.ejs_template) }
    if (data.cron_expression !== undefined) { fields.push('cron_expression = ?'); values.push(data.cron_expression) }
    if (data.alert_state_filter !== undefined) { fields.push('alert_state_filter = ?'); values.push(data.alert_state_filter) }
    if (data.min_priority !== undefined) { fields.push('min_priority = ?'); values.push(data.min_priority) }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled) }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(data.id)
      await this.db.run(`UPDATE notification SET ${fields.join(', ')} WHERE id = ?`, ...values)
    }
    return (await this.get(data.id))!
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM notification_history WHERE notification_id = ?', id)
    await this.db.run('DELETE FROM notification WHERE id = ?', id)
  }

  async getHistory(notificationId: string, limit = 50, offset = 0): Promise<NotificationHistory[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      'SELECT * FROM notification_history WHERE notification_id = ? ORDER BY sent_at DESC LIMIT ? OFFSET ?',
      notificationId, limit, offset,
    )
    return rows.map(this.mapHistory)
  }

  async testSend(id: string): Promise<{ success: boolean; error?: string }> {
    const notification = await this.get(id)
    if (!notification) throw new Error(`Notification ${id} not found`)

    // Create a mock alert context for test
    const mockContext = {
      alert: { name: 'Test Alert', state: 'error', priority: 1, description: 'Test notification' },
      timestamp: new Date().toISOString(),
    }

    try {
      const rendered = await this.renderTemplate(notification.ejs_template, mockContext)
      await this.dispatch(notification, rendered, 'test-alert-id')
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { success: false, error }
    }
  }

  async dispatch(notification: Notification, renderedContent: string, alertId: string): Promise<void> {
    const historyId = uuidv4()
    try {
      switch (notification.method) {
        case 'smtp':
          await this.sendSmtp(notification.config as SmtpConfig, renderedContent)
          break
        case 'webhook':
          await this.sendWebhook(notification.config as WebhookConfig, renderedContent)
          break
        case 'desktop':
          await this.sendDesktop(renderedContent)
          break
      }
      await this.db.run(
        'INSERT INTO notification_history (id, notification_id, alert_id, status, sent_at) VALUES (?, ?, ?, ?, ?)',
        historyId, notification.id, alertId, 'sent', new Date().toISOString(),
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await this.db.run(
        'INSERT INTO notification_history (id, notification_id, alert_id, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
        historyId, notification.id, alertId, 'failed', errorMessage, new Date().toISOString(),
      )
      throw err
    }
  }

  async dispatchForAlerts(notificationId: string): Promise<void> {
    const notification = await this.get(notificationId)
    if (!notification || !notification.enabled) return

    const allAlerts = await this.alerts.list()
    const filtered = allAlerts.filter((a) => {
      if (a.acknowledged) return false
      if (!this.stateMatchesFilter(a.state, notification.alert_state_filter)) return false
      if (a.priority > notification.min_priority) return false
      return true
    })

    for (const alert of filtered) {
      const context = {
        alert,
        timestamp: new Date().toISOString(),
      }
      try {
        const rendered = await this.renderTemplate(notification.ejs_template, context)
        await this.dispatch(notification, rendered, alert.id)
      } catch {
        // Errors are recorded in history, continue with next alert
      }
    }
  }

  private stateMatchesFilter(state: AlertState, filter: AlertState): boolean {
    const severity: Record<AlertState, number> = { ok: 0, notice: 1, warning: 2, error: 3 }
    return severity[state] >= severity[filter]
  }

  private async renderTemplate(template: string, context: Record<string, unknown>): Promise<string> {
    // Simple template rendering using tagged template-like replacement
    // Support <%=  %> style EJS tags
    let result = template
    const flatContext = this.flattenObject(context)
    for (const [key, value] of Object.entries(flatContext)) {
      result = result.replace(new RegExp(`<%=\\s*${key.replace(/\./g, '\\.')}\\s*%>`, 'g'), String(value))
    }
    return result
  }

  private flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value as Record<string, unknown>, fullKey))
      } else {
        result[fullKey] = value
      }
    }
    return result
  }

  private async sendSmtp(config: SmtpConfig, content: string): Promise<void> {
    // Check for global SMTP config
    let smtpConfig = config
    if (config.use_global) {
      const globalSmtp = await this.settings.get('smtp_config')
      if (globalSmtp) {
        smtpConfig = { ...globalSmtp as SmtpConfig, to: config.to, from: config.from || (globalSmtp as SmtpConfig).from }
      }
    }

    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.auth,
    })

    await transporter.sendMail({
      from: smtpConfig.from,
      to: smtpConfig.to.join(', '),
      subject: content.split('\n')[0] || 'Dash Alert',
      html: content,
    })
  }

  private async sendWebhook(config: WebhookConfig, content: string): Promise<void> {
    const body = config.bodyTemplate
      ? config.bodyTemplate.replace('{{content}}', content)
      : JSON.stringify({ text: content })

    const response = await fetch(config.url, {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body,
    })

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`)
    }
  }

  private async sendDesktop(content: string): Promise<void> {
    const { Notification: ElectronNotification } = await import('electron')
    const notif = new ElectronNotification({
      title: 'Dash Alert',
      body: content.substring(0, 256),
    })
    notif.show()
  }

  private mapNotification(row: Record<string, unknown>): Notification {
    return {
      id: row.id as string,
      name: row.name as string,
      method: row.method as NotificationMethod,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config as SmtpConfig | WebhookConfig | DesktopConfig,
      ejs_template: row.ejs_template as string,
      cron_expression: row.cron_expression as string,
      alert_state_filter: row.alert_state_filter as AlertState,
      min_priority: row.min_priority as number,
      enabled: Boolean(row.enabled),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }
  }

  private mapHistory(row: Record<string, unknown>): NotificationHistory {
    return {
      id: row.id as string,
      notification_id: row.notification_id as string,
      alert_id: row.alert_id as string,
      status: row.status as 'sent' | 'failed',
      error_message: (row.error_message as string) || null,
      sent_at: String(row.sent_at),
    }
  }
}
