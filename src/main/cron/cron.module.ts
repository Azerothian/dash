import { Module } from '@nestjs/common'
import { CronManagerService } from './cron-manager.service.js'
import { SensorModule } from '../sensor/sensor.module.js'
import { AlertModule } from '../alert/alert.module.js'
import { NotificationModule } from '../notification/notification.module.js'
import { MonitorModule } from '../monitor/monitor.module.js'
import { DatabaseModule } from '../database/database.module.js'

@Module({
  imports: [SensorModule, AlertModule, NotificationModule, MonitorModule, DatabaseModule],
  providers: [CronManagerService],
  exports: [CronManagerService],
})
export class CronModule {}
