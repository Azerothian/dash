import { Module } from '@nestjs/common'
import { SensorService } from './sensor.service.js'
import { ExecutorService } from './executor.service.js'
import { SettingsModule } from '../settings/settings.module.js'

@Module({
  imports: [SettingsModule],
  providers: [SensorService, ExecutorService],
  exports: [SensorService, ExecutorService],
})
export class SensorModule {}
