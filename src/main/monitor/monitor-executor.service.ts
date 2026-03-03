import { Injectable, Inject } from '@nestjs/common'
import { safeStorage } from 'electron'
import { SensorService } from '../sensor/sensor.service.js'
import { MonitorService } from './monitor.service.js'
import type { Monitor, CloudflarePagesConfig, CloudflarePagesProjectConfig, ColumnDefinition, Sensor } from '@shared/entities'

const CLOUDFLARE_PAGES_COLUMNS: ColumnDefinition[] = [
  { name: 'project_name', type: 'VARCHAR' },
  { name: 'status', type: 'VARCHAR' },
  { name: 'stage_name', type: 'VARCHAR' },
  { name: 'environment', type: 'VARCHAR' },
  { name: 'deployment_url', type: 'VARCHAR' },
  { name: 'deployment_id', type: 'VARCHAR' },
  { name: 'created_on', type: 'VARCHAR' },
]

const CLOUDFLARE_FUNCTIONS_COLUMNS: ColumnDefinition[] = [
  { name: 'project_name', type: 'VARCHAR' },
  { name: 'datetime', type: 'VARCHAR' },
  { name: 'invocations', type: 'BIGINT' },
  { name: 'errors', type: 'BIGINT' },
  { name: 'subrequests', type: 'BIGINT' },
  { name: 'cpu_time_p50', type: 'DOUBLE' },
  { name: 'cpu_time_p99', type: 'DOUBLE' },
]

interface CfDeployment {
  id?: string
  url?: string
  environment?: string
  created_on?: string
  latest_stage?: { status?: string; name?: string }
  deployment_trigger?: { metadata?: { branch?: string } }
  stages?: Array<{ name?: string; status?: string; started_on?: string; ended_on?: string }>
}

