import { Injectable } from '@nestjs/common'
import { exec } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'
import { JSONPath } from 'jsonpath-plus'
import type { ExecutionType } from '@shared/entities'
import { SettingsService } from '../settings/settings.service.js'

export interface ExecutionResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  duration: number
}

@Injectable()
export class ExecutorService {
  constructor(private settings: SettingsService) {}

  async execute(
    type: ExecutionType,
    script: string,
    jsonSelector: string,
    envVars: Record<string, string>,
  ): Promise<ExecutionResult> {
    const start = Date.now()
    try {
      // Merge global env vars (sensor-specific wins on conflict)
      const globalVars = await this.settings.get('global_env_vars')
      const mergedEnv = { ...globalVars, ...envVars }

      let rawOutput: string
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

      const parsed = JSON.parse(rawOutput.trim())
      const selected = jsonSelector && jsonSelector !== '$'
        ? JSONPath({ path: jsonSelector, json: parsed, wrap: false })
        : parsed

      return {
        success: true,
        data: typeof selected === 'object' ? selected : { value: selected },
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
