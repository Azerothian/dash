import { Injectable } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../database/database.service.js'
import type { Alert, AlertHistory, AlertState, CreateAlert, UpdateAlert } from '@shared/entities'

@Injectable()
export class AlertService {
  constructor(private db: DatabaseService) {}

  async list(): Promise<Alert[]> {
    const rows = await this.db.all<Record<string, unknown>>('SELECT * FROM alert ORDER BY priority, name')
    const alerts = rows.map(this.mapRow)
    for (const alert of alerts) {
      alert.sensor_ids = await this.getSensorIds(alert.id)
    }
    return alerts
  }

  async get(id: string): Promise<Alert | undefined> {
    const row = await this.db.get<Record<string, unknown>>('SELECT * FROM alert WHERE id = ?', id)
    if (!row) return undefined
    const alert = this.mapRow(row)
    alert.sensor_ids = await this.getSensorIds(id)
    return alert
  }

  async create(data: CreateAlert): Promise<Alert> {
    const id = uuidv4()
    const now = new Date().toISOString()
    await this.db.run(
      `INSERT INTO alert (id, name, description, queries, evaluation_script, cron_expression,
        state, priority, acknowledged, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ok', ?, false, ?, ?, ?)`,
      id, data.name, data.description || '', JSON.stringify(data.queries),
      data.evaluation_script, data.cron_expression, data.priority,
      data.enabled ?? true, now, now,
    )
    if (data.sensor_ids?.length) {
      for (const sensorId of data.sensor_ids) {
        await this.db.run('INSERT INTO alert_sensor (alert_id, sensor_id) VALUES (?, ?)', id, sensorId)
      }
    }
    return (await this.get(id))!
  }

  async update(data: UpdateAlert): Promise<Alert> {
    const existing = await this.get(data.id)
    if (!existing) throw new Error(`Alert ${data.id} not found`)

    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.queries !== undefined) { fields.push('queries = ?'); values.push(JSON.stringify(data.queries)) }
    if (data.evaluation_script !== undefined) { fields.push('evaluation_script = ?'); values.push(data.evaluation_script) }
    if (data.cron_expression !== undefined) { fields.push('cron_expression = ?'); values.push(data.cron_expression) }
    if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority) }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled) }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(data.id)
      await this.db.run(`UPDATE alert SET ${fields.join(', ')} WHERE id = ?`, ...values)
    }

    if (data.sensor_ids !== undefined) {
      await this.db.run('DELETE FROM alert_sensor WHERE alert_id = ?', data.id)
      for (const sensorId of data.sensor_ids) {
        await this.db.run('INSERT INTO alert_sensor (alert_id, sensor_id) VALUES (?, ?)', data.id, sensorId)
      }
    }

    return (await this.get(data.id))!
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM alert_history WHERE alert_id = ?', id)
    await this.db.run('DELETE FROM alert_sensor WHERE alert_id = ?', id)
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
      // Update alert state
      await this.db.run('UPDATE alert SET state = ?, updated_at = ? WHERE id = ?', newState, now, id)
      // Insert history
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

    // Execute all queries
    const queryResults: unknown[] = []
    for (const query of alert.queries) {
      const rows = await this.db.all(query)
      queryResults.push(rows)
    }

    // Execute evaluation script
    const evalFn = new Function('results', `
      ${alert.evaluation_script}
      if (typeof evaluate === 'function') return evaluate(results);
      if (typeof module !== 'undefined' && module.exports) return module.exports(results);
      return 'ok';
    `)

    let newState: AlertState
    try {
      const result = evalFn(queryResults)
      newState = ['ok', 'notice', 'warning', 'error'].includes(result) ? result : 'ok'
    } catch {
      newState = 'error'
    }

    return { state: newState, result: queryResults }
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

  private async getSensorIds(alertId: string): Promise<string[]> {
    const rows = await this.db.all<{ sensor_id: string }>(
      'SELECT sensor_id FROM alert_sensor WHERE alert_id = ?', alertId,
    )
    return rows.map((r) => r.sensor_id)
  }

  private mapRow(row: Record<string, unknown>): Alert {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      queries: typeof row.queries === 'string' ? JSON.parse(row.queries) : row.queries as string[],
      evaluation_script: row.evaluation_script as string,
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
