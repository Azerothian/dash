import { Injectable, Inject } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../database/database.service.js'
import type { Sensor, SensorData, CreateSensor, UpdateSensor, AggregationFunction } from '@shared/entities'

@Injectable()
export class SensorService {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async list(): Promise<Sensor[]> {
    const rows = await this.db.all<Record<string, unknown>>('SELECT * FROM sensor ORDER BY name')
    return rows.map(this.mapRow)
  }

  async get(id: string): Promise<Sensor | undefined> {
    const row = await this.db.get<Record<string, unknown>>(
      'SELECT * FROM sensor WHERE id = ?',
      id,
    )
    return row ? this.mapRow(row) : undefined
  }

  async create(data: CreateSensor): Promise<Sensor> {
    const id = uuidv4()
    const now = new Date().toISOString()
    await this.db.run(
      `INSERT INTO sensor (id, name, description, execution_type, script_content,
        script_file_path, json_selector, table_definition, retention_rules, cron_expression,
        env_vars, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.name,
      data.description || '',
      data.execution_type,
      data.script_content,
      data.script_file_path || '',
      '$',
      JSON.stringify(data.table_definition),
      JSON.stringify(data.retention_rules || {}),
      data.cron_expression,
      JSON.stringify(data.env_vars || {}),
      data.enabled ?? true,
      now,
      now,
    )
    return (await this.get(id))!
  }

  async update(data: UpdateSensor): Promise<Sensor> {
    const existing = await this.get(data.id)
    if (!existing) throw new Error(`Sensor ${data.id} not found`)

    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.execution_type !== undefined) { fields.push('execution_type = ?'); values.push(data.execution_type) }
    if (data.script_content !== undefined) { fields.push('script_content = ?'); values.push(data.script_content) }
    if (data.script_file_path !== undefined) { fields.push('script_file_path = ?'); values.push(data.script_file_path) }
    if (data.table_definition !== undefined) { fields.push('table_definition = ?'); values.push(JSON.stringify(data.table_definition)) }
    if (data.retention_rules !== undefined) { fields.push('retention_rules = ?'); values.push(JSON.stringify(data.retention_rules)) }
    if (data.cron_expression !== undefined) { fields.push('cron_expression = ?'); values.push(data.cron_expression) }
    if (data.env_vars !== undefined) { fields.push('env_vars = ?'); values.push(JSON.stringify(data.env_vars)) }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled) }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(data.id)
      await this.db.run(`UPDATE sensor SET ${fields.join(', ')} WHERE id = ?`, ...values)
    }

    return (await this.get(data.id))!
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM sensor_data WHERE sensor_id = ?', id)
    await this.db.run('DELETE FROM panel_sensor WHERE sensor_id = ?', id)
    await this.db.run('DELETE FROM sensor WHERE id = ?', id)
  }

  async insertData(sensorId: string, data: Record<string, unknown>): Promise<SensorData> {
    const id = uuidv4()
    const now = new Date().toISOString()
    await this.db.run(
      'INSERT INTO sensor_data (id, sensor_id, data, collected_at) VALUES (?, ?, ?, ?)',
      id,
      sensorId,
      JSON.stringify(data),
      now,
    )
    return { id, sensor_id: sensorId, data, collected_at: now }
  }

  async getData(sensorId: string, limit = 100): Promise<SensorData[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      'SELECT * FROM sensor_data WHERE sensor_id = ? ORDER BY collected_at DESC LIMIT ?',
      sensorId,
      limit,
    )
    return rows.map((r) => ({
      id: r.id as string,
      sensor_id: r.sensor_id as string,
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data as Record<string, unknown>,
      collected_at: String(r.collected_at),
    }))
  }

  async applyRetention(sensorId: string, rules: { max_age_days?: number; max_rows?: number }): Promise<void> {
    if (rules.max_age_days) {
      await this.db.run(
        `DELETE FROM sensor_data WHERE sensor_id = ? AND collected_at < current_timestamp - INTERVAL '${rules.max_age_days} days'`,
        sensorId,
      )
    }
    if (rules.max_rows) {
      await this.db.run(
        `DELETE FROM sensor_data WHERE sensor_id = ? AND id NOT IN (
          SELECT id FROM sensor_data WHERE sensor_id = ? ORDER BY collected_at DESC LIMIT ?
        )`,
        sensorId,
        sensorId,
        rules.max_rows,
      )
    }
  }

  async getAggregatedData(
    sensorId: string, column: string, aggregation: AggregationFunction, timeWindowMinutes: number
  ): Promise<{ result: number | null }> {
    const col = column.replace(/[^a-zA-Z0-9_]/g, '')
    const minutes = Math.max(1, Math.floor(timeWindowMinutes))
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString()

    let sql: string
    if (aggregation === 'last') {
      sql = `SELECT CAST(json_extract_string(data, '$.${col}') AS DOUBLE) AS result
        FROM sensor_data WHERE sensor_id = ? AND collected_at >= ?
        ORDER BY collected_at DESC LIMIT 1`
    } else {
      sql = `SELECT ${aggregation}(CAST(json_extract_string(data, '$.${col}') AS DOUBLE)) AS result
        FROM sensor_data WHERE sensor_id = ? AND collected_at >= ?`
    }

    const row = await this.db.get<{ result: number | null }>(sql, sensorId, cutoff)
    return { result: row?.result ?? null }
  }

  private mapRow(row: Record<string, unknown>): Sensor {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      execution_type: row.execution_type as Sensor['execution_type'],
      script_content: row.script_content as string,
      script_file_path: (row.script_file_path as string) || '',
      table_definition: typeof row.table_definition === 'string' ? JSON.parse(row.table_definition) : row.table_definition as Sensor['table_definition'],
      retention_rules: typeof row.retention_rules === 'string' ? JSON.parse(row.retention_rules) : (row.retention_rules as Sensor['retention_rules']) || {},
      cron_expression: row.cron_expression as string,
      env_vars: typeof row.env_vars === 'string' ? JSON.parse(row.env_vars) : (row.env_vars as Record<string, string>) || {},
      enabled: Boolean(row.enabled),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }
  }
}
