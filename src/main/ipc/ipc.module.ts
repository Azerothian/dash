import { Module } from '@nestjs/common'
import { IpcBridgeService } from './ipc-bridge.service.js'
import { SettingsModule } from '../settings/settings.module.js'
import { SensorModule } from '../sensor/sensor.module.js'
import { AlertModule } from '../alert/alert.module.js'
import { DashboardModule } from '../dashboard/dashboard.module.js'
import { NotificationModule } from '../notification/notification.module.js'
import { MonitorModule } from '../monitor/monitor.module.js'
import { CredentialModule } from '../credential/credential.module.js'
import { CronModule } from '../cron/cron.module.js'

@Module({
  imports: [SettingsModule, SensorModule, AlertModule, DashboardModule, NotificationModule, MonitorModule, CredentialModule, CronModule],
  providers: [IpcBridgeService],
  exports: [IpcBridgeService],
})
export class IpcModule {}
