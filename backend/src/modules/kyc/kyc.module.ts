import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminKycController, KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [PlatformModule, NotificationsModule],
  controllers: [KycController, AdminKycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
