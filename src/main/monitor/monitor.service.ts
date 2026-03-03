import { Injectable, Inject } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../database/database.service.js'
import { SensorService } from '../sensor/sensor.service.js'
import type { Monitor, CreateMonitor, UpdateMonitor } from '@shared/entities'

@Injectable()
export class MonitorService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(SensorService) private sensors: SensorService,
  ) {}

  async list(): Promise<Monitor[]> {
    const rows = await this.db.all<Record<string, unknown>>('SELECT * FROM monitor ORDER BY name')
    return rows.map(this.mapRow)
  }

  async get(id: string): Promise<Monitor | undefined> {
    const row = await this.db.get<Record<string, unknown>>(
      'SELECT * FROM monitor WHERE id = ?',
      id,
    )
    return row ? this.mapRow(row) : undefined
  }

  async create(data: CreateMonitor): Promise<Monitor> {
    const id = uuidv4()
    const now = new Date().toISOString()
    await this.db.run(
      `INSERT INTO monitor (id, name, description, monitor_type, config, cron_expression, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.name,
      data.description || '',
      data.monitor_type,
      JSON.stringify(data.config),
      data.cron_expression,
      data.enabled ?? true,
      now,
      now,
    )
    return (await this.get(id))!
  }

  async update(data: UpdateMonitor): Promise<Monitor> {
    const existing = await this.get(data.id)
    if (!existing) throw new Error(`Monitor ${data.id} not found`)

    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.monitor_type !== undefined) { fields.push('monitor_type = ?'); values.push(data.monitor_type) }
    if (data.config !== undefined) { fields.push('config = ?'); values.push(JSON.stringify(data.config)) }
    if (data.cron_expression !== undefined) { fields.push('cron_expression = ?'); values.push(data.cron_expression) }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled) }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(data.id)
      await this.db.run(`UPDATE monitor SET ${fields.join(', ')} WHERE id = ?`, ...values)
    }

    return (await this.get(data.id))!
  }

  async delete(id: string): Promise<void> {
    // Delete all managed sensors and their data
    const managedSensors = await this.sensors.listByMonitor(id)
    for (const sensor of managedSensors) {
      await this.sensors.delete(sensor.id)
    }
    await this.db.run('DELETE FROM monitor WHERE id = ?', id)
  }

  private mapRow(row: Record<string, unknown>): Monitor {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      monitor_type: row.monitor_type as Monitor['monitor_type'],
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config as Monitor['config'],
      cron_expression: row.cron_expression as string,
      enabled: Boolean(row.enabled),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }
  }
}
