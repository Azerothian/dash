import { Module } from '@nestjs/common'
import { MonitorService } from './monitor.service.js'
import { MonitorExecutorService } from './monitor-executor.service.js'
import { SensorModule } from '../sensor/sensor.module.js'
import { DatabaseModule } from '../database/database.module.js'

@Module({
  imports: [SensorModule, DatabaseModule],
  providers: [MonitorService, MonitorExecutorService],
  exports: [MonitorService, MonitorExecutorService],
})
export class MonitorModule {}
