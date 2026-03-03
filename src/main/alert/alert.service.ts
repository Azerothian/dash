import { Injectable, Inject } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../database/database.service.js'
import { SensorService } from '../sensor/sensor.service.js'
import type { Alert, AlertFilter, AlertHistory, AlertMutation, AlertMutationAggregation, AlertMutationExpression, AlertRule, AlertSeverity, AlertState, ComparisonOperator, CreateAlert, UpdateAlert, Sensor } from '@shared/entities'

const SEVERITY_ORDER: Record<AlertSeverity, number> = { notice: 1, warning: 2, error: 3 }
const NUMERIC_TYPES = ['INTEGER', 'BIGINT', 'DOUBLE', 'TIMESTAMP']

function isNumericType(colType: string): boolean {
  return NUMERIC_TYPES.includes(colType.toUpperCase())
}

function isBooleanType(colType: string): boolean {
  return colType.toUpperCase() === 'BOOLEAN'
}

@Injectable()
export class AlertService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(SensorService) private sensorService: SensorService,
  ) {}

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
        state, priority, acknowledged, enabled, mutations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ok', ?, false, ?, ?, ?, ?)`,
      id, data.name, data.description || '', JSON.stringify(data.rules || []),
      data.cron_expression, data.priority,
      data.enabled ?? true, JSON.stringify(data.mutations || []), now, now,
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
    if (data.mutations !== undefined) { fields.push('mutations = ?'); values.push(JSON.stringify(data.mutations)) }

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

    // Pre-fetch all sensors for column type lookups
    const allSensors = await this.sensorService.list()
    const sensorMap = new Map<string, Sensor>(allSensors.map((s) => [s.id, s]))

    // Evaluate mutations
    const mutationValues = new Map<string, number | string | boolean | null>()
    if (alert.mutations && alert.mutations.length > 0) {
      // Pass 1: aggregation mutations
      for (const mut of alert.mutations) {
        if (mut.type !== 'aggregation') continue
        try {
          let sensorIds: string[] = []
          if (mut.tag && !mut.sensor_id) {
            sensorIds = allSensors.filter((s) => s.tags.includes(mut.tag!)).map((s) => s.id)
          } else if (mut.sensor_id) {
            sensorIds = [mut.sensor_id]
          }
          let resultValue: number | string | boolean | null = null
          for (const sid of sensorIds) {
            const sensor = sensorMap.get(sid)
            const columnType = this.getColumnType(sensor, mut.column)
            const pseudoRule: AlertRule = {
              sensor_id: sid,
              column: mut.column,
              aggregation: mut.aggregation,
              time_window_minutes: mut.time_window_minutes,
              operator: '>',
              threshold: 0,
              severity: 'warning',
              filters: mut.filters,
            }
            const { sql, params } = this.buildRuleQuery(pseudoRule, sid, columnType)
            const rows = await this.db.all<Record<string, unknown>>(sql, ...params)
            const raw = rows[0]?.result
            const val = this.coerceValue(raw, columnType)
            if (val !== null) resultValue = val
          }
          mutationValues.set(mut.name, resultValue)
        } catch {
          mutationValues.set(mut.name, null)
        }
      }
      // Pass 2: expression mutations
      for (const mut of alert.mutations) {
        if (mut.type !== 'expression') continue
        try {
          const left = typeof mut.left_operand === 'number' ? mut.left_operand : Number(mutationValues.get(mut.left_operand) ?? NaN)
          const right = typeof mut.right_operand === 'number' ? mut.right_operand : Number(mutationValues.get(mut.right_operand) ?? NaN)
          if (isNaN(left) || isNaN(right)) {
            mutationValues.set(mut.name, null)
            continue
          }
          let result: number | null = null
          switch (mut.operator) {
            case '+': result = left + right; break
            case '-': result = left - right; break
            case '*': result = left * right; break
            case '/': result = right === 0 ? null : left / right; break
          }
          mutationValues.set(mut.name, result)
        } catch {
          mutationValues.set(mut.name, null)
        }
      }
    }

    let highestSeverity: AlertSeverity | null = null
    const ruleResults: Array<{ rule: AlertRule; value: number | string | boolean | null; triggered: boolean; sensor_id?: string }> = []

    for (const rule of alert.rules) {
      // Check if rule references a mutation
      if (rule.mutation_ref && mutationValues.has(rule.mutation_ref)) {
        const mutValue = mutationValues.get(rule.mutation_ref)!
        const triggered = mutValue !== null && this.compareValue(mutValue, rule.operator, rule.threshold)
        ruleResults.push({ rule, value: mutValue, triggered })
        if (triggered) {
          if (!highestSeverity || SEVERITY_ORDER[rule.severity] > SEVERITY_ORDER[highestSeverity]) {
            highestSeverity = rule.severity
          }
        }
        continue
      }

      try {
        // Determine which sensors to evaluate
        let sensorIds: string[] = []
        if (rule.tag && !rule.sensor_id) {
          const tagSensors = allSensors.filter((s) => s.tags.includes(rule.tag!))
          sensorIds = tagSensors.map((s) => s.id)
        } else if (rule.sensor_id) {
          sensorIds = [rule.sensor_id]
        }

        let anyTriggered = false
        for (const sensorId of sensorIds) {
          const sensor = sensorMap.get(sensorId)
          const columnType = this.getColumnType(sensor, rule.column)
          const { sql, params } = this.buildRuleQuery(rule, sensorId, columnType)
          const rows = await this.db.all<Record<string, unknown>>(sql, ...params)
          const row = rows[0]
          const rawValue = row?.result
          const value = this.coerceValue(rawValue, columnType)

          const triggered = value !== null && this.compareValue(value, rule.operator, rule.threshold)
          ruleResults.push({ rule, value, triggered, sensor_id: sensorId })

          if (triggered) anyTriggered = true
        }

        if (anyTriggered) {
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

  private getColumnType(sensor: Sensor | undefined, column: string): string | undefined {
    if (!sensor || !column) return undefined
    const col = sensor.table_definition?.find((c) => c.name === column)
    return col?.type
  }

  private buildRuleQuery(rule: AlertRule, sensorId: string, columnType?: string): { sql: string; params: unknown[] } {
    const column = rule.column.replace(/[^a-zA-Z0-9_]/g, '')
    const minutes = Math.max(1, Math.floor(rule.time_window_minutes))
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString()

    let filterSql = ''
    const filterParams: unknown[] = []
    for (const filter of rule.filters || []) {
      const filterCol = filter.column.replace(/[^a-zA-Z0-9_]/g, '')
      const sqlOp = filter.operator === '==' ? '=' : filter.operator
      if (typeof filter.value === 'number') {
        filterSql += ` AND CAST(json_extract_string(data, '$.${filterCol}') AS DOUBLE) ${sqlOp} ?`
      } else {
        filterSql += ` AND json_extract_string(data, '$.${filterCol}') ${sqlOp} ?`
      }
      filterParams.push(filter.value)
    }

    const isNonNumeric = columnType && !isNumericType(columnType)

    // For non-numeric types with aggregations other than last/count, fall back to last
    const effectiveAgg = isNonNumeric && rule.aggregation !== 'last' && rule.aggregation !== 'count'
      ? 'last'
      : rule.aggregation

    if (effectiveAgg === 'last') {
      if (isNonNumeric) {
        // Don't CAST for VARCHAR/BOOLEAN
        return {
          sql: `SELECT json_extract_string(data, '$.${column}') AS result
            FROM sensor_data WHERE sensor_id = ? AND collected_at >= ?${filterSql}
            ORDER BY collected_at DESC LIMIT 1`,
          params: [sensorId, cutoff, ...filterParams],
        }
      }
      return {
        sql: `SELECT CAST(json_extract_string(data, '$.${column}') AS DOUBLE) AS result
          FROM sensor_data WHERE sensor_id = ? AND collected_at >= ?${filterSql}
          ORDER BY collected_at DESC LIMIT 1`,
        params: [sensorId, cutoff, ...filterParams],
      }
    }

    if (effectiveAgg === 'count') {
      return {
        sql: `SELECT count(json_extract_string(data, '$.${column}')) AS result
          FROM sensor_data WHERE sensor_id = ? AND collected_at >= ?${filterSql}`,
        params: [sensorId, cutoff, ...filterParams],
      }
    }

    return {
      sql: `SELECT ${effectiveAgg}(CAST(json_extract_string(data, '$.${column}') AS DOUBLE)) AS result
        FROM sensor_data WHERE sensor_id = ? AND collected_at >= ?${filterSql}`,
      params: [sensorId, cutoff, ...filterParams],
    }
  }

  private coerceValue(raw: unknown, columnType?: string): number | string | boolean | null {
    if (raw === null || raw === undefined) return null

    if (columnType && isBooleanType(columnType)) {
      if (typeof raw === 'boolean') return raw
      if (typeof raw === 'string') return raw.toLowerCase() === 'true'
      return Boolean(raw)
    }

    if (columnType && !isNumericType(columnType)) {
      return String(raw)
    }

    const num = Number(raw)
    return isNaN(num) ? null : num
  }

  private compareValue(value: number | string | boolean, operator: ComparisonOperator, threshold: number | string | boolean): boolean {
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
      mutations: typeof row.mutations === 'string' ? JSON.parse(row.mutations) : (row.mutations as AlertMutation[]) || [],
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
