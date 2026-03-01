import { Injectable } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../database/database.service.js'
import type {
  Dashboard, Panel, CreateDashboard, UpdateDashboard,
  CreatePanel, UpdatePanel, GridstackConfig, PanelType, GraphType,
} from '@shared/entities'

@Injectable()
export class DashboardService {
  constructor(private db: DatabaseService) {}

  async list(): Promise<Dashboard[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      'SELECT * FROM dashboard ORDER BY sort_order',
    )
    return rows.map(this.mapDashboard)
  }

  async get(id: string): Promise<Dashboard | undefined> {
    const row = await this.db.get<Record<string, unknown>>(
      'SELECT * FROM dashboard WHERE id = ?', id,
    )
    if (!row) return undefined
    const dashboard = this.mapDashboard(row)
    dashboard.panels = await this.getPanels(id)
    return dashboard
  }

  async getPrimary(): Promise<Dashboard | undefined> {
    const row = await this.db.get<Record<string, unknown>>(
      'SELECT * FROM dashboard WHERE is_primary = true LIMIT 1',
    )
    if (!row) {
      // Fallback to first dashboard
      const first = await this.db.get<Record<string, unknown>>(
        'SELECT * FROM dashboard ORDER BY sort_order LIMIT 1',
      )
      if (!first) return undefined
      const dashboard = this.mapDashboard(first)
      dashboard.panels = await this.getPanels(dashboard.id)
      return dashboard
    }
    const dashboard = this.mapDashboard(row)
    dashboard.panels = await this.getPanels(dashboard.id)
    return dashboard
  }

  async create(data: CreateDashboard): Promise<Dashboard> {
    const id = uuidv4()
    const now = new Date().toISOString()
    const maxOrder = await this.db.get<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) as m FROM dashboard')
    const sortOrder = (maxOrder?.m ?? 0) + 1

    if (data.is_primary) {
      await this.db.run('UPDATE dashboard SET is_primary = false')
    }

    await this.db.run(
      `INSERT INTO dashboard (id, name, is_primary, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, data.name, data.is_primary || false, sortOrder, now, now,
    )
    return (await this.get(id))!
  }

  async update(data: UpdateDashboard): Promise<Dashboard> {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.is_primary !== undefined) {
      if (data.is_primary) {
        await this.db.run('UPDATE dashboard SET is_primary = false')
      }
      fields.push('is_primary = ?'); values.push(data.is_primary)
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(data.id)
      await this.db.run(`UPDATE dashboard SET ${fields.join(', ')} WHERE id = ?`, ...values)
    }
    return (await this.get(data.id))!
  }

  async delete(id: string): Promise<void> {
    const dashboard = await this.get(id)
    // Delete panels and their associations
    const panels = await this.getPanels(id)
    for (const panel of panels) {
      await this.deletePanel(panel.id)
    }
    await this.db.run('DELETE FROM dashboard WHERE id = ?', id)
    // If was primary, assign next
    if (dashboard?.is_primary) {
      const next = await this.db.get<{ id: string }>('SELECT id FROM dashboard ORDER BY sort_order LIMIT 1')
      if (next) {
        await this.db.run('UPDATE dashboard SET is_primary = true WHERE id = ?', next.id)
      }
    }
  }

  async setPrimary(id: string): Promise<Dashboard> {
    await this.db.run('UPDATE dashboard SET is_primary = false')
    await this.db.run('UPDATE dashboard SET is_primary = true, updated_at = ? WHERE id = ?',
      new Date().toISOString(), id)
    return (await this.get(id))!
  }

  async reorder(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      await this.db.run('UPDATE dashboard SET sort_order = ? WHERE id = ?', i, ids[i])
    }
  }

  // Panel operations
  async createPanel(data: CreatePanel): Promise<Panel> {
    const id = uuidv4()
    const now = new Date().toISOString()
    await this.db.run(
      `INSERT INTO panel (id, dashboard_id, type, graph_type, custom_component,
        gridstack_config, panel_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, data.dashboard_id, data.type, data.graph_type || null,
      data.custom_component || null, JSON.stringify(data.gridstack_config),
      JSON.stringify(data.panel_config || {}), now, now,
    )
    if (data.sensor_ids?.length) {
      for (const sid of data.sensor_ids) {
        await this.db.run('INSERT INTO panel_sensor (panel_id, sensor_id) VALUES (?, ?)', id, sid)
      }
    }
    if (data.alert_ids?.length) {
      for (const aid of data.alert_ids) {
        await this.db.run('INSERT INTO panel_alert (panel_id, alert_id) VALUES (?, ?)', id, aid)
      }
    }
    return (await this.getPanel(id))!
  }

  async updatePanel(data: UpdatePanel): Promise<Panel> {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type) }
    if (data.graph_type !== undefined) { fields.push('graph_type = ?'); values.push(data.graph_type) }
    if (data.custom_component !== undefined) { fields.push('custom_component = ?'); values.push(data.custom_component) }
    if (data.gridstack_config !== undefined) { fields.push('gridstack_config = ?'); values.push(JSON.stringify(data.gridstack_config)) }
    if (data.panel_config !== undefined) { fields.push('panel_config = ?'); values.push(JSON.stringify(data.panel_config)) }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(data.id)
      await this.db.run(`UPDATE panel SET ${fields.join(', ')} WHERE id = ?`, ...values)
    }

    if (data.sensor_ids !== undefined) {
      await this.db.run('DELETE FROM panel_sensor WHERE panel_id = ?', data.id)
      for (const sid of data.sensor_ids) {
        await this.db.run('INSERT INTO panel_sensor (panel_id, sensor_id) VALUES (?, ?)', data.id, sid)
      }
    }
    if (data.alert_ids !== undefined) {
      await this.db.run('DELETE FROM panel_alert WHERE panel_id = ?', data.id)
      for (const aid of data.alert_ids) {
        await this.db.run('INSERT INTO panel_alert (panel_id, alert_id) VALUES (?, ?)', data.id, aid)
      }
    }
    return (await this.getPanel(data.id))!
  }

  async deletePanel(id: string): Promise<void> {
    await this.db.run('DELETE FROM panel_sensor WHERE panel_id = ?', id)
    await this.db.run('DELETE FROM panel_alert WHERE panel_id = ?', id)
    await this.db.run('DELETE FROM panel WHERE id = ?', id)
  }

  async batchUpdatePanels(updates: { id: string; gridstack_config: GridstackConfig }[]): Promise<void> {
    const now = new Date().toISOString()
    for (const u of updates) {
      await this.db.run(
        'UPDATE panel SET gridstack_config = ?, updated_at = ? WHERE id = ?',
        JSON.stringify(u.gridstack_config), now, u.id,
      )
    }
  }

  private async getPanel(id: string): Promise<Panel | undefined> {
    const row = await this.db.get<Record<string, unknown>>('SELECT * FROM panel WHERE id = ?', id)
    if (!row) return undefined
    return this.mapPanel(row)
  }

  private async getPanels(dashboardId: string): Promise<Panel[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      'SELECT * FROM panel WHERE dashboard_id = ?', dashboardId,
    )
    return Promise.all(rows.map((r) => this.mapPanel(r)))
  }

  private async mapPanel(row: Record<string, unknown>): Promise<Panel> {
    const id = row.id as string
    const sensorRows = await this.db.all<{ sensor_id: string }>(
      'SELECT sensor_id FROM panel_sensor WHERE panel_id = ?', id,
    )
    const alertRows = await this.db.all<{ alert_id: string }>(
      'SELECT alert_id FROM panel_alert WHERE panel_id = ?', id,
    )
    return {
      id,
      dashboard_id: row.dashboard_id as string,
      type: row.type as PanelType,
      graph_type: (row.graph_type as GraphType) || null,
      custom_component: (row.custom_component as string) || null,
      gridstack_config: typeof row.gridstack_config === 'string'
        ? JSON.parse(row.gridstack_config) : row.gridstack_config as GridstackConfig,
      panel_config: typeof row.panel_config === 'string'
        ? JSON.parse(row.panel_config) : (row.panel_config as Record<string, unknown>) || {},
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      sensor_ids: sensorRows.map((r) => r.sensor_id),
      alert_ids: alertRows.map((r) => r.alert_id),
    }
  }

  private mapDashboard(row: Record<string, unknown>): Dashboard {
    return {
      id: row.id as string,
      name: row.name as string,
      is_primary: Boolean(row.is_primary),
      sort_order: row.sort_order as number,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }
  }
}
