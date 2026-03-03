import { Module } from '@nestjs/common'
import { MonitorService } from './monitor.service.js'
import { MonitorExecutorService } from './monitor-executor.service.js'
import { SensorModule } from '../sensor/sensor.module.js'
import { DatabaseModule } from '../database/database.module.js'
import { CredentialModule } from '../credential/credential.module.js'

@Module({
  imports: [SensorModule, DatabaseModule, CredentialModule],
  providers: [MonitorService, MonitorExecutorService],
  exports: [MonitorService, MonitorExecutorService],
})
export class MonitorModule {}
