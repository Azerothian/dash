import { Injectable, Inject } from '@nestjs/common'
import { safeStorage } from 'electron'
import { SensorService } from '../sensor/sensor.service.js'
import { MonitorService } from './monitor.service.js'
import type { Monitor, CloudflarePagesConfig, ColumnDefinition } from '@shared/entities'

const CLOUDFLARE_PAGES_COLUMNS: ColumnDefinition[] = [
  { name: 'project_name', type: 'VARCHAR' },
  { name: 'status', type: 'VARCHAR' },
  { name: 'stage_name', type: 'VARCHAR' },
  { name: 'environment', type: 'VARCHAR' },
  { name: 'deployment_url', type: 'VARCHAR' },
  { name: 'deployment_id', type: 'VARCHAR' },
  { name: 'created_on', type: 'VARCHAR' },
]

@Injectable()
export class MonitorExecutorService {
  constructor(
    @Inject(SensorService) private sensors: SensorService,
    @Inject(MonitorService) private monitors: MonitorService,
  ) {}

  async execute(monitor: Monitor): Promise<void> {
    switch (monitor.monitor_type) {
      case 'cloudflare_pages':
        await this.executeCloudflarePages(monitor)
        break
    }
  }

  async testConnection(config: CloudflarePagesConfig): Promise<{ success: boolean; projects?: string[]; error?: string }> {
    try {
      const apiToken = this.decryptToken(config.api_token)
      const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}`
      const headers = { Authorization: `Bearer ${apiToken}` }

      const res = await fetch(`${baseUrl}/pages/projects`, { headers })
      const data = await res.json() as { success: boolean; result?: { name: string }[]; errors?: { message: string }[] }

      if (!data.success) {
        const errMsg = data.errors?.map((e) => e.message).join(', ') || 'Unknown API error'
        return { success: false, error: errMsg }
      }

      const projects = (data.result || []).map((p) => p.name)
      return { success: true, projects }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  encryptToken(plaintext: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      // Fallback: base64 encode (dev/test environments)
      return Buffer.from(plaintext).toString('base64')
    }
    const encrypted = safeStorage.encryptString(plaintext)
    return encrypted.toString('base64')
  }

  decryptToken(encrypted: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      // Fallback: base64 decode
      return Buffer.from(encrypted, 'base64').toString('utf-8')
    }
    const buffer = Buffer.from(encrypted, 'base64')
    return safeStorage.decryptString(buffer)
  }

  private async executeCloudflarePages(monitor: Monitor): Promise<void> {
    const config = monitor.config as CloudflarePagesConfig
    const apiToken = this.decryptToken(config.api_token)
    const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}`
    const headers = { Authorization: `Bearer ${apiToken}` }

    // 1. Fetch all Pages projects, filter out excluded
    const projectsRes = await fetch(`${baseUrl}/pages/projects`, { headers })
    const projectsData = await projectsRes.json() as { result?: { name: string }[] }
    const allProjects = projectsData.result || []
    const excluded = new Set(config.excluded_projects || [])
    const projects = allProjects.filter((p) => !excluded.has(p.name))

    // 2. Get existing managed sensors for this monitor
    const existingSensors = await this.sensors.listByMonitor(monitor.id)
    const existingByName = new Map(existingSensors.map((s) => [s.name, s]))

    // 3. For each project, ensure a managed sensor exists and insert latest data
    for (const project of projects) {
      const sensorName = `CF: ${project.name}`
      let sensor = existingByName.get(sensorName)

      if (!sensor) {
        sensor = await this.sensors.create({
          name: sensorName,
          description: `Cloudflare Pages project: ${project.name}`,
          execution_type: 'typescript',
          script_content: '',
          script_file_path: '',
          table_definition: CLOUDFLARE_PAGES_COLUMNS,
          retention_rules: { max_age_days: 30 },
          cron_expression: '',
          env_vars: {},
          enabled: true,
          monitor_id: monitor.id,
        })
      }

      // Fetch latest deployment for the project
      const deploymentsRes = await fetch(
        `${baseUrl}/pages/projects/${project.name}/deployments?per_page=1`,
        { headers },
      )
      const deploymentsData = await deploymentsRes.json() as { result?: Array<{
        id?: string
        url?: string
        environment?: string
        created_on?: string
        latest_stage?: { status?: string; name?: string }
      }> }
      const latest = deploymentsData.result?.[0]

      if (latest) {
        await this.sensors.insertData(sensor.id, {
          project_name: project.name,
          status: latest.latest_stage?.status || 'unknown',
          stage_name: latest.latest_stage?.name || 'unknown',
          environment: latest.environment || 'production',
          deployment_url: latest.url || '',
          deployment_id: latest.id || '',
          created_on: latest.created_on || '',
        })
      }
    }

    // 4. Remove managed sensors for projects that no longer exist
    const projectNames = new Set(projects.map((p) => `CF: ${p.name}`))
    for (const [name, sensor] of existingByName) {
      if (!projectNames.has(name)) {
        await this.sensors.delete(sensor.id)
      }
    }
  }
}
