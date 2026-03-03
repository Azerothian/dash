import { Injectable, Inject } from '@nestjs/common'
import { exec } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'
import { JSONPath } from 'jsonpath-plus'
import type { ExecutionType, ColumnDefinition } from '@shared/entities'
import { SettingsService } from '../settings/settings.service.js'

export interface ExecutionResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  duration: number
}

@Injectable()
export class ExecutorService {
  constructor(@Inject(SettingsService) private settings: SettingsService) {}

  async execute(
    type: ExecutionType,
    script: string,
    columns: ColumnDefinition[],
    envVars: Record<string, string>,
    scriptSource: 'inline' | 'file' = 'inline',
    scriptFilePath?: string,
  ): Promise<ExecutionResult> {
    const start = Date.now()
    try {
      // Merge global env vars (sensor-specific wins on conflict)
      const globalVars = await this.settings.get('global_env_vars')
      const mergedEnv = { ...globalVars, ...envVars }

      let rawOutput: string
      if (scriptSource === 'file' && scriptFilePath) {
        rawOutput = await this.executeFile(type, scriptFilePath, mergedEnv)
      } else {
        switch (type) {
          case 'typescript':
            rawOutput = await this.executeTypeScript(script, mergedEnv)
            break
          case 'bash':
            rawOutput = await this.executeBash(script, mergedEnv)
            break
          case 'docker':
            rawOutput = await this.executeDocker(script, mergedEnv)
            break
          case 'powershell':
            rawOutput = await this.executePowerShell(script, mergedEnv)
            break
          default:
            throw new Error(`Unsupported execution type: ${type}`)
        }
      }

      const parsed = JSON.parse(rawOutput.trim())

      // Extract per-column values using each column's json_selector
      const data: Record<string, unknown> = {}
      for (const col of columns) {
        if (col.json_selector) {
          data[col.name] = JSONPath({ path: col.json_selector, json: parsed, wrap: false })
        } else {
          // Fallback: use column name as key into parsed object
          data[col.name] = typeof parsed === 'object' && parsed !== null ? parsed[col.name] : undefined
        }
      }

      // Fail if no column collected a value
      const hasValue = Object.values(data).some((v) => v !== undefined && v !== null)
      if (columns.length > 0 && !hasValue) {
        return {
          success: false,
          error: 'No values collected: all column selectors resolved to null/undefined',
          duration: Date.now() - start,
        }
      }

      return {
        success: true,
        data,
        duration: Date.now() - start,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - start,
      }
    }
  }

  private async executeFile(type: ExecutionType, filePath: string, env: Record<string, string>): Promise<string> {
    switch (type) {
      case 'typescript':
        return this.runCommand(
          `npx esbuild "${filePath}" --bundle --platform=node --format=esm | node --input-type=module`,
          env,
        )
      case 'bash':
        if (process.platform === 'win32') {
          const wslDistro = await this.settings.get('wsl_distro')
          if (!wslDistro) {
            throw new Error('WSL not configured. Set WSL distribution in Settings to use bash sensors on Windows.')
          }
          const wslPath = filePath.replace(/\\/g, '/').replace(/^([A-Z]):/, '/mnt/$1'.toLowerCase())
          return this.runCommand(`wsl -d ${wslDistro} bash "${wslPath}"`, env)
        }
        return this.runCommand(`bash "${filePath}"`, env)
      case 'powershell':
        if (process.platform !== 'win32') {
          throw new Error('PowerShell execution is only available on Windows.')
        }
        return this.runCommand(`powershell -ExecutionPolicy Bypass -File "${filePath}"`, env)
      case 'docker':
        // For docker, read the file content and use it as the command spec
        const content = await readFile(filePath, 'utf-8')
        return this.executeDocker(content, env)
      default:
        throw new Error(`Unsupported execution type: ${type}`)
    }
  }

  private executeTypeScript(script: string, env: Record<string, string>): Promise<string> {
    return this.runInTempFile(script, 'ts', env, (filePath) => {
      return `npx esbuild "${filePath}" --bundle --platform=node --format=esm | node --input-type=module`
    })
  }

  private async executeBash(script: string, env: Record<string, string>): Promise<string> {
    if (process.platform === 'win32') {
      const wslDistro = await this.settings.get('wsl_distro')
      if (!wslDistro) {
        throw new Error('WSL not configured. Set WSL distribution in Settings to use bash sensors on Windows.')
      }
      return this.runInTempFile(script, 'sh', env, (filePath) => {
        const wslPath = filePath.replace(/\\/g, '/').replace(/^([A-Z]):/, '/mnt/$1'.toLowerCase())
        return `wsl -d ${wslDistro} bash "${wslPath}"`
      })
    }
    return this.runInTempFile(script, 'sh', env, (filePath) => `bash "${filePath}"`)
  }

  private executeDocker(script: string, env: Record<string, string>): Promise<string> {
    // Script content is the docker image/command specification
    const envFlags = Object.entries(env)
      .map(([k, v]) => `-e ${k}="${v}"`)
      .join(' ')
    return this.runCommand(`docker run --rm ${envFlags} ${script}`, env)
  }

  private executePowerShell(script: string, env: Record<string, string>): Promise<string> {
    if (process.platform !== 'win32') {
      throw new Error('PowerShell execution is only available on Windows.')
    }
    return this.runInTempFile(script, 'ps1', env, (filePath) => {
      return `powershell -ExecutionPolicy Bypass -File "${filePath}"`
    })
  }

  private async runInTempFile(
    script: string,
    ext: string,
    env: Record<string, string>,
    cmdBuilder: (filePath: string) => string,
  ): Promise<string> {
    const filePath = join(tmpdir(), `dash-sensor-${uuidv4()}.${ext}`)
    await writeFile(filePath, script, 'utf-8')
    try {
      return await this.runCommand(cmdBuilder(filePath), env)
    } finally {
      await unlink(filePath).catch(() => {})
    }
  }

  private runCommand(cmd: string, env: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        cmd,
        {
          env: { ...process.env, ...env },
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Execution failed: ${error.message}\nStderr: ${stderr}`))
          } else {
            resolve(stdout)
          }
        },
      )
    })
  }
}
