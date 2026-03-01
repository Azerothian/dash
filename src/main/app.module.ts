import { Module } from '@nestjs/common'
import { DatabaseModule } from './database/database.module.js'
import { SettingsModule } from './settings/settings.module.js'
import { SensorModule } from './sensor/sensor.module.js'
import { AlertModule } from './alert/alert.module.js'
import { DashboardModule } from './dashboard/dashboard.module.js'
import { NotificationModule } from './notification/notification.module.js'
import { CronModule } from './cron/cron.module.js'
import { IpcModule } from './ipc/ipc.module.js'

@Module({
  imports: [DatabaseModule, SettingsModule, SensorModule, AlertModule, DashboardModule, NotificationModule, CronModule, IpcModule],
})
export class AppModule {}
