import { Module } from '@nestjs/common'
import { NotificationService } from './notification.service.js'
import { AlertModule } from '../alert/alert.module.js'
import { SettingsModule } from '../settings/settings.module.js'

@Module({
  imports: [AlertModule, SettingsModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