interface CfGraphQLResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        workersInvocationsAdaptive?: Array<{
          sum?: { requests?: number; errors?: number; subrequests?: number }
          quantiles?: { cpuTimeP50?: number; cpuTimeP99?: number }
          dimensions?: { datetime?: string }
        }>
      }>
    }
  }
  errors?: Array<{ message?: string }>
}

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

  /** Sync sensors to match the monitor's project config (create/delete as needed) */
  async syncSensors(monitor: Monitor): Promise<void> {
    if (monitor.monitor_type !== 'cloudflare_pages') return

    const config = monitor.config as CloudflarePagesConfig
    const projectConfigs = config.projects || []

    const existingSensors = await this.sensors.listByMonitor(monitor.id)
    const { statusSensors, functionsSensors } = this.indexSensorsByTag(existingSensors)

    const activeProjects = new Set<string>()

    for (const projectConfig of projectConfigs) {
      activeProjects.add(projectConfig.name)
      const statusTags = this.generateTags(projectConfig.name, projectConfig.branches, false)
      const functionsTags = this.generateTags(projectConfig.name, projectConfig.branches, true)

      // Ensure status sensor exists
      const existingStatus = statusSensors.get(projectConfig.name)
      if (!existingStatus) {
        await this.sensors.create({
          name: `CF: ${projectConfig.name}`,
          description: `Cloudflare Pages project: ${projectConfig.name}`,
          execution_type: 'cfp_build',
          script_content: '',
          script_file_path: '',
          table_definition: CLOUDFLARE_PAGES_COLUMNS,
          retention_rules: { max_age_days: 30 },
          cron_expression: '',
          env_vars: {},
          tags: statusTags,
          enabled: true,
          monitor_id: monitor.id,
        })
      } else {
        await this.sensors.update({ id: existingStatus.id, tags: statusTags })
      }

      // Handle functions sensor
      const existingFunctions = functionsSensors.get(projectConfig.name)
      if (projectConfig.collect_metrics) {
        if (!existingFunctions) {
          await this.sensors.create({
            name: `CF Functions: ${projectConfig.name}`,
            description: `Cloudflare Pages Functions metrics: ${projectConfig.name}`,
            execution_type: 'cfp_func_metrics',
            script_content: '',
            script_file_path: '',
            table_definition: CLOUDFLARE_FUNCTIONS_COLUMNS,
            retention_rules: { max_age_days: 30 },
            cron_expression: '',
            env_vars: {},
            tags: functionsTags,
            enabled: true,
            monitor_id: monitor.id,
          })
        } else {
          await this.sensors.update({ id: existingFunctions.id, tags: functionsTags })
        }
      } else if (existingFunctions) {
        await this.sensors.delete(existingFunctions.id)
      }
    }

    // Delete sensors for projects no longer in config
    for (const [projectName, sensor] of statusSensors) {
      if (!activeProjects.has(projectName)) {
        await this.sensors.delete(sensor.id)
      }
    }
    for (const [projectName, sensor] of functionsSensors) {
      if (!activeProjects.has(projectName)) {
        await this.sensors.delete(sensor.id)
      }
    }
  }

  async testConnection(config: CloudflarePagesConfig): Promise<{ success: boolean; projects?: { name: string; production_branch: string }[]; error?: string }> {
    try {
      const apiToken = this.decryptToken(config.api_token)
      const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}`
      const headers = { Authorization: `Bearer ${apiToken}` }

      const res = await fetch(`${baseUrl}/pages/projects`, { headers })
      const data = await res.json() as { success: boolean; result?: { name: string; production_branch?: string }[]; errors?: { message: string }[] }

      if (!data.success) {
        const errMsg = data.errors?.map((e) => e.message).join(', ') || 'Unknown API error'
        return { success: false, error: errMsg }
      }

      const projects = (data.result || []).map((p) => ({
        name: p.name,
        production_branch: p.production_branch || 'main',
      }))
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

  /** Migrate legacy excluded_projects config to new projects array */
  private migrateConfig(config: CloudflarePagesConfig, allProjectNames: string[]): CloudflarePagesProjectConfig[] {
    if (config.projects && config.projects.length > 0) {
      return config.projects
    }
    // Derive from discovered projects minus excluded
    const excluded = new Set(config.excluded_projects || [])
    return allProjectNames
      .filter((name) => !excluded.has(name))
      .map((name) => ({ name, branches: [], collect_metrics: false }))
  }

  private generateTags(projectName: string, branches: string[], isFunctions: boolean): string[] {
    const tags = ['cloudflare', 'pages']
    if (isFunctions) tags.push('functions')
    tags.push(`project:${projectName}`)
    for (const branch of branches) {
      tags.push(`branch:${branch}`)
    }
    return tags
  }

  /** Index existing sensors by project tag into status and functions maps */
  private indexSensorsByTag(sensors: Sensor[]): {
    statusSensors: Map<string, Sensor>
    functionsSensors: Map<string, Sensor>
  } {
    const statusSensors = new Map<string, Sensor>()
    const functionsSensors = new Map<string, Sensor>()
    for (const s of sensors) {
      const projectTag = s.tags.find((t) => t.startsWith('project:'))
      if (!projectTag) continue
      const projectName = projectTag.slice(8) // 'project:'.length
      if (s.tags.includes('functions')) {
        functionsSensors.set(projectName, s)
      } else {
        statusSensors.set(projectName, s)
      }
    }
    return { statusSensors, functionsSensors }
  }

  private async executeCloudflarePages(monitor: Monitor): Promise<void> {
    const config = monitor.config as CloudflarePagesConfig
    const apiToken = this.decryptToken(config.api_token)
    const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}`
    const headers = { Authorization: `Bearer ${apiToken}` }

    // 1. Fetch all Pages projects
    const projectsRes = await fetch(`${baseUrl}/pages/projects`, { headers })
    const projectsData = await projectsRes.json() as { result?: { name: string }[] }
    const allProjectNames = (projectsData.result || []).map((p) => p.name)

    // 2. Migrate config if needed
    const projectConfigs = this.migrateConfig(config, allProjectNames)

    // 3. Get existing managed sensors and index by tag
    const existingSensors = await this.sensors.listByMonitor(monitor.id)
    const { statusSensors, functionsSensors } = this.indexSensorsByTag(existingSensors)

    // 4. Track which projects are still active
    const activeProjects = new Set<string>()

    // 5. For each configured project, ensure sensors exist and insert data
    for (const projectConfig of projectConfigs) {
      // Skip projects that don't exist on the account
      if (!allProjectNames.includes(projectConfig.name)) continue

      activeProjects.add(projectConfig.name)
      const statusTags = this.generateTags(projectConfig.name, projectConfig.branches, false)
      const functionsTags = this.generateTags(projectConfig.name, projectConfig.branches, true)

      // Ensure status sensor exists
      let statusSensor = statusSensors.get(projectConfig.name)
      if (!statusSensor) {
        statusSensor = await this.sensors.create({
          name: `CF: ${projectConfig.name}`,
          description: `Cloudflare Pages project: ${projectConfig.name}`,
          execution_type: 'cfp_build',
          script_content: '',
          script_file_path: '',
          table_definition: CLOUDFLARE_PAGES_COLUMNS,
          retention_rules: { max_age_days: 30 },
          cron_expression: '',
          env_vars: {},
          tags: statusTags,
          enabled: true,
          monitor_id: monitor.id,
        })
      } else {
        await this.sensors.update({ id: statusSensor.id, tags: statusTags })
      }

      // Handle functions sensor
      if (projectConfig.collect_metrics) {
        let functionsSensor = functionsSensors.get(projectConfig.name)
        if (!functionsSensor) {
          functionsSensor = await this.sensors.create({
            name: `CF Functions: ${projectConfig.name}`,
            description: `Cloudflare Pages Functions metrics: ${projectConfig.name}`,
            execution_type: 'cfp_func_metrics',
            script_content: '',
            script_file_path: '',
            table_definition: CLOUDFLARE_FUNCTIONS_COLUMNS,
            retention_rules: { max_age_days: 30 },
            cron_expression: '',
            env_vars: {},
            tags: functionsTags,
            enabled: true,
            monitor_id: monitor.id,
          })
        } else {
          await this.sensors.update({ id: functionsSensor.id, tags: functionsTags })
        }

        // Fetch Functions analytics via GraphQL
        const now = new Date()
        const since = new Date(now.getTime() - 5 * 60 * 1000) // last 5 minutes
        const functionsData = await this.fetchFunctionsMetrics(
          apiToken,
          config.account_id,
          projectConfig.name,
          since.toISOString(),
          now.toISOString(),
        )

        if (functionsData) {
          await this.sensors.insertData(functionsSensor.id, {
            project_name: projectConfig.name,
            datetime: functionsData.datetime || now.toISOString(),
            invocations: functionsData.invocations,
            errors: functionsData.errors,
            subrequests: functionsData.subrequests,
            cpu_time_p50: functionsData.cpuTimeP50,
            cpu_time_p99: functionsData.cpuTimeP99,
          })
        }
      }

      // Fetch deployments — use per_page=5 for branch filtering, 1 otherwise
      const perPage = projectConfig.branches.length > 0 ? 5 : 1
      const deploymentsRes = await fetch(
        `${baseUrl}/pages/projects/${projectConfig.name}/deployments?per_page=${perPage}`,
        { headers },
      )
      const deploymentsData = await deploymentsRes.json() as { result?: CfDeployment[] }
      const deployments = deploymentsData.result || []

      // Pick deployment: filter by branch if configured
      let latest: CfDeployment | undefined
      if (projectConfig.branches.length > 0) {
        latest = deployments.find((d) => {
          const branch = d.deployment_trigger?.metadata?.branch
          return branch && projectConfig.branches.includes(branch)
        })
      } else {
        latest = deployments[0]
      }

      if (latest) {
        // Insert status data
        await this.sensors.insertData(statusSensor.id, {
          project_name: projectConfig.name,
          status: latest.latest_stage?.status || 'unknown',
          stage_name: latest.latest_stage?.name || 'unknown',
          environment: latest.environment || 'production',
          deployment_url: latest.url || '',
          deployment_id: latest.id || '',
          created_on: latest.created_on || '',
        })
      }
    }

    // 6. Remove sensors for projects no longer configured
    for (const [projectName, sensor] of statusSensors) {
      if (!activeProjects.has(projectName)) {
        await this.sensors.delete(sensor.id)
      }
    }
    for (const [projectName, sensor] of functionsSensors) {
      if (!activeProjects.has(projectName)) {
        await this.sensors.delete(sensor.id)
      }
    }
  }

  private async fetchFunctionsMetrics(
    apiToken: string,
    accountId: string,
    projectName: string,
    since: string,
    until: string,
  ): Promise<{ invocations: number; errors: number; subrequests: number; cpuTimeP50: number; cpuTimeP99: number; datetime: string } | null> {
    try {
      const query = `{
        viewer {
          accounts(filter: { accountTag: "${accountId}" }) {
            workersInvocationsAdaptive(
              limit: 1,
              filter: {
                scriptName: "${projectName}",
                datetime_geq: "${since}",
                datetime_leq: "${until}"
              }
            ) {
              sum { requests errors subrequests }
              quantiles { cpuTimeP50 cpuTimeP99 }
              dimensions { datetime }
            }
          }
        }
      }`

      const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })

      const data = await res.json() as CfGraphQLResponse
      const records = data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive
      if (!records || records.length === 0) return null

      const record = records[0]
      return {
        invocations: record.sum?.requests ?? 0,
        errors: record.sum?.errors ?? 0,
        subrequests: record.sum?.subrequests ?? 0,
        cpuTimeP50: record.quantiles?.cpuTimeP50 ?? 0,
        cpuTimeP99: record.quantiles?.cpuTimeP99 ?? 0,
        datetime: record.dimensions?.datetime ?? until,
      }
    } catch {
      return null
    }
  }
}
