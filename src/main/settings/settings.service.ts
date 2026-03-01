import { Injectable, Inject } from '@nestjs/common'
import { DatabaseService } from '../database/database.service.js'
import { DEFAULT_SETTINGS } from '@shared/constants'
import type { Settings } from '@shared/entities'

@Injectable()
export class SettingsService {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
    const row = await this.db.get<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      key,
    )
    if (!row) return DEFAULT_SETTINGS[key]
    return JSON.parse(row.value)
  }

  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    const existing = await this.db.get('SELECT key FROM settings WHERE key = ?', key)
    if (existing) {
      await this.db.run(
        'UPDATE settings SET value = ?, updated_at = current_timestamp WHERE key = ?',
        JSON.stringify(value),
        key,
      )
    } else {
      await this.db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?)',
        key,
        JSON.stringify(value),
      )
    }
  }

  async getAll(): Promise<Settings> {
    const rows = await this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings')
    const settings = { ...DEFAULT_SETTINGS } as Settings
    for (const row of rows) {
      const key = row.key as keyof Settings
      if (key in settings) {
        ;(settings as Record<string, unknown>)[key] = JSON.parse(row.value)
      }
    }
    return settings
  }
}
