import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import duckdb from 'duckdb'
import { app } from 'electron'
import { join } from 'path'

// Handle CJS/ESM interop: duckdb may expose Database on default or as namespace
const DuckDB = (duckdb as unknown as { default?: typeof duckdb }).default ?? duckdb

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: InstanceType<typeof DuckDB.Database>
  private connection!: InstanceType<typeof DuckDB.Connection>

  async onModuleInit() {
    const dbPath = process.env['DASH_TEST_DB_PATH']
      ?? join(app.getPath('userData'), 'dash.duckdb')
    this.db = new DuckDB.Database(dbPath)
    this.connection = new DuckDB.Connection(this.db)
    await this.initSchema()
  }

  async onModuleDestroy() {
    this.connection.close()
    this.db.close()
  }

  run(sql: string, ...params: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.run(sql, ...params, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.connection.all(sql, ...params, (err: Error | null, rows: T[]) => {
        if (err) reject(err)
        else resolve(rows ?? [])
      })
    })
  }

  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.connection.all(sql, ...params, (err: Error | null, rows: T[]) => {
        if (err) reject(err)
        else resolve(rows?.[0])
      })
    })
  }

  private async initSchema(): Promise<void> {
    // Sensors
    await this.run(`
      CREATE TABLE IF NOT EXISTS sensor (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        description VARCHAR DEFAULT '',
        execution_type VARCHAR NOT NULL,
        script_content TEXT NOT NULL,
        json_selector VARCHAR DEFAULT '$',
        table_definition JSON NOT NULL,
        retention_rules JSON DEFAULT '{}',
        cron_expression VARCHAR NOT NULL,
        env_vars JSON DEFAULT '{}',
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT current_timestamp,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `)

    // Sensor data
    await this.run(`
      CREATE TABLE IF NOT EXISTS sensor_data (
        id VARCHAR PRIMARY KEY,
        sensor_id VARCHAR NOT NULL,
        data JSON NOT NULL,
        collected_at TIMESTAMP DEFAULT current_timestamp
      )
    `)

    // Alerts
    await this.run(`
      CREATE TABLE IF NOT EXISTS alert (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        description VARCHAR DEFAULT '',
        queries JSON NOT NULL,
        evaluation_script TEXT NOT NULL,
        cron_expression VARCHAR NOT NULL,
        state VARCHAR DEFAULT 'ok',
        priority INTEGER NOT NULL,
        acknowledged BOOLEAN DEFAULT false,
        ack_message TEXT,
        ack_at TIMESTAMP,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT current_timestamp,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `)

    // Alert-sensor associations
    await this.run(`
      CREATE TABLE IF NOT EXISTS alert_sensor (
        alert_id VARCHAR NOT NULL,
        sensor_id VARCHAR NOT NULL,
        PRIMARY KEY (alert_id, sensor_id)
      )
    `)

    // Alert history
    await this.run(`
      CREATE TABLE IF NOT EXISTS alert_history (
        id VARCHAR PRIMARY KEY,
        alert_id VARCHAR NOT NULL,
        previous_state VARCHAR NOT NULL,
        new_state VARCHAR NOT NULL,
        message TEXT,
        evaluation_result JSON,
        created_at TIMESTAMP DEFAULT current_timestamp
      )
    `)

    // Notifications
    await this.run(`
      CREATE TABLE IF NOT EXISTS notification (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        method VARCHAR NOT NULL,
        config JSON NOT NULL,
        ejs_template TEXT NOT NULL,
        cron_expression VARCHAR NOT NULL,
        alert_state_filter VARCHAR DEFAULT 'error',
        min_priority INTEGER DEFAULT 1,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT current_timestamp,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `)

    // Notification history
    await this.run(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id VARCHAR PRIMARY KEY,
        notification_id VARCHAR NOT NULL,
        alert_id VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        error_message TEXT,
        sent_at TIMESTAMP DEFAULT current_timestamp
      )
    `)

    // Dashboards
    await this.run(`
      CREATE TABLE IF NOT EXISTS dashboard (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        is_primary BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT current_timestamp,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `)

    // Panels
    await this.run(`
      CREATE TABLE IF NOT EXISTS panel (
        id VARCHAR PRIMARY KEY,
        dashboard_id VARCHAR NOT NULL,
        type VARCHAR NOT NULL,
        graph_type VARCHAR,
        custom_component TEXT,
        gridstack_config JSON NOT NULL DEFAULT '{"x":0,"y":0,"w":4,"h":3}',
        panel_config JSON DEFAULT '{}',
        created_at TIMESTAMP DEFAULT current_timestamp,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `)

    // Panel-sensor associations
    await this.run(`
      CREATE TABLE IF NOT EXISTS panel_sensor (
        panel_id VARCHAR NOT NULL,
        sensor_id VARCHAR NOT NULL,
        PRIMARY KEY (panel_id, sensor_id)
      )
    `)

    // Panel-alert associations
    await this.run(`
      CREATE TABLE IF NOT EXISTS panel_alert (
        panel_id VARCHAR NOT NULL,
        alert_id VARCHAR NOT NULL,
        PRIMARY KEY (panel_id, alert_id)
      )
    `)

    // Settings
    await this.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR PRIMARY KEY,
        value JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT current_timestamp
      )
    `)
  }
}
