import { Module } from '@nestjs/common'
import { CredentialService } from './credential.service.js'
import { DatabaseModule } from '../database/database.module.js'

@Module({
  imports: [DatabaseModule],
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialModule {}
