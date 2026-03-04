import { Injectable, Inject } from '@nestjs/common'
import { safeStorage } from 'electron'
import { SensorService } from '../sensor/sensor.service.js'
import { MonitorService } from './monitor.service.js'
import { CredentialService } from '../credential/credential.service.js'
import type { Monitor, CloudflarePagesConfig, CloudflarePagesProjectConfig, ColumnDefinition, Sensor, Credential, CloudflareCredentialConfig } from '@shared/entities'

const CLOUDFLARE_PAGES_COLUMNS: ColumnDefinition[] = [
  { name: 'project_name', type: 'VARCHAR' },
  { name: 'branch', type: 'VARCHAR' },
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
    @Inject(CredentialService) private credentials: CredentialService,
  ) {}

  async resolveConfig(monitor: Monitor): Promise<CloudflarePagesConfig> {
    if (monitor.credential_id) {
      const cred = await this.credentials.get(monitor.credential_id)
      if (!cred) throw new Error(`Credential ${monitor.credential_id} not found`)
      const credConfig = cred.config as CloudflareCredentialConfig
      return {
        ...(monitor.config as CloudflarePagesConfig),
        api_token: credConfig.api_token,
        account_id: credConfig.account_id,
      }
    }
    return monitor.config as CloudflarePagesConfig
  }

  resolveEnvVars(credential: Credential): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [field, envName] of Object.entries(credential.env_var_map)) {
      if (field === 'api_token') {
        result[envName] = this.decryptToken((credential.config as Record<string, string>)[field])
      } else {
        result[envName] = String((credential.config as Record<string, string>)[field])
      }
    }
    return result
  }

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
      // Skip disabled projects — their sensors will be cleaned up below
      if (projectConfig.enabled === false) continue

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
        await this.sensors.update({ id: existingStatus.id, tags: statusTags, table_definition: CLOUDFLARE_PAGES_COLUMNS })
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

      const allResults: { name: string; production_branch?: string }[] = []
      let page = 1
      const perPage = 50

      while (true) {
        const res = await fetch(`${baseUrl}/pages/projects?page=${page}&per_page=${perPage}`, { headers })
        const data = await res.json() as { success: boolean; result?: { name: string; production_branch?: string }[]; errors?: { message: string }[]; result_info?: { page: number; total_pages: number } }

        if (!data.success) {
          const errMsg = data.errors?.map((e) => e.message).join(', ') || 'Unknown API error'
          return { success: false, error: errMsg }
        }

        allResults.push(...(data.result || []))

        const totalPages = data.result_info?.total_pages ?? 1
        if (page >= totalPages) break
        page++
      }

      const projects = allResults.map((p) => ({
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
      .map((name) => ({ name, branches: [], environments: ['production'], collect_metrics: false }))
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
    const config = await this.resolveConfig(monitor)
    const apiToken = this.decryptToken(config.api_token)
    const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}`
    const headers = { Authorization: `Bearer ${apiToken}` }

    // 1. Fetch all Pages projects (paginated)
    const allProjectNames: string[] = []
    let projPage = 1
    let fetchFailed = false
    while (true) {
      const projectsRes = await fetch(`${baseUrl}/pages/projects?page=${projPage}&per_page=50`, { headers })
      const projectsData = await projectsRes.json() as { success?: boolean; result?: { name: string }[]; result_info?: { page: number; total_pages: number } }
      if (projectsData.success === false || !projectsData.result) {
        fetchFailed = true
        break
      }
      allProjectNames.push(...projectsData.result.map((p) => p.name))
      const totalPages = projectsData.result_info?.total_pages ?? 1
      if (projPage >= totalPages) break
      projPage++
    }
    if (fetchFailed) {
      // Cannot verify remote state — skip execution to avoid deleting sensors
      return
    }

    // 2. Migrate config if needed
    const projectConfigs = this.migrateConfig(config, allProjectNames)

    // 3. Get existing managed sensors and index by tag
    const existingSensors = await this.sensors.listByMonitor(monitor.id)
    const { statusSensors, functionsSensors } = this.indexSensorsByTag(existingSensors)

    // 4. Track which projects are still active
    const activeProjects = new Set<string>()

    // 5. For each configured project, ensure sensors exist and insert data
    for (const projectConfig of projectConfigs) {
      // Skip disabled projects
      if (projectConfig.enabled === false) continue
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
        await this.sensors.update({ id: statusSensor.id, tags: statusTags, table_definition: CLOUDFLARE_PAGES_COLUMNS })
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

      // Resolve environments (default to ['production'] for backward compat)
      const environments = projectConfig.environments?.length > 0
        ? projectConfig.environments
        : ['production']

      // Fetch deployments — enough to cover branches × environments
      const perPage = Math.min(
        Math.max((projectConfig.branches.length || 1) * environments.length * 3, 5),
        20,
      )
      const deploymentsRes = await fetch(
        `${baseUrl}/pages/projects/${projectConfig.name}/deployments?per_page=${perPage}`,
        { headers },
      )
      const deploymentsData = await deploymentsRes.json() as { result?: CfDeployment[] }
      const deployments = deploymentsData.result || []

      // Filter by environment
      const envFiltered = deployments.filter((d) =>
        environments.includes(d.environment || 'production'),
      )

      if (projectConfig.branches.length > 0) {
        // Record latest deployment per branch
        const seenBranches = new Set<string>()
        for (const d of envFiltered) {
          const branch = d.deployment_trigger?.metadata?.branch
          if (!branch || !projectConfig.branches.includes(branch)) continue
          if (seenBranches.has(branch)) continue
          seenBranches.add(branch)
          await this.sensors.insertData(statusSensor.id, {
            project_name: projectConfig.name,
            branch,
            status: d.latest_stage?.status || 'unknown',
            stage_name: d.latest_stage?.name || 'unknown',
            environment: d.environment || 'production',
            deployment_url: d.url || '',
            deployment_id: d.id || '',
            created_on: d.created_on || '',
          })
        }
      } else {
        // No branch filter — record latest deployment per environment
        const seenEnvironments = new Set<string>()
        for (const d of envFiltered) {
          const env = d.environment || 'production'
          if (seenEnvironments.has(env)) continue
          seenEnvironments.add(env)
          await this.sensors.insertData(statusSensor.id, {
            project_name: projectConfig.name,
            branch: d.deployment_trigger?.metadata?.branch || '',
            status: d.latest_stage?.status || 'unknown',
            stage_name: d.latest_stage?.name || 'unknown',
            environment: env,
            deployment_url: d.url || '',
            deployment_id: d.id || '',
            created_on: d.created_on || '',
          })
        }
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
