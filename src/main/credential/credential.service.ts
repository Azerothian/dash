import { Injectable, Inject } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import { DatabaseService } from '../database/database.service.js'
import type { Credential, CreateCredential, UpdateCredential } from '@shared/entities'

@Injectable()
export class CredentialService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
  ) {}

  async list(): Promise<Credential[]> {
    const rows = await this.db.all<Record<string, unknown>>('SELECT * FROM credential ORDER BY name')
    return rows.map(this.mapRow)
  }

  async get(id: string): Promise<Credential | undefined> {
    const row = await this.db.get<Record<string, unknown>>(
      'SELECT * FROM credential WHERE id = ?',
      id,
    )
    return row ? this.mapRow(row) : undefined
  }

  async create(data: CreateCredential): Promise<Credential> {
    const id = uuidv4()
    const now = new Date().toISOString()
    await this.db.run(
      `INSERT INTO credential (id, name, credential_type, config, env_var_map, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.name,
      data.credential_type,
      JSON.stringify(data.config),
      JSON.stringify(data.env_var_map || {}),
      now,
      now,
    )
    return (await this.get(id))!
  }

  async update(data: UpdateCredential): Promise<Credential> {
    const existing = await this.get(data.id)
    if (!existing) throw new Error(`Credential ${data.id} not found`)

    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.credential_type !== undefined) { fields.push('credential_type = ?'); values.push(data.credential_type) }
    if (data.config !== undefined) { fields.push('config = ?'); values.push(JSON.stringify(data.config)) }
    if (data.env_var_map !== undefined) { fields.push('env_var_map = ?'); values.push(JSON.stringify(data.env_var_map)) }

    if (fields.length > 0) {
      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(data.id)
      await this.db.run(`UPDATE credential SET ${fields.join(', ')} WHERE id = ?`, ...values)
    }

    return (await this.get(data.id))!
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM credential WHERE id = ?', id)
  }

  private mapRow(row: Record<string, unknown>): Credential {
    return {
      id: row.id as string,
      name: row.name as string,
      credential_type: row.credential_type as Credential['credential_type'],
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config as Credential['config'],
      env_var_map: typeof row.env_var_map === 'string' ? JSON.parse(row.env_var_map) : (row.env_var_map as Record<string, string>) || {},
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }
  }
}
