import { Module } from '@nestjs/common'
import { AlertService } from './alert.service.js'
import { SensorModule } from '../sensor/sensor.module.js'

@Module({
  imports: [SensorModule],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
