import { Module } from '@nestjs/common'
import { CronManagerService } from './cron-manager.service.js'
import { SensorModule } from '../sensor/sensor.module.js'
import { AlertModule } from '../alert/alert.module.js'
import { NotificationModule } from '../notification/notification.module.js'

@Module({
  imports: [SensorModule, AlertModule, NotificationModule],
  providers: [CronManagerService],
  exports: [CronManagerService],
})
export class CronModule {}
