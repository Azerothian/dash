import { Injectable, Inject } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../database/database.service.js'
import type { Alert, AlertHistory, AlertRule, AlertSeverity, AlertState, ComparisonOperator, CreateAlert, UpdateAlert } from '@shared/entities'

const SEVERITY_ORDER: Record<AlertSeverity, number> = { notice: 1, warning: 2, error: 3 }

@Injectable()
export class AlertService {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async list(): Promise<Alert[]> {
    const rows = await this.db.all<Record<string, unknown>>('SELECT * FROM alert ORDER BY priority, name')
    return rows.map(this.mapRow)
  }

  async get(id: string): Promise<Alert | undefined> {
    const row = await this.db.get<Record<string, unknown>>('SELECT * FROM alert WHERE id = ?', id)
    if (!row) return undefined
    return this.mapRow(row)
  }

  async create(data: CreateAlert): Promise<Alert> {
    const id = uuidv4()
    const now = new Date().toISOString()
    await this.db.run(
      `INSERT INTO alert (id, name, description, rules, cron_expression,
        state, priority, acknowledged, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ok', ?, false, ?, ?, ?)`,
      id, data.name, data.description || '', JSON.stringify(data.rules || []),
      data.cron_expression, data.priority,
      data.enabled ?? true, now, now,
    )
    return (await this.get(id))!
  }

  async update(data: UpdateAlert): Promise<Alert> {
    const existing = await this.get(data.id)
    if (!existing) throw new Error(`Alert ${data.id} not found`)

    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.rules !== undefined) { fields.push('rules = ?'); values.push(JSON.stringify(data.rules)) }
    if (data.cron_expression !== undefined) { fields.push('cron_expression = ?'); values.push(data.cron_expression) }
    if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority) }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled) }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(data.id)
      await this.db.run(`UPDATE alert SET ${fields.join(', ')} WHERE id = ?`, ...values)
    }

    return (await this.get(data.id))!
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM alert_history WHERE alert_id = ?', id)
    await this.db.run('DELETE FROM panel_alert WHERE alert_id = ?', id)
    await this.db.run('DELETE FROM notification_history WHERE alert_id = ?', id)
    await this.db.run('DELETE FROM alert WHERE id = ?', id)
  }

  async acknowledge(id: string, message: string): Promise<Alert> {
    const now = new Date().toISOString()
    await this.db.run(
      'UPDATE alert SET acknowledged = true, ack_message = ?, ack_at = ?, updated_at = ? WHERE id = ?',
      message, now, now, id,
    )
    return (await this.get(id))!
  }

  async clearAck(id: string): Promise<Alert> {
    const now = new Date().toISOString()
    await this.db.run(
      'UPDATE alert SET acknowledged = false, ack_message = NULL, ack_at = NULL, updated_at = ? WHERE id = ?',
      now, id,
    )
    return (await this.get(id))!
  }

  async updateState(id: string, newState: AlertState, message?: string, evalResult?: Record<string, unknown>): Promise<Alert> {
    const alert = await this.get(id)
    if (!alert) throw new Error(`Alert ${id} not found`)

    if (alert.state !== newState) {
      const now = new Date().toISOString()
      await this.db.run('UPDATE alert SET state = ?, updated_at = ? WHERE id = ?', newState, now, id)
      await this.db.run(
        `INSERT INTO alert_history (id, alert_id, previous_state, new_state, message, evaluation_result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        uuidv4(), id, alert.state, newState, message || null,
        evalResult ? JSON.stringify(evalResult) : null, now,
      )
    }

    return (await this.get(id))!
  }

  async evaluate(id: string): Promise<{ state: AlertState; result: unknown }> {
    const alert = await this.get(id)
    if (!alert) throw new Error(`Alert ${id} not found`)

    if (!alert.rules || alert.rules.length === 0) {
      return { state: 'ok', result: { message: 'No rules defined' } }
    }

    let highestSeverity: AlertSeverity | null = null
    const ruleResults: Array<{ rule: AlertRule; value: number | null; triggered: boolean }> = []

    for (const rule of alert.rules) {
      try {
        const { sql, params } = this.buildRuleQuery(rule)
        const rows = await this.db.all<Record<string, unknown>>(sql, ...params)
        const row = rows[0]
        const value = row ? Number(row.result) : null

        const triggered = value !== null && !isNaN(value) && this.compareValue(value, rule.operator, rule.threshold)
        ruleResults.push({ rule, value, triggered })

        if (triggered) {
          if (!highestSeverity || SEVERITY_ORDER[rule.severity] > SEVERITY_ORDER[highestSeverity]) {
            highestSeverity = rule.severity
          }
        }
      } catch {
        ruleResults.push({ rule, value: null, triggered: false })
      }
    }

    const newState: AlertState = highestSeverity ?? 'ok'
    return { state: newState, result: ruleResults }
  }

  async getHistory(alertId: string, limit = 50, offset = 0): Promise<AlertHistory[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      'SELECT * FROM alert_history WHERE alert_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      alertId, limit, offset,
    )
    return rows.map((r) => ({
      id: r.id as string,
      alert_id: r.alert_id as string,
      previous_state: r.previous_state as AlertState,
      new_state: r.new_state as AlertState,
      message: r.message as string | null,
      evaluation_result: typeof r.evaluation_result === 'string' ? JSON.parse(r.evaluation_result) : r.evaluation_result as Record<string, unknown> | null,
      created_at: String(r.created_at),
    }))
  }

  private buildRuleQuery(rule: AlertRule): { sql: string; params: unknown[] } {
    // Sanitize column name to prevent injection
    const column = rule.column.replace(/[^a-zA-Z0-9_]/g, '')
    const minutes = Math.max(1, Math.floor(rule.time_window_minutes))
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString()

    if (rule.aggregation === 'last') {
      return {
        sql: `SELECT CAST(json_extract_string(data, '$.${column}') AS DOUBLE) AS result
          FROM sensor_data WHERE sensor_id = ? AND collected_at >= ?
          ORDER BY collected_at DESC LIMIT 1`,
        params: [rule.sensor_id, cutoff],
      }
    }

    return {
      sql: `SELECT ${rule.aggregation}(CAST(json_extract_string(data, '$.${column}') AS DOUBLE)) AS result
        FROM sensor_data WHERE sensor_id = ? AND collected_at >= ?`,
      params: [rule.sensor_id, cutoff],
    }
  }

  private compareValue(value: number, operator: ComparisonOperator, threshold: number): boolean {
    switch (operator) {
      case '>': return value > threshold
      case '>=': return value >= threshold
      case '<': return value < threshold
      case '<=': return value <= threshold
      case '==': return value === threshold
      case '!=': return value !== threshold
      default: return false
    }
  }

  private mapRow(row: Record<string, unknown>): Alert {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      rules: typeof row.rules === 'string' ? JSON.parse(row.rules) : (row.rules as AlertRule[]) || [],
      cron_expression: row.cron_expression as string,
      state: row.state as AlertState,
      priority: row.priority as number,
      acknowledged: Boolean(row.acknowledged),
      ack_message: (row.ack_message as string) || null,
      ack_at: row.ack_at ? String(row.ack_at) : null,
      enabled: Boolean(row.enabled),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }
  }
}
