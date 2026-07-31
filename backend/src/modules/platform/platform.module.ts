import { Global, Module } from '@nestjs/common';
import { PlatformLimitsService } from './platform-limits.service';
import { PlatformService } from './platform.service';
import { TelegramAdminService } from './telegram-admin.service';

@Global()
@Module({
  providers: [PlatformService, TelegramAdminService, PlatformLimitsService],
  exports: [PlatformService, TelegramAdminService, PlatformLimitsService],
})
export class PlatformModule {}
